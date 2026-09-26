import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBlockedIp, normalizeUrl, resolvePublic } from '../src/netguard.mjs'

test('blocks internal addresses, allows public ones', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.50.229', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])
    assert.equal(isBlockedIp(ip), true, ip)
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isBlockedIp(ip), false, ip)
  assert.equal(isBlockedIp('not-an-ip'), true)
})

test('refuses local hostnames without DNS', async () => {
  assert.equal(await resolvePublic('localhost'), null)
  assert.equal(await resolvePublic('169.254.169.254'), null)
  assert.equal(await resolvePublic('[::1]'), null)
  assert.equal(await resolvePublic('127.0.0.1', { allowPrivate: true }), '127.0.0.1')
})

test('normalizes typed addresses and searches, refuses other schemes', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/')
  assert.equal(normalizeUrl('https://github.com/x?y=1'), 'https://github.com/x?y=1')
  assert.match(normalizeUrl('как сварить кофе'), /^https:\/\/duckduckgo\.com\/\?q=/)
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://settings', 'data:text/html,hi', 'http://user:pw@example.com/', ''])
    assert.equal(normalizeUrl(bad), null, bad)
})
