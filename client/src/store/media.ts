import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { create } from 'zustand'

export type MediaStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'error'

export interface VideoTile {
  id: string
  track: RemoteVideoTrack | LocalVideoTrack
}

interface MediaState {
  status: MediaStatus
  micOn: boolean
  camOn: boolean
  /** Push-to-talk is on and the key is held. */
  pttActive: boolean
  /** Browser blocked audio playback until a user gesture. */
  audioBlocked: boolean
  /** Participants currently speaking (LiveKit active speakers), by player id. */
  speaking: Record<string, boolean>
  /** Camera tiles for the HUD: self first, then nearest audible people. */
  tiles: VideoTile[]
}

export const useMedia = create<MediaState>(() => ({
  status: 'idle',
  micOn: false,
  camOn: false,
  pttActive: false,
  audioBlocked: false,
  speaking: {},
  tiles: [],
}))
