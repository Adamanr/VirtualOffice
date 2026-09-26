import { useEffect } from 'react'
import { onKey } from '../input/keyboard'
import { useScreens } from '../store/screens'
import { useBrowsers } from './stream'
import { setVolume, useTabVolume, volumeOf } from './volume'

/** While driving a page from inside the game. */
function FocusHint() {
  const focus = useScreens((s) => s.focus)
  const info = useBrowsers((s) => (focus ? s[focus] : undefined))
  if (!focus) return null
  return (
    <div className="focus-hint">
      🖱 Вы в экране{info?.title ? ` · ${info.title}` : ''} — мышь и клавиатура управляют страницей · <kbd>Esc</kbd> — обратно в офис
      {info?.fullscreen ? ' (видео останется на весь экран)' : ''}
      {info && info.tabs.length > 1 && (
        <div className="focus-tabs">
          {info.tabs.map((t, i) => (
            <span key={t.id} className={t.id === info.activeTab ? 'active' : ''}>
              {i + 1}. {(t.title || t.url).slice(0, 24)}
            </span>
          ))}
        </div>
      )}
      <div className="focus-keys">
        <kbd>Alt+T</kbd> новая вкладка · <kbd>Alt+W</kbd> закрыть · <kbd>Alt+,</kbd>/<kbd>Alt+.</kbd> переключить
      </div>
    </div>
  )
}

/** Volume of the shared-browser tab you hear best; also − / = keys. */
function TabVolume() {
  const nearest = useTabVolume((s) => s.nearest)
  const volume = useTabVolume((s) => (nearest ? (s.volumes[nearest.screenId] ?? 0.8) : 0.8))
  const title = useBrowsers((s) => (nearest ? s[nearest.screenId]?.title : undefined))
  useEffect(() => {
    const step = (d: number) => () => {
      const n = useTabVolume.getState().nearest
      if (n) setVolume(n.screenId, volumeOf(n.screenId) + d)
    }
    const offs = [onKey('Minus', step(-0.1)), onKey('Equal', step(0.1)), onKey('NumpadSubtract', step(-0.1)), onKey('NumpadAdd', step(0.1))]
    return () => offs.forEach((off) => off())
  }, [])
  if (!nearest) return null
  return (
    <div className="panel tab-volume" title="Громкость вкладки только для вас (клавиши − и =)">
      <button className="btn ghost small" onClick={() => setVolume(nearest.screenId, volume > 0 ? 0 : 0.8)}>
        {volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : '🔊'}
      </button>
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(nearest.screenId, Number(e.target.value))} />
      <span className="muted small tab-volume-title">{title || 'Вкладка'}</span>
    </div>
  )
}

export function TabHud() {
  return (
    <>
      <FocusHint />
      <TabVolume />
    </>
  )
}
