import { normalizeUrl } from './netguard.mjs'
import { toCdp, VIEWPORT } from './input.mjs'
import { capture, createSink, destroySink } from './audio.mjs'

// Binary messages to viewers start with a type byte.
export const FRAME = 1
export const AUDIO = 2
const tagged = (type, buf) => Buffer.concat([Buffer.from([type]), buf])

/**
 * One shared browser tab per office screen: its own incognito context, a JPEG
 * screencast broadcast to every viewer, and input from controllers only.
 */
export class BrowserSession {
  /** @param {(opts: { env: object }) => Promise<import('puppeteer-core').Browser>} launch */
  constructor(launch, { screenId, key, startUrl, log, audio = true }) {
    this.launch = launch
    this.audioEnabled = audio
    this.screenId = screenId
    this.key = key
    this.startUrl = startUrl
    this.log = log ?? (() => {})
    this.viewers = new Set()
    this.lastFrame = null
    this.info = { t: 'info', url: startUrl, title: '', loading: true, fullscreen: false }
    this.mouse = { buttons: 0 }
    this.closed = false
    this.idleTimer = null
    this.cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }
    this.lastCursorSent = 0
  }

  async start() {
    // Each tab gets its own Chromium process so its sound goes to its own sink.
    const sinkName = `office_${this.screenId.replace(/[^A-Za-z0-9_]/g, '_')}_${Date.now().toString(36)}`
    this.sink = this.audioEnabled ? await createSink(sinkName) : null
    this.browser = await this.launch({ env: this.sink ? { ...process.env, PULSE_SINK: this.sink.name } : process.env })
    this.browser.on('disconnected', () => void this.close())
    if (this.sink) this.stopAudio = capture(this.sink, (pcm) => this.broadcast(tagged(AUDIO, pcm), (ws) => ws.audioOn !== false))
    this.log('session', this.screenId, this.sink ? `audio via ${this.sink.name}` : 'no audio')
    this.context = await this.browser.createBrowserContext()
    const page = (this.page = await this.context.newPage())
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 })
    const cdp = (this.cdp = await page.createCDPSession())
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
      this.lastFrame = tagged(FRAME, Buffer.from(data, 'base64'))
      this.broadcast(this.lastFrame)
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 })

    page.on('dialog', (d) => d.dismiss().catch(() => {}))
    // Tell viewers when the page goes fullscreen (e.g. a video's ⛶ button), even inside iframes.
    await page.exposeFunction('__officeFullscreen', (on) => this.setInfo({ fullscreen: !!on })).catch(() => {})
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('fullscreenchange', () => window.__officeFullscreen?.(!!document.fullscreenElement), true)
    })
    // target=_blank / window.open: keep everything in this one shared tab.
    page.on('popup', async (popup) => {
      const url = popup?.url()
      await popup?.close().catch(() => {})
      if (url && url !== 'about:blank') this.navigate(url)
    })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) this.setInfo({ url: frame.url(), loading: true, fullscreen: false })
    })
    page.on('load', async () => this.setInfo({ title: await page.title().catch(() => ''), loading: false }))
    await this.navigate(this.startUrl)
  }

  setInfo(patch) {
    this.info = { ...this.info, ...patch }
    this.broadcast(JSON.stringify(this.info))
  }

  async navigate(input) {
    const url = normalizeUrl(input)
    if (!url) return this.send({ t: 'error', message: 'Можно открывать только http(s)-ссылки' })
    this.setInfo({ url, loading: true })
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch (e) {
      this.log('navigation failed', url, e.message)
      this.setInfo({ loading: false })
      this.send({ t: 'error', message: 'Страница не открылась (или заблокирована политикой сети офиса)' })
    }
  }

  /** Handles a message from a viewer; only controllers may drive the page. */
  async handle(msg, canControl, ws) {
    if (this.closed) return
    // Anyone may mute the tab for themselves (saves bandwidth too).
    if (msg?.t === 'audio') {
      ws.audioOn = msg.on !== false
      return
    }
    if (!canControl) return
    switch (msg?.t) {
      case 'nav':
        return this.navigate(msg.url)
      case 'back':
        return this.page.goBack({ timeout: 10000 }).catch(() => {})
      case 'forward':
        return this.page.goForward({ timeout: 10000 }).catch(() => {})
      case 'reload':
        return this.page.reload({ timeout: 20000 }).catch(() => {})
      case 'exitFullscreen':
        return this.page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {})
      default: {
        const cmd = toCdp(msg, this.mouse)
        if (!cmd) return
        // Everyone sees where the presenter's cursor is.
        if (msg.t === 'mouse' || msg.t === 'wheel') {
          this.cursor = { x: cmd.params.x, y: cmd.params.y }
          const now = Date.now()
          if (now - this.lastCursorSent > 50) {
            this.lastCursorSent = now
            this.send({ t: 'cursor', ...this.cursor })
          }
        }
        await this.cdp.send(cmd.method, cmd.params).catch(() => {})
      }
    }
  }

  addViewer(ws) {
    clearTimeout(this.idleTimer)
    this.viewers.add(ws)
    ws.send(JSON.stringify(this.info))
    ws.send(JSON.stringify({ t: 'cursor', ...this.cursor }))
    if (this.lastFrame) ws.send(this.lastFrame)
  }

  /**
   * The tab keeps playing with nobody watching (the presenter may walk away);
   * Phoenix closes it when the screen is released. This is only a safety net.
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
