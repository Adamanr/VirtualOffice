import { create } from 'zustand'

export type CameraMode = 'third' | 'top'

/** Something the player can interact with right now (nearest in range). */
export type Target =
  | { kind: 'screen'; screenId: string }
  | { kind: 'seat'; seatId: string }
  | { kind: 'prop'; propId: string }

/** Full-window overlays for prop activities / fake intranet. */
export type OverlayKind = 'whiteboard' | 'bulletin' | 'intranet'

interface GameState {
  cameraMode: CameraMode
  /** Seat id (desk, chair or sofa place) the local player is sitting on. */
  seat: string | null
  /** Zone the local player is in (updated on change only). */
  zoneId: string | null
  target: Target | null
  /** Action menu opened with E. */
  menuOpen: boolean
  /** Transient message for the user. */
  notice: string | null
  /** Activity overlay (whiteboard / bulletin / intranet). */
  overlay: { kind: OverlayKind; id: string } | null
  toggleCameraMode: () => void
  setSeat: (seat: string | null) => void
  setZone: (zoneId: string | null) => void
}

export const useGame = create<GameState>((set) => ({
  cameraMode: 'third',
  seat: null,
  zoneId: null,
  target: null,
  menuOpen: false,
  notice: null,
  overlay: null,
  toggleCameraMode: () => set((s) => ({ cameraMode: s.cameraMode === 'third' ? 'top' : 'third' })),
  setSeat: (seat) => set({ seat }),
  setZone: (zoneId) => set({ zoneId }),
}))

export function notify(notice: string) {
  useGame.setState({ notice })
}

export function openPropOverlay(kind: OverlayKind, id: string) {
  useGame.setState({ overlay: { kind, id }, menuOpen: false })
}

export function closePropOverlay() {
  useGame.setState({ overlay: null })
}

export const sameTarget = (a: Target | null, b: Target | null) => {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'screen' && b.kind === 'screen') return a.screenId === b.screenId
  if (a.kind === 'seat' && b.kind === 'seat') return a.seatId === b.seatId
  if (a.kind === 'prop' && b.kind === 'prop') return a.propId === b.propId
  return false
}
