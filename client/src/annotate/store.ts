import { create } from 'zustand'
import type { Annotation, AnnotSettings } from '@shared/protocol.gen'
import { getConnection, onJoined, onSession, syncPosition } from '../net/session'
import { ProtocolError } from '../net/connection'
import { notify } from '../store/game'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'
import { useBrowsers } from '../browser/stream'
import type { LaserDot } from './paint'

interface AnnotState {
  strokes: Record<string, Annotation[]>
  settings: Record<string, AnnotSettings>
  /** Bumped on every change, so layers know when to redraw. */
  version: number
}

export const useAnnot = create<AnnotState>(() => ({ strokes: {}, settings: {}, version: 0 }))

/** Laser pointers per screen and player (mutable; read every frame). */
export const lasers = new Map<string, Map<string, LaserDot>>()
export const laserTouched = { at: 0 }

onJoined((reply) => {
  const strokes: Record<string, Annotation[]> = {}
  for (const a of reply.annotations ?? []) (strokes[a.screenId] ??= []).push(a)
  const settings = Object.fromEntries((reply.annotSettings ?? []).map((s) => [s.screenId, s]))
  useAnnot.setState((s) => ({ strokes, settings, version: s.version + 1 }))
})

onSession((c) => {
  c.on('annot_stroke', ({ stroke }) =>
    useAnnot.setState((s) => ({
      strokes: { ...s.strokes, [stroke.screenId]: [...(s.strokes[stroke.screenId] ?? []), stroke].slice(-300) },
      version: s.version + 1,
    })),
  )
  c.on('annot_remove', ({ screenId, ids }) =>
    useAnnot.setState((s) => {
      const gone = new Set(ids)
      return { strokes: { ...s.strokes, [screenId]: (s.strokes[screenId] ?? []).filter((a) => !gone.has(a.id)) }, version: s.version + 1 }
    }),
  )
  c.on('annot_settings', ({ settings }) =>
    useAnnot.setState((s) => ({ settings: { ...s.settings, [settings.screenId]: settings }, version: s.version + 1 })),
  )
  c.on('annot_laser', ({ screenId, id, x, y }) => {
    const color = usePlayers.getState().players[id]?.color ?? '#e5484d'
    let perScreen = lasers.get(screenId)
    if (!perScreen) lasers.set(screenId, (perScreen = new Map()))
    const dot = perScreen.get(id) ?? { color, trail: [] }
    dot.trail = [...dot.trail.filter((p) => performance.now() - p.t < 1000), { x, y, t: performance.now() }].slice(-30)
    perScreen.set(id, dot)
    laserTouched.at = performance.now()
  })
})

/** What a screen currently shows, so drawings stay with their page / site. */
export function screenCtx(screenId: string): string {
  const state = useScreens.getState().states[screenId]
  if (state?.mode === 'pdf') return `p${state.pdf?.page ?? 1}`
  if (state?.mode === 'browser') return useBrowsers.getState()[screenId]?.url || state.url || ''
  return ''
}

export function lasersOf(screenId: string): LaserDot[] {
  return [...(lasers.get(screenId)?.values() ?? [])]
}

// --- actions --------------------------------------------------------------------------------

async function request(fn: () => Promise<unknown>) {
  syncPosition()
  try {
    await fn()
  } catch (e) {
    if (e instanceof ProtocolError)
      notify(
        e.reason === 'locked'
          ? 'Показывающий запретил рисовать 🔒'
          : e.reason === 'too_far'
            ? 'Подойдите ближе к экрану'
            : e.reason === 'not_owner'
              ? 'Это может только показывающий'
              : 'Не получилось',
      )
  }
}

export function sendAnnotation(screenId: string, stroke: Pick<Annotation, 'tool' | 'color' | 'width' | 'points'>) {
  const conn = getConnection()
  if (!conn || stroke.points.length < 4) return
  void request(() => conn.request('annot_stroke', { screenId, ctx: screenCtx(screenId), ...stroke }))
}

export function undoAnnotation(screenId: string) {
  const conn = getConnection()
  if (conn) void request(() => conn.request('annot_undo', { screenId }))
}

export function clearAnnotations(screenId: string, all: boolean) {
  const conn = getConnection()
  if (conn) void request(() => conn.request('annot_clear', { screenId, all }))
}

export function setAnnotSettings(screenId: string, patch: Partial<Pick<AnnotSettings, 'locked' | 'spotlight'>>) {
  const conn = getConnection()
  const cur = useAnnot.getState().settings[screenId]
  if (!conn) return
  void request(() =>
    conn.request('annot_settings', {
      screenId,
      locked: patch.locked ?? cur?.locked ?? false,
      spotlight: patch.spotlight !== undefined ? patch.spotlight : (cur?.spotlight ?? null),
      ctx: screenCtx(screenId),
    }),
  )
}

let lastLaser = 0
export function sendLaser(screenId: string, x: number, y: number) {
  const now = performance.now()
  if (now - lastLaser < 45) return
  lastLaser = now
  getConnection()?.send('annot_laser', { screenId, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 })
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __annot: typeof useAnnot }).__annot = useAnnot
}
