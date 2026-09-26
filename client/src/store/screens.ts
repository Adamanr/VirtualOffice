import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { create } from 'zustand'
import type { ScreenState } from '@shared/protocol.gen'

interface ScreensState {
  /** Occupied screens from the server (absent = free). */
  states: Record<string, ScreenState>
  /** Live screen-share video per screen id (subscribed remote track, or our own local one). */
  video: Record<string, RemoteVideoTrack | LocalVideoTrack>
  /** Screen shown in the full-window 2D overlay. */
  overlay: string | null
  /** Screens the local player can currently see (same zone / near a desk monitor). */
  visible: Record<string, boolean>
  /** Screen whose shared browser we are driving from inside the game (pointer locked). */
  focus: string | null
}

export const useScreens = create<ScreensState>(() => ({
  states: {},
  video: {},
  overlay: null,
  visible: {},
  focus: null,
}))

export function setScreenState(screen: ScreenState) {
  useScreens.setState((s) => {
    const states = { ...s.states }
    if (screen.owner) states[screen.id] = screen
    else delete states[screen.id]
    return { states }
  })
}

export function setScreenVideo(screenId: string, track: RemoteVideoTrack | LocalVideoTrack | null) {
  useScreens.setState((s) => {
    const video = { ...s.video }
    if (track) video[screenId] = track
    else delete video[screenId]
    return { video }
  })
}
