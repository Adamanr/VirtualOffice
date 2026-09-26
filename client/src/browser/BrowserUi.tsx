import { useEffect, useRef, useState } from 'react'
import { setKeyboardActive } from '../input/keyboard'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'
import { openBrowser } from './actions'
import { modifiers, toPage } from './input'
import { browserStream, useBrowsers } from './stream'

/** Real fullscreen for the 2D browser window (anyone watching). */
function toggleFullscreen() {
  const overlay = document.querySelector('.overlay') as HTMLElement | null
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else void overlay?.requestFullscreen?.().catch(() => {})
}

/** E-menu entry: open any site on this screen. */
export function BrowserMenuItem({ screenId }: { screenId: string }) {
  const [url, setUrl] = useState('')
  return (
    <form
      className="row browser-open"
      onSubmit={(e) => {
        e.preventDefault()
        void openBrowser(screenId, url)
      }}
    >
      <input className="input" placeholder="🌐 Сайт или поиск: github.com" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button className="btn" type="submit" disabled={!url.trim()}>
        Открыть
      </button>
    </form>
  )
}

const BUTTON = ['left', 'middle', 'right'] as const

/**
 * Full-window shared browser. The owner drives it (mouse, wheel, keyboard,
 * paste, address bar); everyone else near the screen watches live.
 */
export function BrowserOverlay({ screenId }: { screenId: string }) {
  const info = useBrowsers((s) => s[screenId])
  const owner = useScreens((s) => s.states[screenId]?.owner)
  const ownerName = usePlayers((s) => (owner ? s.players[owner]?.name : undefined))
  const host = useRef<HTMLDivElement>(null)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const stream = browserStream(screenId)
  const control = !!info?.control

  // The page gets the keyboard, not the game.
  useEffect(() => {
    setKeyboardActive(false)
    return () => setKeyboardActive(true)
  }, [])

  useEffect(() => {
    stream.acquire()
    const el = host.current
    const canvas = stream.canvas
    canvas.className = 'browser-canvas'
    canvas.tabIndex = 0
    canvas.dataset.annotTarget = ''

    el?.appendChild(canvas)
    if (control) canvas.focus()
    return () => {
      delete canvas.dataset.annotTarget
      canvas.remove()
      stream.release()
    }
  }, [stream, control])

  useEffect(() => {
    if (!editing) setAddress(info?.url ?? '')
  }, [info?.url, editing])

  // Pointer, wheel and keys → the remote page.
  useEffect(() => {
    const canvas = stream.canvas
    if (!control) return
    let lastMove = 0
    const mouse = (type: string) => (e: MouseEvent) => {
      if (type === 'mouseMoved') {
        const now = performance.now()
        if (now - lastMove < 30) return
        lastMove = now
      } else {
        e.preventDefault()
        canvas.focus()
      }
      const p = toPage(e, canvas)
      stream.send({ t: 'mouse', type, ...p, button: type === 'mouseMoved' ? 'none' : BUTTON[e.button] ?? 'left', clickCount: e.detail || 1, modifiers: modifiers(e) })
    }
    const down = mouse('mousePressed')
    const up = mouse('mouseReleased')
    const move = mouse('mouseMoved')
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1
      stream.send({ t: 'wheel', ...toPage(e, canvas), dx: e.deltaX * scale, dy: e.deltaY * scale })
    }
    const key = (type: 'keyDown' | 'keyUp') => (e: KeyboardEvent) => {
      if (e.isComposing) return
      // Let the browser produce a paste event for Ctrl/Cmd+V.
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') return
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
    const compose = (e: CompositionEvent) => e.data && stream.send({ t: 'text', text: e.data })
    const menu = (e: Event) => e.preventDefault()
    canvas.addEventListener('mousedown', down)
    canvas.addEventListener('mouseup', up)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('keydown', kd)
    canvas.addEventListener('keyup', ku)
    canvas.addEventListener('paste', paste)
    canvas.addEventListener('compositionend', compose)
    canvas.addEventListener('contextmenu', menu)
    return () => {
      canvas.removeEventListener('mousedown', down)
      canvas.removeEventListener('mouseup', up)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('keydown', kd)
      canvas.removeEventListener('keyup', ku)
      canvas.removeEventListener('paste', paste)
      canvas.removeEventListener('compositionend', compose)
      canvas.removeEventListener('contextmenu', menu)
    }
  }, [stream, control])

  // The page went fullscreen (a video's ⛶): take the whole real screen too.
  useEffect(() => {
    if (!control) return
    const overlay = host.current?.closest('.overlay') as HTMLElement | null
    if (info?.fullscreen && !document.fullscreenElement) void overlay?.requestFullscreen?.().catch(() => {})
    if (!info?.fullscreen && document.fullscreenElement === overlay) void document.exitFullscreen().catch(() => {})
  }, [info?.fullscreen, control])

  // Esc closes the overlay unless the page has focus (then Esc belongs to the page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement !== stream.canvas) useScreens.setState({ overlay: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stream])

  const status =
    info?.status === 'unavailable'
      ? 'Сервис браузера недоступен'
      : info?.status === 'waiting'
        ? 'Ждём, пока владелец запустит браузер…'
        : !info || info.status === 'connecting'
          ? 'Подключение…'
          : null

  return (
    <div className="browser">
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault()
          setEditing(false)
          stream.send({ t: 'nav', url: address })
          stream.canvas.focus()
        }}
      >
        <button type="button" className="btn small" disabled={!control} onClick={() => stream.send({ t: 'back' })} title="Назад">
          ←
        </button>
        <button type="button" className="btn small" disabled={!control} onClick={() => stream.send({ t: 'forward' })} title="Вперёд">
          →
        </button>
        <button type="button" className="btn small" disabled={!control} onClick={() => stream.send({ t: 'reload' })} title="Обновить">
          {info?.loading ? '✕' : '⟳'}
        </button>
        <input
          className="input browser-address"
          value={address}
          readOnly={!control}
          onFocus={(e) => {
            setEditing(true)
            e.currentTarget.select()
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => setAddress(e.target.value)}
          spellCheck={false}
        />
        <button type="button" className="btn small" onClick={toggleFullscreen} title="На весь экран браузера">
          ⛶
        </button>
        <span className="muted small browser-who">{control ? 'Вы управляете · видят все рядом' : `Смотрите · управляет ${ownerName ?? '…'}`}</span>
      </form>
      <div ref={host} className="browser-view">
        {(status || info?.error) && <div className="browser-status">{status ?? info?.error}</div>}
      </div>
    </div>
  )
}
