import assert from 'node:assert/strict'
import { test } from 'node:test'
import AdmZip from 'adm-zip'
import { crxToZip, parseExtensionId } from '../src/extensions.mjs'

const ID = 'ddkjiahejlhfcafbddmgiahcphecmpfh'

test('parses Chrome Web Store links and ids', () => {
  assert.equal(parseExtensionId(ID), ID)
  assert.equal(parseExtensionId(`https://chromewebstore.google.com/detail/ublock-origin-lite/${ID}`), ID)
  assert.equal(parseExtensionId(`https://chrome.google.com/webstore/detail/x/${ID}?hl=ru`), ID)
  assert.equal(parseExtensionId('https://example.com/evil'), null)
  assert.equal(parseExtensionId('zzzz'), null)
})

test('unwraps CRX3 and CRX2 packages', () => {
  const zip = new AdmZip()
  zip.addFile('manifest.json', Buffer.from('{"name":"x","version":"1"}'))
  const z = zip.toBuffer()
  const header = Buffer.from('0123456789')
  const crx3 = Buffer.concat([Buffer.from('Cr24'), u32(3), u32(header.length), header, z])
  assert.deepEqual(crxToZip(crx3), z)
  const crx2 = Buffer.concat([Buffer.from('Cr24'), u32(2), u32(3), u32(2), Buffer.from('abcde'), z])
  assert.deepEqual(crxToZip(crx2), z)
  assert.throws(() => crxToZip(Buffer.from('not a crx at all!')))
})

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}
