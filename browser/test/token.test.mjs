import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sign, verify } from '../src/token.mjs'

export const VECTOR = {
  secret: 'test-secret',
  payload: { s: 'desk_01_monitor', p: 'player-1', c: true, k: 'player-1', u: 'https://example.com/', e: 4102444800 },
}

test('round-trips and rejects tampering, wrong secret and expiry', () => {
  const t = sign(VECTOR.payload, VECTOR.secret)
  assert.deepEqual(verify(t, VECTOR.secret), VECTOR.payload)
  assert.equal(verify(t, 'other'), null)
  const [body, mac] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ ...VECTOR.payload, c: true, p: 'evil' })).toString('base64url')
  assert.equal(verify(`${forged}.${mac}`, VECTOR.secret), null)
  assert.equal(verify(`${body}.`, VECTOR.secret), null)
  assert.equal(verify(sign({ ...VECTOR.payload, e: 1 }, VECTOR.secret), VECTOR.secret), null)
  assert.equal(verify('garbage', VECTOR.secret), null)
})

// Same vector as server/test/office/browser_token_test.exs: Office.BrowserToken.sign/2 must produce it.
export const PHOENIX_TOKEN =
  'eyJjIjp0cnVlLCJlIjo0MTAyNDQ0ODAwLCJrIjoicGxheWVyLTEiLCJwIjoicGxheWVyLTEiLCJzIjoiZGVza18wMV9tb25pdG9yIiwidSI6Imh0dHBzOi8vZXhhbXBsZS5jb20vIn0.IiiNsNd9lBJco9zfI9atZ4TOjE2NZJ516oW1_VbCIFM'

test('verifies a token signed by Phoenix (Office.BrowserToken)', () => {
  assert.deepEqual(verify(PHOENIX_TOKEN, VECTOR.secret), VECTOR.payload)
})
