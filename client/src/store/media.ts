import { create } from 'zustand'

interface MediaState {
  /** Participants currently speaking (LiveKit active speakers), by player id. */
  speaking: Record<string, boolean>
}

export const useMedia = create<MediaState>(() => ({
  speaking: {},
}))
