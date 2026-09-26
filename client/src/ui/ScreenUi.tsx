import { useEffect, useRef } from 'react'
import { getScreen, getSeat, screenLabel } from '../lib/level'
import { closeOverlay, openOverlay, shareScreen, stopPresenting } from '../screens/actions'
import { standUp } from '../screens/seats'
import { enterFocus } from '../browser/focus'
import { useGame } from '../store/game'
import { useMedia } from '../store/media'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'

/** Screen the current target refers to: a wall screen, or the screen of the seat you sit on
 *  (the desk monitor, or the wall screen of the room). */
function useTargetScreen(): string | null {
  const target = useGame((s) => s.target)
  const seat = useGame((s) => s.seat)
  if (target?.kind === 'screen') return target.screenId
  return getSeat(seat)?.screenId ?? null
}

export function InteractionPrompt() {
  const target = useGame((s) => s.target)
  const seat = useGame((s) => s.seat)
  const menuOpen = useGame((s) => s.menuOpen)
  const screenId = useTargetScreen()
  const state = useScreens((s) => (screenId ? s.states[screenId] : undefined))
  const selfId = usePlayers((s) => s.selfId)
  const owner = usePlayers((s) => (state?.owner ? s.players[state.owner] : undefined))
  if (!target || menuOpen || target.kind === 'prop') return null

  let text: React.ReactNode
  if (target.kind === 'seat' && !seat) {
    const kind = getSeat(target.seatId)?.kind
    text = (
      <>
        <kbd>E</kbd> {kind === 'desk' ? 'сесть за стол' : kind === 'sofa' ? 'сесть на диван' : 'сесть'}
      </>
    )
  } else if (seat && !screenId) {
    text = (
      <>
        <kbd>Esc</kbd> встать
      </>
    )
  } else if (seat) {
    const busy = state && state.owner !== selfId
    text = (
      <>
        <kbd>E</kbd> {getScreen(screenId!)?.kind === 'desk' ? 'меню монитора' : 'меню экрана'}
        {busy && (
          <>
            {' '}
            · <kbd>F</kbd> крупно · показывает {owner?.name ?? '…'}
          </>
        )}{' '}
        · <kbd>Esc</kbd> встать
      </>
    )
  } else if (state && state.owner !== selfId) {
    text = (
      <>
        <kbd>F</kbd> смотреть крупно · показывает {owner?.name ?? '…'}
      </>
    )
  } else if (state) {
    text = (
      <>
        <kbd>E</kbd> управление показом · <kbd>F</kbd> крупно
      </>
    )
  } else {
    text = (
      <>
        <kbd>E</kbd> показать на «{screenId ? screenLabel(getScreen(screenId)!) : ''}»
      </>
    )
  }
  return <div className="prompt panel">{text}</div>
}

export function InteractionMenu({ extra }: { extra?: (screenId: string) => React.ReactNode }) {
  const menuOpen = useGame((s) => s.menuOpen)
  const target = useGame((s) => s.target)
  const seat = useGame((s) => s.seat)
  const screenId = useTargetScreen()
  const state = useScreens((s) => (screenId ? s.states[screenId] : undefined))
  const selfId = usePlayers((s) => s.selfId)
  const mediaOk = useMedia((s) => s.status === 'connected')
  if (!menuOpen || !target || target.kind === 'prop') return null
  const screen = screenId ? getScreen(screenId) : undefined
  const mine = state?.owner === selfId
  const canShare = typeof navigator.mediaDevices?.getDisplayMedia === 'function'

  return (
    <div className="menu panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="menu-title">{screen ? screenLabel(screen) : 'Место'}</div>
      {screen?.kind === 'desk' && !state && <div className="muted small">Видят те, кто рядом (≈{screen.viewDistance ?? 6} м) — удобно для парного программирования</div>}
      {screen && !state && (
        <>
          <button className="btn" disabled={!mediaOk || !canShare} onClick={() => void shareScreen(screen.id)}>
            🖥️ {screen.kind === 'desk' ? 'Показать экран на мониторе' : 'Показать экран'}
          </button>
          {!mediaOk && <div className="muted small">Демонстрация недоступна: нет соединения с медиасервером</div>}
          {extra?.(screen.id)}
        </>
      )}
      {screen && state?.mode === 'browser' && mine && (
        <button className="btn primary" onClick={() => enterFocus(screen.id)}>
          🖱 Войти в экран (или клик по нему)
        </button>
      )}
      {screen && state && mine && (
        <>
          {state.mode !== 'pdf' && extra?.(screen.id)}
          <button className="btn danger" onClick={() => stopPresenting(screen.id)}>
            ⏹ Перестать показывать
          </button>
        </>
      )}
      {screen && state && (
        <button className="btn" onClick={() => openOverlay(screen.id)}>
          {state.mode === 'browser' ? (mine ? '🌐 Открыть браузер (F)' : '🌐 Смотреть браузер (F)') : '🔍 Смотреть крупно (F)'}
        </button>
      )}
      {seat && (
        <button className="btn" onClick={standUp}>
          🚶 Встать (Esc)
        </button>
      )}
      <button className="btn ghost small" onClick={() => useGame.setState({ menuOpen: false })}>
        Закрыть
      </button>
    </div>
  )
}

function OverlayVideo({ screenId }: { screenId: string }) {
  const track = useScreens((s) => s.video[screenId])
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !track) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])
  if (!track) return <div className="overlay-empty">Подключение к трансляции…</div>
  return <video ref={ref} autoPlay muted playsInline className="overlay-media" />
}

/** Full-window 2D view of a screen: in 3D the text is too small to read. */
export function ScreenOverlay({
  renderPdf,
  renderBrowser,
}: {
  renderPdf?: (screenId: string) => React.ReactNode
  renderBrowser?: (screenId: string) => React.ReactNode
}) {
  const overlay = useScreens((s) => s.overlay)
  const state = useScreens((s) => (overlay ? s.states[overlay] : undefined))
  const owner = usePlayers((s) => (state?.owner ? s.players[state.owner] : undefined))
  const screen = overlay ? getScreen(overlay) : undefined

  // Closes itself when the screen is released.
  useEffect(() => {
    if (overlay && !state) closeOverlay()
  }, [overlay, state])

  if (!overlay || !screen || !state) return null
  return (
    <div className="overlay" onClick={closeOverlay}>
      <div className="overlay-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {screenLabel(screen)} · показывает <strong>{owner?.name ?? '…'}</strong>
          {state.mode === 'pdf' && state.pdf && (
            <span className="muted">
              {' '}
              · {state.pdf.name} · {state.pdf.page}/{state.pdf.pages}
            </span>
          )}
        </span>
        <button className="btn small" onClick={closeOverlay}>
          ✕ Закрыть (Esc)
        </button>
      </div>
      <div className="overlay-body" onClick={(e) => e.stopPropagation()}>
        {state.mode === 'share' ? (
          <OverlayVideo screenId={overlay} />
        ) : state.mode === 'browser' ? (
          renderBrowser?.(overlay)
        ) : (
          renderPdf?.(overlay)
        )}
      </div>
    </div>
  )
}
