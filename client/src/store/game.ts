import { create } from 'zustand'

export type CameraMode = 'third' | 'top'

interface GameState {
  cameraMode: CameraMode
  /** Desk id the local player is sitting at. */
  seat: string | null
  /** Zone the local player is in (updated on change only). */
  zoneId: string | null
  toggleCameraMode: () => void
  setSeat: (seat: string | null) => void
  setZone: (zoneId: string | null) => void
}

export const useGame = create<GameState>((set) => ({
  cameraMode: 'third',
  seat: null,
  zoneId: null,
  toggleCameraMode: () => set((s) => ({ cameraMode: s.cameraMode === 'third' ? 'top' : 'third' })),
  setSeat: (seat) => set({ seat }),
  setZone: (zoneId) => set({ zoneId }),
}))
