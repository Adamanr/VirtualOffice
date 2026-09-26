import * as THREE from 'three'
import type { JoinParams, JoinReply } from '@shared/protocol.gen'
import { local } from '../store/local'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'
import { addMessage, setHistory } from '../store/chat'
import { clearPropsStore, hydrateProps } from '../store/props'
import { resetActivity, useActivity } from '../store/activity'
import { SpaceConnection } from './connection'
import { applyBatch, applySnapshot, clearRemotes, clock, remotes, removeRemote } from './remotes'

/** Identity for this page lifetime: survives socket reconnects, a reload is a fresh guest. */
export const playerId = crypto.randomUUID()

let conn: SpaceConnection | null = null
export const getConnection = () => conn

/** Set to make the next NetSync tick send the local state even if unchanged. */
export const netFlags = { forceSend: true }

/**
 * Sends the current position right away. Actions the server checks by distance
 * (throws, props, pranks) call this first, so they never race the 15 Hz sync
 * (e.g. right after joining or reconnecting).
 */
export function syncPosition() {
  if (!conn || conn.channel.state !== 'joined') return
  const r = (v: number) => Math.round(v * 1000) / 1000
  conn.send('move', { s: [r(local.position.x), r(local.position.y), r(local.position.z), r(local.rotY), local.anim] })
}

type Listener = (c: SpaceConnection) => void
const listeners = new Set<Listener>()

const joinListeners = new Set<(reply: JoinReply) => void>()

/** Called with the join snapshot on every (re)join. */
export function onJoined(l: (reply: JoinReply) => void): () => void {
  joinListeners.add(l)
  return () => joinListeners.delete(l)
}

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
        useScreens.setState({ states: Object.fromEntries(reply.screens.map((sc) => [sc.id, sc])) })
        setHistory(reply.chat)
        hydrateProps(reply.boards ?? [], reply.stickers ?? [], reply.props ?? [])
        joinListeners.forEach((l) => l(reply))
        useActivity.setState({
          scores: reply.scores ?? [],
          drill: reply.drill ?? null,
          jellos: Object.fromEntries((reply.jellos ?? []).map((j) => [j.deskId, j.by])),
        })
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
  c.on('chat', ({ msg }) => addMessage(msg))
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
  useScreens.setState({ states: {}, overlay: null })
  clearPropsStore()
  resetActivity()
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __conn: () => SpaceConnection | null }).__conn = () => conn
}
