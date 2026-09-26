import { normalizeUrl } from './netguard.mjs'
import { toCdp, VIEWPORT } from './input.mjs'
import { capture, createSink, destroySink } from './audio.mjs'

// Binary messages to viewers start with a type byte.
export const FRAME = 1
export const AUDIO = 2
const tagged = (type, buf) => Buffer.concat([Buffer.from([type]), buf])

export const MAX_TABS = 8
let tabSeq = 0

/**
 * The shared browser of one office screen: its own Chromium (so its sound
 * goes to its own audio sink), several tabs, a JPEG screencast of the active
 * tab broadcast to every viewer, and input from controllers only.
 */
/**
 * A desktop Chrome identity, client hints included: with a bare UA string
 * Chromium sends no Sec-CH-UA and an empty navigator.userAgentData, which
 * YouTube & co. treat as a bot ("Something went wrong", "confirm you're not a bot").
 */
export function userAgentOverride(userAgent, fullVersion) {
  const major = fullVersion.split('.')[0]
  const brands = [
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
    { brand: 'Not.A/Brand', version: '99' },
  ]
  return {
    userAgent,
    acceptLanguage: 'ru-RU,ru,en-US,en',
    platform: 'Linux x86_64',
    userAgentMetadata: {
      brands,
      fullVersionList: brands.map((b) => ({ ...b, version: b.brand === 'Not.A/Brand' ? '99.0.0.0' : fullVersion })),
      fullVersion,
      platform: 'Linux',
      platformVersion: '',
      architecture: 'x86',
      bitness: '64',
      model: '',
      mobile: false,
      wow64: false,
    },
  }
}

export class BrowserSession {
  /**
   * @param {(opts: { env: object }) => Promise<import('puppeteer-core').Browser>} launch
   * @param {{ screenId: string, key: string, startUrl: string, log?: Function, audio?: boolean, extensions?: import('./extensions.mjs').ExtensionStore | null }} opts
   */
  constructor(launch, { screenId, key, startUrl, log, audio = true, extensions = null }) {
    this.launch = launch
    this.audioEnabled = audio
    this.store = extensions
    this.screenId = screenId
    this.key = key
    this.startUrl = startUrl
    this.log = log ?? (() => {})
    this.viewers = new Set()
    this.lastFrame = null
    /** @type {{ id: string, page: any, cdp: any, url: string, title: string, loading: boolean, fullscreen: boolean }[]} */
    this.tabs = []
    this.active = null
    /** Web Store id → id of the loaded (unpacked) extension in this browser. */
    this.runtimeIds = new Map()
    this.mouse = { buttons: 0 }
    this.closed = false
    this.hq = null
    this.inputScale = 1
    this.idleTimer = null
    this.cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }
    this.lastCursorSent = 0
  }

  async start() {
    const sinkName = `office_${this.screenId.replace(/[^A-Za-z0-9_]/g, '_')}_${Date.now().toString(36)}`
    this.sink = this.audioEnabled ? await createSink(sinkName) : null
    this.browser = await this.launch({ env: this.sink ? { ...process.env, PULSE_SINK: this.sink.name } : process.env })
    this.browser.on('disconnected', () => void this.close())
    if (this.sink) this.stopAudio = capture(this.sink, (pcm) => this.broadcast(tagged(AUDIO, pcm), (ws) => ws.audioOn !== false))
    // A regular Chrome user agent: sites (YouTube…) treat "HeadlessChrome" as a bot.
    this.userAgent = (await this.browser.userAgent()).replace('HeadlessChrome', 'Chrome')
    this.chromeVersion = /Chrome\/([\d.]+)/.exec(this.userAgent)?.[1] ?? '130.0.0.0'
    this.log('session', this.screenId, this.sink ? `audio via ${this.sink.name}` : 'no audio')
    for (const ext of this.store?.list() ?? []) await this.loadExtension(ext)
    // Pages created by Chromium itself (target=_blank, window.open) become tabs.
    this.browser.on('targetcreated', async (target) => {
      if (target.type() !== 'page' || this.adopting) return
      const page = await target.page().catch(() => null)
      if (page && !this.tabs.some((t) => t.page === page)) await this.adopt(page, true)
    })
    const first = (await this.browser.pages())[0]
    this.adopting = true
    const tab = first ? await this.adopt(first, true) : await this.newTab(null)
    this.adopting = false
    await this.navigate(this.startUrl, tab)
  }

  // --- tabs ---------------------------------------------------------------------------------

  async newTab(url) {
    if (this.tabs.length >= MAX_TABS) {
      this.send({ t: 'error', message: `Не больше ${MAX_TABS} вкладок` })
      return this.active
    }
    this.adopting = true
    const page = await this.browser.newPage()
    this.adopting = false
    const tab = await this.adopt(page, true)
    if (url) await this.navigate(url, tab)
    return tab
  }

  /** Wires a page up as a tab (screencast, fullscreen tracking, info) and optionally activates it. */
  async adopt(page, activate) {
    if (this.tabs.length >= MAX_TABS) {
      await page.close().catch(() => {})
      return this.active
    }
    const tab = { id: `t${++tabSeq}`, page, cdp: null, url: page.url(), title: '', loading: false, fullscreen: false }
    this.tabs.push(tab)
    tab.cdp = await page.createCDPSession()
    await tab.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
    await tab.cdp.send('Emulation.setUserAgentOverride', userAgentOverride(this.userAgent, this.chromeVersion)).catch(() => {})
    tab.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      tab.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
      if (tab !== this.active) return
      this.lastFrame = tagged(FRAME, Buffer.from(data, 'base64'))
      this.broadcast(this.lastFrame)
    })
    page.on('dialog', (d) => d.dismiss().catch(() => {}))
    // Fullscreen (a video's ⛶), even from inside iframes.
    await page
      .exposeFunction('__officeFullscreen', (on) => {
        tab.fullscreen = !!on
        if (tab === this.active) void this.applyQuality(tab.fullscreen, true)
        this.sendInfo()
      })
      .catch(() => {})
    await page
      .evaluateOnNewDocument(() => {
        document.addEventListener('fullscreenchange', () => window.__officeFullscreen?.(!!document.fullscreenElement), true)
        // Pages check this to tell automated browsers apart.
        Object.defineProperty(navigator, 'webdriver', { get: () => false })
      })
      .catch(() => {})
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return
      Object.assign(tab, { url: frame.url(), loading: true, fullscreen: false })
      this.sendInfo()
    })
    page.on('load', async () => {
      tab.title = await page.title().catch(() => '')
      tab.loading = false
      this.sendInfo()
    })
    page.on('close', () => void this.dropTab(tab))
    if (activate) await this.activate(tab)
    else this.sendInfo()
    return tab
  }

  async activate(tab) {
    if (!tab || this.closed) return
    const prev = this.active
    if (prev && prev !== tab) await prev.cdp.send('Page.stopScreencast').catch(() => {})
    this.active = tab
    this.hq = null // force: metrics + screencast for this tab
    await tab.page.bringToFront().catch(() => {})
    await this.applyQuality(tab.fullscreen)
    this.sendInfo()
  }

  async closeTab(id) {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    // Never leave the screen without a tab.
    if (this.tabs.length === 1) {
      await this.navigate(this.startUrl, tab)
      return
    }
    await tab.page.close().catch(() => {})
    await this.dropTab(tab)
  }

  async dropTab(tab) {
    const i = this.tabs.indexOf(tab)
    if (i < 0) return
    this.tabs.splice(i, 1)
    if (this.active === tab) await this.activate(this.tabs[Math.max(0, i - 1)] ?? null)
    else this.sendInfo()
  }

  async switchTab(delta) {
    if (this.tabs.length < 2 || !this.active) return
    const i = this.tabs.indexOf(this.active)
    await this.activate(this.tabs[(i + delta + this.tabs.length) % this.tabs.length])
  }

  // --- rendering ----------------------------------------------------------------------------

  /**
   * Page size and the "monitor" it believes it's on. The screen must match the
   * viewport, or fullscreen players size themselves to headless Chromium's
   * default 800×600 screen and sit off-center. While the active tab is
   * fullscreen (a video) it becomes 1920×1200 and frames get sharper. Viewers
   * keep sending 1280×800 coordinates; `inputScale` maps them.
   */
  async applyQuality(hq, force = false) {
    const tab = this.active
    if (!tab || this.closed || (this.hq === hq && !force)) return
    this.hq = hq
    const scale = hq ? 1.5 : 1
    const width = Math.round(VIEWPORT.width * scale)
    const height = Math.round(VIEWPORT.height * scale)
    this.inputScale = scale
    await tab.cdp
      .send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height })
      .catch(() => {})
    await tab.cdp.send('Page.stopScreencast').catch(() => {})
    await tab.cdp
      .send('Page.startScreencast', { format: 'jpeg', quality: hq ? 82 : 72, maxWidth: width, maxHeight: height, everyNthFrame: 1 })
      .catch(() => {})
  }

  info() {
    const a = this.active
    return {
      t: 'info',
      url: a?.url ?? '',
      title: a?.title ?? '',
      loading: !!a?.loading,
      fullscreen: !!a?.fullscreen,
      activeTab: a?.id ?? null,
      tabs: this.tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })),
      extensions: (this.store?.list() ?? []).map((e) => ({ id: e.id, name: e.name, version: e.version, popup: !!e.popup, options: !!e.options })),
    }
  }

  sendInfo() {
    this.broadcast(JSON.stringify(this.info()))
  }

  async navigate(input, tab = this.active) {
    const url = normalizeUrl(input)
    if (!tab) return
    if (!url) return this.send({ t: 'error', message: 'Можно открывать только http(s)-ссылки' })
    Object.assign(tab, { url, loading: true })
    this.sendInfo()
    try {
      await tab.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch (e) {
      this.log('navigation failed', url, e.message)
      tab.loading = false
      this.sendInfo()
      this.send({ t: 'error', message: 'Страница не открылась (или заблокирована политикой сети офиса)' })
    }
  }

  // --- extensions ---------------------------------------------------------------------------

  async loadExtension(ext) {
    try {
      const runtimeId = await this.browser.installExtension(ext.dir)
      this.runtimeIds.set(ext.id, runtimeId)
    } catch (e) {
      this.log('extension load failed', ext.id, e.message)
    }
  }

  async unloadExtension(id) {
    const runtimeId = this.runtimeIds.get(id)
    this.runtimeIds.delete(id)
    if (runtimeId) await this.browser.uninstallExtension(runtimeId).catch(() => {})
    this.sendInfo()
  }

  /** Opens an extension's popup or options page as a tab (popups can't be screencast). */
  async openExtensionPage(id, which) {
    const ext = this.store?.list().find((e) => e.id === id)
    const runtimeId = this.runtimeIds.get(id)
    const page = ext && (which === 'options' ? ext.options : ext.popup)
    if (!runtimeId || !page) return
    const tab = await this.newTab(null)
    await tab?.page.goto(`chrome-extension://${runtimeId}/${page}`).catch(() => {})
  }

  // --- viewers ------------------------------------------------------------------------------

  /** Handles a message from a viewer; only controllers may drive the page. */
  async handle(msg, canControl, ws, hooks = {}) {
    if (this.closed) return
    // Anyone may mute the tab for themselves (saves bandwidth too).
    if (msg?.t === 'audio') {
      ws.audioOn = msg.on !== false
      return
    }
    if (!canControl) return
    const page = this.active?.page
    switch (msg?.t) {
      case 'nav':
        return this.navigate(msg.url)
      case 'back':
        return page?.goBack({ timeout: 10000 }).catch(() => {})
      case 'forward':
        return page?.goForward({ timeout: 10000 }).catch(() => {})
      case 'reload':
        return page?.reload({ timeout: 20000 }).catch(() => {})
      case 'exitFullscreen':
        return page?.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {})
      case 'tab_new':
        return this.newTab(typeof msg.url === 'string' && msg.url ? msg.url : 'https://duckduckgo.com/')
      case 'tab_close':
        return this.closeTab(msg.id ?? this.active?.id)
      case 'tab_switch':
        if (typeof msg.delta === 'number') return this.switchTab(Math.sign(msg.delta))
        return this.activate(this.tabs.find((t) => t.id === msg.id))
      case 'ext_install':
        return hooks.installExtension?.(msg.id)
      case 'ext_remove':
        return hooks.removeExtension?.(msg.id)
      case 'ext_open':
        return this.openExtensionPage(msg.id, msg.page === 'options' ? 'options' : 'popup')
      default: {
        const cmd = toCdp(msg, this.mouse)
        if (!cmd || !this.active) return
        // Everyone sees where the presenter's cursor is.
        if (msg.t === 'mouse' || msg.t === 'wheel') {
          this.cursor = { x: cmd.params.x, y: cmd.params.y }
          const now = Date.now()
          if (now - this.lastCursorSent > 50) {
            this.lastCursorSent = now
            this.send({ t: 'cursor', ...this.cursor })
          }
        }
        // Viewers speak 1280×800; the page may be bigger while fullscreen.
        const params = 'x' in cmd.params ? { ...cmd.params, x: cmd.params.x * this.inputScale, y: cmd.params.y * this.inputScale } : cmd.params
        await this.active.cdp.send(cmd.method, params).catch(() => {})
      }
    }
  }

  addViewer(ws) {
    clearTimeout(this.idleTimer)
    this.viewers.add(ws)
    ws.send(JSON.stringify(this.info()))
    ws.send(JSON.stringify({ t: 'cursor', ...this.cursor }))
    if (this.lastFrame) ws.send(this.lastFrame)
  }

  /**
   * The browser keeps playing with nobody watching (the presenter may walk
   * away); Phoenix closes it when the screen is released. This is a safety net.
   */
  removeViewer(ws, onIdle, idleMs) {
    this.viewers.delete(ws)
    if (this.viewers.size === 0) this.idleTimer = setTimeout(onIdle, idleMs)
  }

  send(msg) {
    this.broadcast(JSON.stringify(msg))
  }

  broadcast(data, filter = () => true) {
    for (const ws of this.viewers) {
      if (!filter(ws)) continue
      // Slow viewers skip frames instead of queueing seconds of video.
      if (typeof data !== 'string' && ws.bufferedAmount > 1_500_000) continue
      if (ws.readyState === 1) ws.send(data)
    }
  }

  async close() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.idleTimer)
    for (const ws of this.viewers) ws.close(4000, 'session closed')
    this.viewers.clear()
    this.stopAudio?.()
    await this.browser?.close().catch(() => {})
    await destroySink(this.sink)
  }
}
