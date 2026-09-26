import { blockKeyboard } from '../input/keyboard'
import { useScreens } from '../store/screens'
import { usePlayers } from '../store/players'
import { notify, useGame } from '../store/game'
import { modifiers, VIEWPORT } from './input'
import { browserStream, useBrowsers } from './stream'

/**
 * Driving a shared browser from inside the game: the pointer is locked (the OS
 * cursor disappears), mouse movement moves a cursor drawn on the 3D screen,
 * and clicks, wheel and keys go to the page. Esc (the browser's own
 * pointer-lock exit) brings you back to the office.
 */
const BUTTON = ['left', 'middle', 'right'] as const
let cleanup: (() => void) | null = null

function canvasEl(): HTMLCanvasElement | null {
  return document.querySelector('.office canvas')
}

/** Must be called from a user gesture (a click on the screen or a menu button). */
export function enterFocus(screenId: string) {
  const canvas = canvasEl()
  if (useScreens.getState().focus === screenId && document.pointerLockElement === canvas) return
  // Only the screen's owner drives it.
  const mine = useScreens.getState().states[screenId]?.owner === usePlayers.getState().selfId
  if (!canvas || !(mine || useBrowsers.getState()[screenId]?.control)) return
  useScreens.setState({ focus: screenId, overlay: null })
  useGame.setState({ menuOpen: false })
  // Pointer lock can be refused (no user gesture, embedded frame, some browsers):
  // then drive the page from the 2D window instead.
  const fallback = () => {
    exitFocus()
    useScreens.setState({ overlay: screenId })
    notify('Мышь не захватилась — открыл окно браузера (F)')
  }
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined
    p?.catch?.(fallback)
  } catch {
    fallback()
    return
  }
  // Older browsers only report failure via an event.
  document.addEventListener('pointerlockerror', fallback, { once: true })
  install(screenId, canvas, fallback)
}

export function exitFocus() {
  cleanup?.()
  cleanup = null
  if (document.pointerLockElement) document.exitPointerLock()
  if (useScreens.getState().focus) useScreens.setState({ focus: null })
}

function install(screenId: string, canvas: HTMLCanvasElement, onError: () => void) {
  cleanup?.()
  const stream = browserStream(screenId)
  stream.acquire()
  const unblock = blockKeyboard()
  let lastMove = 0
  // Page pixels per screen pixel: the framed screen fills ~90% of the window width.
  const speed = () => VIEWPORT.width / (window.innerWidth * 0.9)

  const send = (type: string, e: MouseEvent) =>
    stream.send({ t: 'mouse', type, x: Math.round(stream.cursor.x), y: Math.round(stream.cursor.y), button: type === 'mouseMoved' ? 'none' : (BUTTON[e.button] ?? 'left'), clickCount: e.detail || 1, modifiers: modifiers(e) })

  const move = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return
    const k = speed()
    stream.cursor.x = Math.min(VIEWPORT.width - 1, Math.max(0, stream.cursor.x + e.movementX * k))
    stream.cursor.y = Math.min(VIEWPORT.height - 1, Math.max(0, stream.cursor.y + e.movementY * k))
    const now = performance.now()
    if (now - lastMove < 30) return
    lastMove = now
    send('mouseMoved', e)
  }
  const down = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return
    e.preventDefault()
    send('mousePressed', e)
  }
  const up = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return
    send('mouseReleased', e)
  }
  const wheel = (e: WheelEvent) => {
    if (document.pointerLockElement !== canvas) return
    e.preventDefault()
    const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1
    stream.send({ t: 'wheel', x: Math.round(stream.cursor.x), y: Math.round(stream.cursor.y), dx: e.deltaX * scale, dy: e.deltaY * scale })
  }
  const key = (type: 'keyDown' | 'keyUp') => (e: KeyboardEvent) => {
    if (e.isComposing || e.key === 'Escape') return
    // Tabs: Alt+T new, Alt+W close, Alt+, / Alt+. previous / next (Ctrl+T/W belong to your own browser).
    if (e.altKey && !e.ctrlKey && ['KeyT', 'KeyW', 'Comma', 'Period'].includes(e.code)) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'keyDown' && !e.repeat) {
        if (e.code === 'KeyT') stream.send({ t: 'tab_new' })
        if (e.code === 'KeyW') stream.send({ t: 'tab_close' })
        if (e.code === 'Comma') stream.send({ t: 'tab_switch', delta: -1 })
        if (e.code === 'Period') stream.send({ t: 'tab_switch', delta: 1 })
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') return // let the paste event through
    e.preventDefault()
    e.stopPropagation()
    stream.send({ t: 'key', type, key: e.key, code: e.code, modifiers: modifiers(e) })
  }
  const kd = key('keyDown')
  const ku = key('keyUp')
  const paste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text')
    if (text) stream.send({ t: 'text', text })
    e.preventDefault()
  }
  const lockChange = () => {
    if (document.pointerLockElement !== canvas) exitFocus()
  }
  const menu = (e: Event) => e.preventDefault()

  document.addEventListener('mousemove', move)
  document.addEventListener('mousedown', down)
  document.addEventListener('mouseup', up)
  document.addEventListener('wheel', wheel, { passive: false })
  document.addEventListener('keydown', kd, true)
  document.addEventListener('keyup', ku, true)
  document.addEventListener('paste', paste)
  document.addEventListener('pointerlockchange', lockChange)
  document.addEventListener('contextmenu', menu)
  cleanup = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mousedown', down)
    document.removeEventListener('mouseup', up)
    document.removeEventListener('wheel', wheel)
    document.removeEventListener('keydown', kd, true)
    document.removeEventListener('keyup', ku, true)
    document.removeEventListener('paste', paste)
    document.removeEventListener('pointerlockchange', lockChange)
    document.removeEventListener('contextmenu', menu)
    document.removeEventListener('pointerlockerror', onError)
    unblock()
    stream.release()
  }
}
