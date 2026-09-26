/**
 * Translates viewer input messages into Chrome DevTools Protocol calls.
 * Pure mapping functions (tested); the session sends the resulting commands.
 */
export const VIEWPORT = { width: 1280, height: 800 }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0))
const BUTTONS = { left: 1, right: 2, middle: 4 }
const MOUSE_TYPES = new Set(['mousePressed', 'mouseReleased', 'mouseMoved'])
const KEY_TYPES = new Set(['keyDown', 'keyUp'])

// Virtual key codes for keys pages commonly listen to via keyCode.
const VK = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Escape: 27, ' ': 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Delete: 46, Meta: 91,
}

/** @returns {{ method: string, params: object } | null} */
export function toCdp(msg, state = { buttons: 0 }) {
  if (!msg || typeof msg !== 'object') return null
  switch (msg.t) {
    case 'mouse': {
      if (!MOUSE_TYPES.has(msg.type)) return null
      const button = BUTTONS[msg.button] ? msg.button : 'none'
      if (msg.type === 'mousePressed') state.buttons |= BUTTONS[button] ?? 0
      if (msg.type === 'mouseReleased') state.buttons &= ~(BUTTONS[button] ?? 0)
      return {
        method: 'Input.dispatchMouseEvent',
        params: {
          type: msg.type,
          x: clamp(msg.x, 0, VIEWPORT.width),
          y: clamp(msg.y, 0, VIEWPORT.height),
          button,
          buttons: state.buttons,
          clickCount: msg.type === 'mouseMoved' ? 0 : clamp(msg.clickCount ?? 1, 1, 3),
          modifiers: clamp(msg.modifiers, 0, 15),
        },
      }
    }
    case 'wheel':
      return {
        method: 'Input.dispatchMouseEvent',
        params: {
          type: 'mouseWheel',
          x: clamp(msg.x, 0, VIEWPORT.width),
          y: clamp(msg.y, 0, VIEWPORT.height),
          deltaX: clamp(msg.dx, -2000, 2000),
          deltaY: clamp(msg.dy, -2000, 2000),
        },
      }
    case 'key': {
      if (!KEY_TYPES.has(msg.type) || typeof msg.key !== 'string' || msg.key.length > 32) return null
      const printable = msg.key.length === 1 || msg.key === 'Enter'
      const modifiers = clamp(msg.modifiers, 0, 15)
      // With Ctrl/Alt/Meta held it's a shortcut, not text.
      const text = msg.type === 'keyDown' && printable && !(modifiers & 0b1011) ? (msg.key === 'Enter' ? '\r' : msg.key) : undefined
      return {
        method: 'Input.dispatchKeyEvent',
        params: {
          type: msg.type === 'keyDown' ? (text ? 'keyDown' : 'rawKeyDown') : 'keyUp',
          key: msg.key,
          code: typeof msg.code === 'string' ? msg.code.slice(0, 32) : '',
          text,
          unmodifiedText: text,
          windowsVirtualKeyCode: VK[msg.key] ?? (msg.key.length === 1 ? msg.key.toUpperCase().charCodeAt(0) : 0),
          modifiers,
        },
      }
    }
    case 'text':
      if (typeof msg.text !== 'string' || msg.text.length === 0 || msg.text.length > 5000) return null
      return { method: 'Input.insertText', params: { text: msg.text } }
    default:
      return null
  }
}
