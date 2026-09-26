import { media } from '../media/media'
import { ProtocolError } from '../net/connection'
import { getConnection, onSession } from '../net/session'
import { notify, useGame } from '../store/game'
import { usePlayers } from '../store/players'
import { setScreenState, useScreens } from '../store/screens'
import { resetBrowserStream } from '../browser/stream'
import { exitFocus } from '../browser/focus'

const REASONS: Record<string, string> = {
  busy: 'Этот экран уже занят другим докладчиком',
  too_far: 'Подойдите ближе к экрану (нужно быть в той же зоне)',
  unknown_screen: 'Неизвестный экран',
  rate_limited: 'Слишком часто, попробуйте ещё раз',
}

export function explain(e: unknown): string {
  if (e instanceof ProtocolError) return REASONS[e.reason] ?? e.reason
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Демонстрация экрана отменена'
  return e instanceof Error ? e.message : String(e)
}

export async function shareScreen(screenId: string) {
  const conn = getConnection()
  if (!conn) return
  useGame.setState({ menuOpen: false })
  try {
    await media.startScreenShare(screenId, () => conn.request('screen_claim', { screenId, mode: 'share' }))
  } catch (e) {
    const cancelled = (e as { name?: string })?.name === 'NotAllowedError'
    if (!cancelled) notify(explain(e))
  }
}

export function stopPresenting(screenId: string) {
  useGame.setState({ menuOpen: false })
  if (media.sharingScreenId === screenId) media.stopScreenShare()
  getConnection()?.send('screen_release', { screenId })
}

export function openOverlay(screenId: string) {
  useGame.setState({ menuOpen: false })
  useScreens.setState({ overlay: screenId })
}

export function closeOverlay() {
  useScreens.setState({ overlay: null })
}

// Screen state from the server: initial snapshot on (re)join, then updates.
onSession((conn) => {
  conn.on('screen_update', ({ screen }) => {
    const prev = useScreens.getState().states[screen.id]
    // The browser tab on this screen ended or changed hands: reconnect from scratch.
    if (prev?.mode === 'browser' && (screen.mode !== 'browser' || screen.owner !== prev.owner || screen.url !== prev.url)) {
      resetBrowserStream(screen.id)
    }
    setScreenState(screen)
    const self = usePlayers.getState().selfId
    // Our browser screen ended or was taken over: leave it.
    if (useScreens.getState().focus === screen.id && (screen.mode !== 'browser' || screen.owner !== self)) exitFocus()
    // Lost the screen (e.g. claimed another one): stop publishing to it.
    if (media.sharingScreenId === screen.id && screen.owner !== self) media.stopScreenShare()
  })
})

media.onScreenShareEnded = (screenId) => getConnection()?.send('screen_release', { screenId })
