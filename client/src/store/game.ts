import { create } from 'zustand'

export type CameraMode = 'third' | 'top'

/** Something the player can interact with right now (nearest in range). */
export type Target = { kind: 'screen'; screenId: string } | { kind: 'seat'; seatId: string }

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
  toggleCameraMode: () => set((s) => ({ cameraMode: s.cameraMode === 'third' ? 'top' : 'third' })),
  setSeat: (seat) => set({ seat }),
  setZone: (zoneId) => set({ zoneId }),
}))

export function notify(notice: string) {
  useGame.setState({ notice })
}

export const sameTarget = (a: Target | null, b: Target | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.kind === b.kind &&
    (a.kind === 'screen' ? a.screenId === (b as typeof a).screenId : a.seatId === (b as typeof a).seatId))
