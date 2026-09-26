import { useEffect, useRef } from 'react'
import { useScreens } from '../store/screens'
import { VIEWPORT } from './input'
import { browserStream, useBrowsers } from './stream'

/**
 * The page went fullscreen (e.g. a video) while you drive it from the game:
 * your real browser goes fullscreen with the tab and input keeps flowing to
 * the page. Esc only brings *you* back to the office — the video stays
 * fullscreen on the screen for everyone (collapse it with the player's own
 * control, or "🗗 Свернуть видео").
 */
export function Cinema() {
  const focus = useScreens((s) => s.focus)
  const pageFullscreen = useBrowsers((s) => (focus ? !!s[focus]?.fullscreen : false))
  if (!focus || !pageFullscreen) return null
  return <CinemaView screenId={focus} />
}

function CinemaView({ screenId }: { screenId: string }) {
  const host = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const stream = browserStream(screenId)

  useEffect(() => {
    const canvas = stream.canvas
    canvas.className = 'cinema-canvas'
    host.current?.appendChild(canvas)
    void document.documentElement.requestFullscreen?.().catch(() => {})
    let raf = 0
    const loop = () => {
      const el = cursor.current
      const box = canvas.getBoundingClientRect()
      if (el) {
        el.style.left = `${box.left + (stream.cursor.x / VIEWPORT.width) * box.width}px`
        el.style.top = `${box.top + (stream.cursor.y / VIEWPORT.height) * box.height}px`
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      canvas.remove()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [stream, screenId])

  return (
    <div className="cinema">
      <div ref={host} className="cinema-host" />
      <div ref={cursor} className="cinema-cursor" />
    </div>
  )
}
