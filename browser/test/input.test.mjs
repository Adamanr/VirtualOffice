import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toCdp } from '../src/input.mjs'

test('mouse events clamp to the viewport and track pressed buttons', () => {
  const state = { buttons: 0 }
  const down = toCdp({ t: 'mouse', type: 'mousePressed', x: 5000, y: -3, button: 'left' }, state)
  assert.deepEqual([down.params.x, down.params.y, down.params.buttons], [1280, 0, 1])
  assert.equal(toCdp({ t: 'mouse', type: 'mouseMoved', x: 10, y: 10, button: 'none' }, state).params.buttons, 1)
  toCdp({ t: 'mouse', type: 'mouseReleased', x: 10, y: 10, button: 'left' }, state)
  assert.equal(state.buttons, 0)
  assert.equal(toCdp({ t: 'mouse', type: 'evil' }, state), null)
})

test('printable keys carry text, shortcuts and special keys do not', () => {
  assert.equal(toCdp({ t: 'key', type: 'keyDown', key: 'ж', code: 'Semicolon' }).params.text, 'ж')
  assert.equal(toCdp({ t: 'key', type: 'keyDown', key: 'Enter', code: 'Enter' }).params.text, '\r')
  const ctrlC = toCdp({ t: 'key', type: 'keyDown', key: 'c', code: 'KeyC', modifiers: 2 })
  assert.equal(ctrlC.params.text, undefined)
  assert.equal(ctrlC.params.type, 'rawKeyDown')
  assert.equal(toCdp({ t: 'key', type: 'keyDown', key: 'ArrowLeft' }).params.windowsVirtualKeyCode, 37)
})

test('wheel and text', () => {
  assert.equal(toCdp({ t: 'wheel', x: 1, y: 1, dx: 0, dy: 99999 }).params.deltaY, 2000)
  assert.deepEqual(toCdp({ t: 'text', text: 'привет' }), { method: 'Input.insertText', params: { text: 'привет' } })
  assert.equal(toCdp({ t: 'text', text: '' }), null)
})
