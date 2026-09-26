import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { test } from 'node:test'
import { startProxy, splitHostPort } from '../src/proxy.mjs'

function connectVia(port, authority) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`))
    s.once('data', (d) => {
      resolve(d.toString().split('\r\n')[0])
      s.destroy()
    })
    s.on('error', () => resolve('error'))
  })
}

test('the proxy tunnels nothing to internal addresses', async () => {
  // A local server the page must NOT be able to reach.
  const secret = http.createServer((_, res) => res.end('internal')).listen(0, '127.0.0.1')
  await new Promise((r) => secret.once('listening', r))
  const proxy = await startProxy()
  const port = proxy.address().port
  try {
    for (const target of [`127.0.0.1:${secret.address().port}`, `localhost:${secret.address().port}`, '169.254.169.254:80', '[::1]:443', '10.0.0.1:443']) {
      assert.match(await connectVia(port, target), /403/, target)
    }
    // Plain-HTTP forward requests are filtered too.
    const status = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port, path: `http://127.0.0.1:${secret.address().port}/` }, (res) => resolve(res.statusCode)).on('error', () => resolve(0))
    })
    assert.equal(status, 403)
  } finally {
    proxy.close()
    secret.close()
  }
})

test('parses CONNECT authorities', () => {
  assert.deepEqual(splitHostPort('example.com:443'), ['example.com', '443'])
  assert.deepEqual(splitHostPort('[::1]:8443'), ['::1', '8443'])
})
