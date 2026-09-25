/**
 * Keyboard state by physical key (`KeyboardEvent.code`), so WASD works on any
 * layout (e.g. Russian ЙЦУКЕН). Ignores keys while typing in inputs.
 */
const pressed = new Set<string>()
type Handler = (e: KeyboardEvent) => void
const handlers = new Map<string, Set<Handler>>()
const upHandlers = new Map<string, Set<Handler>>()

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return
    if (e.code === 'Tab') e.preventDefault()
    const first = !pressed.has(e.code)
    pressed.add(e.code)
    if (first && !e.repeat) handlers.get(e.code)?.forEach((h) => h(e))
  })
  window.addEventListener('keyup', (e) => {
    if (pressed.delete(e.code)) upHandlers.get(e.code)?.forEach((h) => h(e))
  })
  window.addEventListener('blur', () => {
    for (const code of pressed) upHandlers.get(code)?.forEach((h) => h(new KeyboardEvent('keyup', { code })))
    pressed.clear()
  })
}

export const isDown = (code: string) => pressed.has(code)

export function clearKeys() {
  pressed.clear()
}

/** Subscribes to a key press (no auto-repeat), or release with `'up'`. Returns an unsubscribe function. */
export function onKey(code: string, handler: Handler, phase: 'down' | 'up' = 'down'): () => void {
  const map = phase === 'down' ? handlers : upHandlers
  let set = map.get(code)
  if (!set) map.set(code, (set = new Set()))
  set.add(handler)
  return () => set.delete(handler)
}
