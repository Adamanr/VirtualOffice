import { useEffect, useRef, useState } from 'react'
import type { Annotation } from '@shared/protocol.gen'
import { useProfile } from '../store/profile'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'
import { paintLayer, paintStroke } from './paint'
import { clearAnnotations, lasersOf, screenCtx, sendAnnotation, sendLaser, setAnnotSettings, undoAnnotation, useAnnot } from './store'

export type Tool = 'none' | 'pen' | 'highlight' | 'rect' | 'arrow' | 'laser' | 'spot'

const TOOLS: { id: Tool; icon: string; title: string; presenter?: boolean }[] = [
  { id: 'none', icon: '👆', title: 'Смотреть / управлять страницей' },
  { id: 'pen', icon: '✏️', title: 'Ручка' },
  { id: 'highlight', icon: '🖍️', title: 'Маркер — выделить место' },
  { id: 'rect', icon: '▭', title: 'Рамка' },
  { id: 'arrow', icon: '➜', title: 'Стрелка' },
  { id: 'laser', icon: '🔴', title: 'Лазерная указка (видна всем, не остаётся)' },
  { id: 'spot', icon: '🔦', title: 'Прожектор: выделите область — остальное затемнится у всех', presenter: true },
]
const PALETTE = ['#e5484d', '#f5a524', '#30a46c', '#4f8cff', '#8e4ec6', '#1d2026']

/**
 * Drawing over a shared screen in the full-window view: a transparent canvas
 * laid exactly over the content (video, PDF page, browser tab) plus a toolbar.
 * Everyone who can see the screen draws in their color; the presenter can also
 * clear everything, lock drawing and set a spotlight.
 */
export function AnnotationOverlay({ screenId }: { screenId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('none')
  const myColor = useProfile((s) => s.color)
  const [color, setColor] = useState(myColor)
  const [width, setWidth] = useState(0.005)
  const selfId = usePlayers((s) => s.selfId)
  const presenter = useScreens((s) => s.states[screenId]?.owner === selfId)
  const settings = useAnnot((s) => s.settings[screenId])
  const current = useRef<{ points: number[]; flushed: number; at: number } | null>(null)
  const locked = !!settings?.locked && !presenter

  // Keep the drawing canvas glued to the content element and repaint.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const c = canvas.current
      const target = document.querySelector<HTMLElement>('.overlay [data-annot-target]')
      if (c && target) {
        const r = target.getBoundingClientRect()
        Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, display: r.width ? 'block' : 'none' })
        const W = Math.round(r.width * Math.min(2, devicePixelRatio))
        const H = Math.round(r.height * Math.min(2, devicePixelRatio))
        if (c.width !== W || c.height !== H) {
          c.width = W
          c.height = H
        }
        const g = c.getContext('2d')!
        const st = useAnnot.getState()
        paintLayer(g, W, H, st.strokes[screenId] ?? [], st.settings[screenId], lasersOf(screenId), screenCtx(screenId), performance.now())
        const cur = current.current
        if (cur && cur.points.length >= 4) {
          if (tool === 'spot') paintSpotDraft(g, W, H, cur.points)
          else if (tool !== 'laser') paintStroke(g, W, H, { tool: tool as Annotation['tool'], color, width, points: cur.points })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [screenId, tool, color, width])

  const norm = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] as const
  }

  const flush = (final: boolean) => {
    const cur = current.current
    if (!cur) return
    if (tool === 'pen' || tool === 'highlight') {
      // Freehand strokes stream in pieces so others see them being drawn.
      const piece = cur.points.slice(Math.max(0, cur.flushed - 2))
      if (piece.length >= 4 && (final || piece.length >= 16)) {
        sendAnnotation(screenId, { tool, color, width, points: thin(piece, 64) })
        cur.flushed = cur.points.length
      }
    } else if (final && (tool === 'rect' || tool === 'arrow')) {
      const p = cur.points
      if (p.length >= 4) sendAnnotation(screenId, { tool, color, width, points: [p[0]!, p[1]!, p[p.length - 2]!, p[p.length - 1]!] })
    } else if (final && tool === 'spot') {
      const p = cur.points
      if (p.length >= 4 && Math.abs(p[0]! - p[p.length - 2]!) > 0.02) setAnnotSettings(screenId, { spotlight: [p[0]!, p[1]!, p[p.length - 2]!, p[p.length - 1]!] })
    }
  }

  const snapshot = () => void takeSnapshot(screenId)

  return (
    <>
      <canvas
        ref={canvas}
        className="annot-canvas"
        style={{ pointerEvents: tool === 'none' ? 'none' : 'auto', cursor: tool === 'laser' ? 'none' : 'crosshair' }}
        // Clicks here must not reach the overlay backdrop (which closes it).
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (tool === 'none' || locked) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const [x, y] = norm(e)
          current.current = { points: [x, y], flushed: 0, at: performance.now() }
          if (tool === 'laser') sendLaser(screenId, x, y)
        }}
        onPointerMove={(e) => {
          if (tool === 'none' || locked) return
          const [x, y] = norm(e)
          // The laser follows the pointer even without pressing.
          if (tool === 'laser') return sendLaser(screenId, x, y)
          const cur = current.current
          if (!cur) return
          cur.points.push(x, y)
          if (performance.now() - cur.at > 120) {
            cur.at = performance.now()
            flush(false)
          }
        }}
        onPointerUp={() => {
          flush(true)
          current.current = null
        }}
      />
      <div className="panel annot-bar" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        {TOOLS.filter((t) => !t.presenter || presenter).map((t) => (
          <button key={t.id} className={`ctl${tool === t.id ? ' active' : ''}`} title={t.title} disabled={locked && t.id !== 'none'} onClick={() => setTool(t.id)}>
            {t.icon}
          </button>
        ))}
        <div className="annot-sep" />
        {[myColor, ...PALETTE.filter((c) => c !== myColor)].map((c) => (
          <button key={c} className={`swatch small${color === c ? ' active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} title={c === myColor ? 'Ваш цвет' : c} />
        ))}
        <button className="btn ghost small" title="Толщина" onClick={() => setWidth((w) => (w >= 0.012 ? 0.003 : w * 2))}>
          {width < 0.004 ? '·' : width < 0.008 ? '•' : '●'}
        </button>
        <div className="annot-sep" />
        <button className="ctl" title="Отменить моё последнее" onClick={() => undoAnnotation(screenId)}>
          ↶
        </button>
        <button className="ctl" title="Стереть всё моё" onClick={() => clearAnnotations(screenId, false)}>
          🧽
        </button>
        {presenter && (
          <>
            <div className="annot-sep" />
            <button className="ctl" title="Очистить все пометки (у всех)" onClick={() => clearAnnotations(screenId, true)}>
              🧹
            </button>
            <button className={`ctl${settings?.locked ? ' active' : ''}`} title={settings?.locked ? 'Разрешить рисовать всем' : 'Запретить рисовать остальным'} onClick={() => setAnnotSettings(screenId, { locked: !settings?.locked })}>
              {settings?.locked ? '🔒' : '🔓'}
            </button>
            {settings?.spotlight && (
              <button className="ctl" title="Убрать прожектор" onClick={() => setAnnotSettings(screenId, { spotlight: null })}>
                ✕🔦
              </button>
            )}
          </>
        )}
        <button className="ctl" title="Снимок экрана с пометками (PNG)" onClick={snapshot}>
          📸
        </button>
        {locked && <div className="muted small annot-locked">🔒 Рисование выключено показывающим</div>}
      </div>
    </>
  )
}

function paintSpotDraft(g: CanvasRenderingContext2D, W: number, H: number, p: number[]) {
  const [x0, y0, x1, y1] = [p[0]!, p[1]!, p[p.length - 2]!, p[p.length - 1]!]
  g.save()
  g.setLineDash([8, 6])
  g.strokeStyle = '#ffd84a'
  g.lineWidth = 2
  g.strokeRect(Math.min(x0, x1) * W, Math.min(y0, y1) * H, Math.abs(x1 - x0) * W, Math.abs(y1 - y0) * H)
  g.restore()
}

/** Downsamples a point list to at most `max` points. */
function thin(points: number[], max: number) {
  const n = points.length / 2
  if (n <= max) return points.map((v) => Math.round(v * 10000) / 10000)
  const out: number[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i / (max - 1)) * (n - 1)) * 2
    out.push(points[idx]!, points[idx + 1]!)
  }
  return out
}

/** Screen content + drawings as a PNG download. */
async function takeSnapshot(screenId: string) {
  const target = document.querySelector<HTMLVideoElement | HTMLCanvasElement>('.overlay [data-annot-target]')
  if (!target) return
  const W = target instanceof HTMLVideoElement ? target.videoWidth : target.width
  const H = target instanceof HTMLVideoElement ? target.videoHeight : target.height
  if (!W || !H) return
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.drawImage(target, 0, 0, W, H)
  const st = useAnnot.getState()
  paintLayer(g, W, H, st.strokes[screenId] ?? [], st.settings[screenId], [], screenCtx(screenId), performance.now())
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `экран-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
