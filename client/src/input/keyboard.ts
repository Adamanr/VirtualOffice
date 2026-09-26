/**
 * Keyboard state by physical key (`KeyboardEvent.code`), so WASD works on any
 * layout (e.g. Russian ЙЦУКЕН). Ignores keys while typing in inputs.
 */
const pressed = new Set<string>()
/** Game keys are only live while the office view is mounted… */
let enabled = false
/** …and nothing else has taken the keyboard (a browser screen, the piano…). */
const blocks = new Set<symbol>()
type Handler = (e: KeyboardEvent) => void
const handlers = new Map<string, Set<Handler>>()
const upHandlers = new Map<string, Set<Handler>>()

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

const live = () => enabled && blocks.size === 0

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!live() || isTyping(e.target)) return
    if (e.code === 'Tab') e.preventDefault()
    const first = !pressed.has(e.code)
    pressed.add(e.code)
    if (first && !e.repeat) handlers.get(e.code)?.forEach((h) => h(e))
  })
  // Capture phase on window runs before anything else: the shared browser swallows
  // key events (stopPropagation) while you drive a screen, and a missed release
  // would leave the character walking on its own.
  window.addEventListener(
    'keyup',
    (e) => {
      if (pressed.delete(e.code)) upHandlers.get(e.code)?.forEach((h) => h(e))
    },
    true,
  )
  window.addEventListener('blur', releaseAllKeys)
  document.addEventListener('visibilitychange', () => document.hidden && releaseAllKeys())
}

/** Treats every held key as released (focus moves to a screen, the window loses focus…). */
export function releaseAllKeys() {
  for (const code of [...pressed]) {
    pressed.delete(code)
    upHandlers.get(code)?.forEach((h) => h(new KeyboardEvent('keyup', { code })))
  }
}

export const isDown = (code: string) => pressed.has(code)

/** The office view is (un)mounted. */
export function setKeyboardActive(value: boolean) {
  enabled = value
  releaseAllKeys()
}

/**
 * Takes the keyboard away from the game until the returned function is called.
 * Blocks nest: overlapping ones (the browser window closing as you enter the
 * screen) can't hand the keys back to the game early.
 */
export function blockKeyboard(): () => void {
  const token = Symbol('block')
  blocks.add(token)
  releaseAllKeys()
  return () => {
    blocks.delete(token)
  }
}

/** Subscribes to a key press (no auto-repeat), or release with `'up'`. Returns an unsubscribe function. */
export function onKey(code: string, handler: Handler, phase: 'down' | 'up' = 'down'): () => void {
  const map = phase === 'down' ? handlers : upHandlers
  let set = map.get(code)
  if (!set) map.set(code, (set = new Set()))
  set.add(handler)
  return () => set.delete(handler)
}
