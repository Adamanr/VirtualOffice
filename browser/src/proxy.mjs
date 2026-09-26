import http from 'node:http'
import net from 'node:net'
import { resolvePublic } from './netguard.mjs'

/**
 * Forward proxy the headless Chromium is forced through (--proxy-server with
 * loopback not bypassed). It resolves every host itself and connects to the
 * vetted IP, so the page cannot reach internal services — not via fetch, not
 * via WebSocket, not via DNS rebinding.
 */
const BLOCKED_PAGE = `<!doctype html><meta charset="utf-8"><title>Недоступно</title>
<body style="font:16px system-ui;display:grid;place-items:center;height:90vh;color:#333;background:#f6f5f1">
<div style="text-align:center"><div style="font-size:64px">🚫</div><h2>Этот адрес недоступен из офисного браузера</h2>
<p>Можно открывать только сайты в интернете — внутренняя сеть и localhost закрыты.</p></div></body>`

export function startProxy({ port = 0, allowPrivate = false, log = () => {} } = {}) {
  const server = http.createServer(async (req, res) => {
    // Plain HTTP: absolute-form request URI.
    let target
    try {
      target = new URL(req.url)
    } catch {
      res.writeHead(400).end()
      return
    }
    const ip = await resolvePublic(target.hostname, { allowPrivate })
    if (!ip || target.protocol !== 'http:') {
      log('blocked', target.hostname)
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' }).end(BLOCKED_PAGE)
      return
    }
    const upstream = http.request(
      { host: ip, port: target.port || 80, method: req.method, path: target.pathname + target.search, headers: { ...req.headers, host: target.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', () => res.writeHead(502).end())
    req.pipe(upstream)
  })

  // HTTPS / WSS tunnels.
  server.on('connect', async (req, socket, head) => {
    const [host, portText] = splitHostPort(req.url ?? '')
    const port = Number(portText || 443)
    const ip = host && Number.isInteger(port) && port > 0 && port < 65536 ? await resolvePublic(host, { allowPrivate }) : null
    if (!ip) {
      log('blocked', host)
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    const upstream = net.connect(port, ip, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    const close = () => {
      upstream.destroy()
      socket.destroy()
    }
    upstream.on('error', close)
    socket.on('error', close)
  })

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

export function splitHostPort(authority) {
  const m = /^\[([^\]]+)\]:(\d+)$/.exec(authority) ?? /^([^:]+):(\d+)$/.exec(authority)
  return m ? [m[1], m[2]] : [authority, '']
}
