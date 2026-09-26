import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSilent } from '../src/audio.mjs'

test('silence detection skips quiet chunks only', () => {
  const quiet = Buffer.alloc(3840)
  assert.equal(isSilent(quiet), true)
  const loud = Buffer.alloc(3840)
  loud.writeInt16LE(9000, 32)
  assert.equal(isSilent(loud), false)
})
