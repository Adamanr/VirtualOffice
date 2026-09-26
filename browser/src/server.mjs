import http from 'node:http'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { WebSocketServer } from 'ws'
import { startProxy } from './proxy.mjs'
import { BrowserSession } from './session.mjs'
import { verify } from './token.mjs'

const PORT = Number(process.env.PORT ?? 4100)
const SECRET = process.env.BROWSER_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'dev-browser-secret')
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS ?? 6)
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1'
const IDLE_MS = Number(process.env.IDLE_MS ?? 30 * 60_000)
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((p) => existsSync(p))

if (!SECRET) throw new Error('BROWSER_SECRET is required')
const log = (...args) => console.log(new Date().toISOString(), ...args)

const proxy = await startProxy({ allowPrivate: ALLOW_PRIVATE, log })
const proxyPort = proxy.address().port

const AUDIO = process.env.AUDIO !== '0'

/** One Chromium per tab (so each tab's sound can go to its own audio sink). */
function launch({ env }) {
  return puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    env,
    // We set the page size ourselves (see BrowserSession.applyQuality).
    defaultViewport: null,
    // Puppeteer mutes headless Chromium by default; we capture the tab's sound.
    ignoreDefaultArgs: ['--mute-audio'],
    args: [
      `--proxy-server=http://127.0.0.1:${proxyPort}`,
      // Force even localhost through the proxy (Chromium bypasses loopback by default).
      '--proxy-bypass-list=<-loopback>',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--no-first-run',
      '--lang=ru-RU,ru,en',
      `--window-size=${1280},${800}`,
    ],
  })
}

/** screenId → session */
const sessions = new Map()

async function sessionFor(claim) {
  const existing = sessions.get(claim.s)
  if (existing && existing.key === claim.k && !existing.closed) return existing
  if (!claim.c) return null // only the presenter starts a browser
  if (existing) await existing.close()
  if (sessions.size >= MAX_SESSIONS) throw new Error('busy')
  const session = new BrowserSession(launch, { screenId: claim.s, key: claim.k, startUrl: claim.u, log, audio: AUDIO })
  sessions.set(claim.s, session)
  try {
    await session.start()
  } catch (e) {
    sessions.delete(claim.s)
    await session.close()
    throw e
  }
  return session
}

/** Phoenix tells us when a screen's browser ended (released, taken over, owner left). */
async function closeRequest(req, res) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 8192) return res.writeHead(413).end()
  }
  let claim = null
  try {
    claim = verify(JSON.parse(body).token, SECRET)
  } catch {
    /* bad json */
  }
  if (!claim || claim.k !== '*close*') return res.writeHead(401).end()
  const session = sessions.get(claim.s)
  if (session) {
    sessions.delete(claim.s)
    await session.close()
    log('closed by office', claim.s)
  }
  res.writeHead(204).end()
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/browser/close') {
    void closeRequest(req, res)
    return
  }
  if (req.url === '/browser/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, sessions: sessions.size, chromium: !!CHROMIUM }))
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', 'http://x')
  const claim = url.pathname === '/browser/ws' ? verify(url.searchParams.get('token'), SECRET) : null
  if (!claim) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n')
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, claim))
})

async function onConnection(ws, claim) {
  let session
  try {
    session = await sessionFor(claim)
  } catch (e) {
    ws.close(4003, e.message === 'busy' ? 'busy' : 'browser unavailable')
    log('session failed', claim.s, e.message)
    return
  }
  if (!session) {
    ws.close(4004, 'not started')
    return
  }
  session.addViewer(ws)
  let budget = 300
  const refill = setInterval(() => (budget = 300), 1000)
  ws.on('message', (data, isBinary) => {
    if (isBinary || --budget < 0) return
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    void session.handle(msg, claim.c === true, ws)
  })
  ws.on('close', () => {
    clearInterval(refill)
    session.removeViewer(
      ws,
      () => {
        if (sessions.get(session.screenId) === session) sessions.delete(session.screenId)
        void session.close()
      },
      IDLE_MS,
    )
  })
}

server.listen(PORT, () => log(`office browser on :${PORT} (chromium: ${CHROMIUM ?? 'NOT FOUND'}, proxy :${proxyPort}, private: ${ALLOW_PRIVATE})`))

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    for (const s of sessions.values()) await s.close()
    process.exit(0)
  })
}
