import { useEffect, useRef } from 'react'
import { useScreens } from '../store/screens'
import { VIEWPORT } from './input'
import { browserStream, useBrowsers } from './stream'

/**
 * The page went fullscreen (e.g. a video) while you drive it from the game:
 * your real browser goes fullscreen with the tab, input keeps flowing to the
 * page, and Esc leaves both fullscreens.
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
    // Leaving our fullscreen (Esc) also takes the page out of its fullscreen.
    const onChange = () => {
      if (!document.fullscreenElement && useBrowsers.getState()[screenId]?.fullscreen) stream.send({ t: 'exitFullscreen' })
    }
    document.addEventListener('fullscreenchange', onChange)
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
      document.removeEventListener('fullscreenchange', onChange)
      canvas.remove()
      if (useBrowsers.getState()[screenId]?.fullscreen) stream.send({ t: 'exitFullscreen' })
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
