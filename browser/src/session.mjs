import { normalizeUrl } from './netguard.mjs'
import { toCdp, VIEWPORT } from './input.mjs'

/**
 * One shared browser tab per office screen: its own incognito context, a JPEG
 * screencast broadcast to every viewer, and input from controllers only.
 */
export class BrowserSession {
  /** @param {import('puppeteer-core').Browser} browser */
  constructor(browser, { screenId, key, startUrl, log }) {
    this.browser = browser
    this.screenId = screenId
    this.key = key
    this.startUrl = startUrl
    this.log = log ?? (() => {})
    this.viewers = new Set()
    this.lastFrame = null
    this.info = { t: 'info', url: startUrl, title: '', loading: true }
    this.mouse = { buttons: 0 }
    this.closed = false
    this.idleTimer = null
  }

  async start() {
    this.context = await this.browser.createBrowserContext()
    const page = (this.page = await this.context.newPage())
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 })
    const cdp = (this.cdp = await page.createCDPSession())
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
      this.lastFrame = Buffer.from(data, 'base64')
      this.broadcast(this.lastFrame)
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 })

    page.on('dialog', (d) => d.dismiss().catch(() => {}))
    // target=_blank / window.open: keep everything in this one shared tab.
    page.on('popup', async (popup) => {
      const url = popup?.url()
      await popup?.close().catch(() => {})
      if (url && url !== 'about:blank') this.navigate(url)
    })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) this.setInfo({ url: frame.url(), loading: true })
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
  async handle(msg, canControl) {
    if (!canControl || this.closed) return
    switch (msg?.t) {
      case 'nav':
        return this.navigate(msg.url)
      case 'back':
        return this.page.goBack({ timeout: 10000 }).catch(() => {})
      case 'forward':
        return this.page.goForward({ timeout: 10000 }).catch(() => {})
      case 'reload':
        return this.page.reload({ timeout: 20000 }).catch(() => {})
      default: {
        const cmd = toCdp(msg, this.mouse)
        if (cmd) await this.cdp.send(cmd.method, cmd.params).catch(() => {})
      }
    }
  }

  addViewer(ws) {
    clearTimeout(this.idleTimer)
    this.viewers.add(ws)
    ws.send(JSON.stringify(this.info))
    if (this.lastFrame) ws.send(this.lastFrame)
  }

  removeViewer(ws, onIdle) {
    this.viewers.delete(ws)
    if (this.viewers.size === 0) this.idleTimer = setTimeout(onIdle, 60_000)
  }

  send(msg) {
    this.broadcast(JSON.stringify(msg))
  }

  broadcast(data) {
    for (const ws of this.viewers) {
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
    await this.context?.close().catch(() => {})
  }
}
