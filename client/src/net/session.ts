import * as THREE from 'three'
import type { JoinParams } from '@shared/protocol.gen'
import { local } from '../store/local'
import { usePlayers } from '../store/players'
import { SpaceConnection } from './connection'
import { applyBatch, applySnapshot, clearRemotes, clock, remotes, removeRemote } from './remotes'

/** Identity for this page lifetime: survives socket reconnects, a reload is a fresh guest. */
export const playerId = crypto.randomUUID()

let conn: SpaceConnection | null = null
export const getConnection = () => conn

/** Set to make the next NetSync tick send the local state even if unchanged. */
export const netFlags = { forceSend: true }

type Listener = (c: SpaceConnection) => void
const listeners = new Set<Listener>()

/** Lets feature modules (screens, chat, media) subscribe to channel events of each new session. */
export function onSession(l: Listener): () => void {
  listeners.add(l)
  if (conn) l(conn)
  return () => listeners.delete(l)
}

export function startSession(spaceId: string, profile: Omit<JoinParams, 'playerId'>) {
  stopSession()
  usePlayers.setState({ selfId: playerId, status: 'connecting', joinError: null, players: {}, reactions: {} })
  const c = new SpaceConnection(
    spaceId,
    { playerId, ...profile },
    {
      onStatus: (status) => usePlayers.setState({ status }),
      onJoinError: (joinError) => usePlayers.setState({ joinError }),
      onJoin: (reply) => {
        clock.sample(reply.serverTime, performance.now())
        applySnapshot(reply.serverTime, reply.players)
        netFlags.forceSend = true
      },
      onPresence: (entries) => {
        const players = Object.fromEntries(entries.map((e) => [e.id, e]))
        for (const id of remotes.keys()) if (!players[id]) removeRemote(id)
        usePlayers.setState({ players })
      },
    },
  )
  c.on('batch', ({ t, p }) => applyBatch(t, p, playerId))
  c.on('correction', ({ s }) => {
    local.teleport = new THREE.Vector3(s[0], s[1], s[2])
  })
  c.on('reaction', ({ id, emoji }) => {
    usePlayers.setState((st) => ({ reactions: { ...st.reactions, [id]: { emoji, at: Date.now() } } }))
  })
  conn = c
  listeners.forEach((l) => l(c))
}

export function stopSession() {
  conn?.close()
  conn = null
  clearRemotes()
}
