import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Access tokens issued by Phoenix (Office.BrowserToken):
 *   base64url(json payload) + "." + base64url(HMAC-SHA256(secret, first part))
 * Payload: { s: screenId, p: playerId, c: canControl, k: claimKey, u: startUrl, e: expiresAtSeconds }
 */
const b64url = (buf) => Buffer.from(buf).toString('base64url')

export function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${b64url(createHmac('sha256', secret).update(body).digest())}`
}

export function verify(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string') return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload?.e !== 'number' || payload.e < nowSeconds) return null
  if (typeof payload.s !== 'string' || typeof payload.p !== 'string' || typeof payload.u !== 'string') return null
  return payload
}
