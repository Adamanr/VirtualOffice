import * as THREE from 'three'
import type { Dart, PongState } from '@shared/protocol.gen'
import { setKeyboardActive } from '../input/keyboard'
import { burst } from '../fx/particles'
import { play } from '../fx/sfx'
import { getProp } from '../lib/level'
import { ProtocolError } from '../net/connection'
import { getConnection, onJoined, onSession, syncPosition } from '../net/session'
import { dartLandedAt, pongReceivedAt, useActivity } from '../store/activity'
import { notify, useGame } from '../store/game'
import { local } from '../store/local'
import { usePlayers } from '../store/players'
import { activitySpot } from './spots'
import { playNote } from './piano'

onSession((c) => {
  c.on('pong_state', ({ pong }) => onPong(pong))
  c.on('dart', ({ dart, from }) => onDart(dart, from as [number, number, number]))
  c.on('darts_clear', ({ boardId }) => useActivity.setState((s) => ({ darts: { ...s.darts, [boardId]: [] } })))
  c.on('note', ({ id, propId, midi }) => {
    // Our own notes already played locally, without network latency.
    if (id !== usePlayers.getState().selfId) playNote(midi, propId, id)
  })
})

onJoined((reply) => hydrateGames(reply.pongs ?? [], reply.darts ?? []))

export function hydrateGames(pongs: PongState[], darts: Dart[]) {
  const byBoard: Record<string, Dart[]> = {}
  for (const d of darts) (byBoard[d.boardId] ??= []).push(d)
  const now = performance.now()
  for (const p of pongs) pongReceivedAt.set(p.id, now)
  useActivity.setState({ pongs: Object.fromEntries(pongs.map((p) => [p.id, p])), darts: byBoard })
}

function placeAt(propId: string, kind: 'pong' | 'darts' | 'piano', side?: 'a' | 'b') {
  const prop = getProp(propId)
  if (!prop) return
  const spot = activitySpot(prop, kind, side)
  local.teleport = new THREE.Vector3(spot.x, 'y' in spot ? spot.y : 0, spot.z)
  local.rotY = spot.rotY
  useGame.setState({ menuOpen: false })
  useActivity.setState({ mode: { kind, propId, side } })
}

// --- ping-pong -------------------------------------------------------------------------------

export async function joinPong(tableId: string) {
  const conn = getConnection()
  if (!conn) return
  syncPosition()
  try {
    const { side } = await conn.request('pong_join', { tableId })
    placeAt(tableId, 'pong', side)
  } catch (e) {
    notify(e instanceof ProtocolError && e.reason === 'busy' ? 'За столом уже двое — подождите партию' : 'Не удалось встать к столу')
  }
}

let lastPaddle = 0
let lastSent = NaN
/** Paddle position along the table width, sent at most ~20x/s. */
export function sendPaddle(tableId: string, x: number) {
  const now = performance.now()
  if (now - lastPaddle < 50 || Math.abs(x - lastSent) < 0.005) return
  lastPaddle = now
  lastSent = x
  getConnection()?.send('pong_paddle', { tableId, x: Math.round(x * 1000) / 1000 })
}

function onPong(pong: PongState) {
  const prev = useActivity.getState().pongs[pong.id]
  pongReceivedAt.set(pong.id, performance.now())
  useActivity.setState((s) => ({ pongs: { ...s.pongs, [pong.id]: pong } }))
  const prop = getProp(pong.id)
  if (!prev || !prop) return
  const at: [number, number, number] = [prop.x, 0.8, prop.z]
  // Sounds for everyone nearby: paddle hits, points, the winner's fanfare.
  if (prev.status === 'playing' && pong.status === 'playing' && Math.sign(prev.ball[3] ?? 0) !== Math.sign(pong.ball[3] ?? 0)) play('tock', at)
  if (pong.sa + pong.sb > prev.sa + prev.sb) play('rim', at)
  if (pong.status === 'won' && prev.status !== 'won') {
    play('ding', at)
    burst('confetti', [prop.x, 1.4, prop.z], 70, { colors: ['#4f8cff', '#e5484d', '#f5a524', '#30a46c', '#ffffff'] })
  }
}

// --- darts -----------------------------------------------------------------------------------

export function throwDart(boardId: string, u: number, v: number) {
  syncPosition()
  getConnection()?.send('dart_throw', { boardId, u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 })
}

export function collectDarts(boardId: string) {
  syncPosition()
  getConnection()?.send('darts_clear', { boardId })
}

const FLIGHT_MS = 380

function onDart(dart: Dart, from: [number, number, number]) {
  useActivity.setState((s) => ({ flying: [...s.flying.slice(-8), { dart, from, start: performance.now() }] }))
  window.setTimeout(() => {
    dartLandedAt.set(dart.id, performance.now())
    useActivity.setState((s) => ({
      flying: s.flying.filter((f) => f.dart.id !== dart.id),
      darts: { ...s.darts, [dart.boardId]: [dart, ...(s.darts[dart.boardId] ?? [])].slice(0, 30) },
    }))
    const prop = getProp(dart.boardId)
    if (prop) play('thunk', [prop.x, prop.elevation, prop.z])
  }, FLIGHT_MS)
}

export const DART_FLIGHT_MS = FLIGHT_MS

// --- piano -----------------------------------------------------------------------------------

export function sitAtPiano(propId: string) {
  syncPosition()
  placeAt(propId, 'piano')
  setKeyboardActive(false)
}

export function sendNote(propId: string, midi: number) {
  playNote(midi, propId, usePlayers.getState().selfId)
  getConnection()?.send('note', { propId, midi })
}

// --- common ----------------------------------------------------------------------------------

export function enterDarts(boardId: string) {
  syncPosition()
  placeAt(boardId, 'darts')
}

export function leaveActivity() {
  const mode = useActivity.getState().mode
  if (!mode) return
  useActivity.setState({ mode: null })
  if (mode.kind === 'pong') getConnection()?.send('pong_leave', { tableId: mode.propId })
  if (mode.kind === 'piano') setKeyboardActive(true)
}
