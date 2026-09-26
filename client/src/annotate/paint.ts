import type { Annotation, AnnotSettings } from '@shared/protocol.gen'

export interface LaserDot {
  color: string
  trail: { x: number; y: number; t: number }[]
}

export const LASER_MS = 900

/** Draws a stroke in content-normalized coordinates onto a W×H canvas. */
export function paintStroke(g: CanvasRenderingContext2D, W: number, H: number, s: Pick<Annotation, 'tool' | 'color' | 'width' | 'points'>) {
  const p = s.points
  if (p.length < 4) return
  const px = (i: number) => p[i]! * W
  const py = (i: number) => p[i + 1]! * H
  g.save()
  g.strokeStyle = s.color
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = Math.max(2, s.width * W)
  if (s.tool === 'highlight') {
    g.globalAlpha = 0.35
    g.lineWidth = Math.max(8, s.width * W * 3)
    g.lineCap = 'butt'
  }
  if (s.tool === 'rect') {
    const x0 = px(0)
    const y0 = py(0)
    const x1 = px(p.length - 2)
    const y1 = py(p.length - 2)
    g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
  } else if (s.tool === 'arrow') {
    const x0 = px(0)
    const y0 = py(0)
    const x1 = px(p.length - 2)
    const y1 = py(p.length - 2)
    const a = Math.atan2(y1 - y0, x1 - x0)
    const head = Math.max(12, g.lineWidth * 4)
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
    g.beginPath()
    g.moveTo(x1, y1)
    g.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45))
    g.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45))
    g.closePath()
    g.fillStyle = s.color
    g.fill()
  } else {
    g.beginPath()
    g.moveTo(px(0), py(0))
    for (let i = 2; i < p.length; i += 2) g.lineTo(px(i), py(i))
    g.stroke()
  }
  g.restore()
}

/** Everything drawn over a screen: spotlight, strokes for the current content, laser pointers. */
export function paintLayer(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  strokes: Annotation[],
  settings: AnnotSettings | undefined,
  lasers: LaserDot[],
  ctx: string,
  now: number,
) {
  g.clearRect(0, 0, W, H)
  const spot = settings?.spotlight
  if (spot && spot.length === 4 && settings.ctx === ctx) {
    const [x0, y0, x1, y1] = spot as [number, number, number, number]
    g.save()
    g.fillStyle = 'rgba(0,0,0,0.62)'
    g.beginPath()
    g.rect(0, 0, W, H)
    g.rect(Math.min(x0, x1) * W, Math.min(y0, y1) * H, Math.abs(x1 - x0) * W, Math.abs(y1 - y0) * H)
    g.fill('evenodd')
    g.strokeStyle = 'rgba(255,216,74,0.9)'
    g.lineWidth = Math.max(2, W * 0.003)
    g.strokeRect(Math.min(x0, x1) * W, Math.min(y0, y1) * H, Math.abs(x1 - x0) * W, Math.abs(y1 - y0) * H)
    g.restore()
  }
  for (const s of strokes) if (s.ctx === ctx) paintStroke(g, W, H, s)
  for (const l of lasers) {
    const pts = l.trail.filter((p) => now - p.t < LASER_MS)
    if (pts.length === 0) continue
    g.save()
    g.strokeStyle = l.color
    g.lineCap = 'round'
    for (let i = 1; i < pts.length; i++) {
      const k = 1 - (now - pts[i]!.t) / LASER_MS
      g.globalAlpha = 0.6 * k
      g.lineWidth = Math.max(2, W * 0.006 * k)
      g.beginPath()
      g.moveTo(pts[i - 1]!.x * W, pts[i - 1]!.y * H)
      g.lineTo(pts[i]!.x * W, pts[i]!.y * H)
      g.stroke()
    }
    const last = pts[pts.length - 1]!
    const r = Math.max(5, W * 0.009)
    g.globalAlpha = 1
    g.shadowColor = l.color
    g.shadowBlur = r * 2.5
    g.fillStyle = l.color
    g.beginPath()
    g.arc(last.x * W, last.y * H, r, 0, Math.PI * 2)
    g.fill()
    g.shadowBlur = 0
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(last.x * W, last.y * H, r * 0.4, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
}
