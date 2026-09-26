import { create } from 'zustand'

const KEY = 'vo.browserVolume'
const DEFAULT = 0.8

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

interface VolumeState {
  /** Your personal volume per screen (0..1). */
  volumes: Record<string, number>
  /** The browser screen you hear best right now (for the volume widget). */
  nearest: { screenId: string; level: number } | null
}

export const useTabVolume = create<VolumeState>(() => ({ volumes: load(), nearest: null }))

export const volumeOf = (screenId: string) => useTabVolume.getState().volumes[screenId] ?? DEFAULT

export function setVolume(screenId: string, v: number) {
  const value = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
  useTabVolume.setState((s) => {
    const volumes = { ...s.volumes, [screenId]: value }
    try {
      localStorage.setItem(KEY, JSON.stringify(volumes))
    } catch {
      /* private mode */
    }
    return { volumes }
  })
}
