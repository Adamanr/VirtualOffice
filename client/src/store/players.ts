import { create } from 'zustand'
import type { ConnectionStatus, PresenceEntry } from '../net/connection'

interface PlayersState {
  selfId: string | null
  status: ConnectionStatus
  joinError: string | null
  /** Everyone online (from Phoenix Presence), including self. */
  players: Record<string, PresenceEntry>
  /** Last emoji reaction per player (cleared after a few seconds). */
  reactions: Record<string, { emoji: number; at: number }>
}

export const usePlayers = create<PlayersState>(() => ({
  selfId: null,
  status: 'connecting',
  joinError: null,
  players: {},
  reactions: {},
}))
