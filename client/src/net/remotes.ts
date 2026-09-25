import { ClockSync, SnapshotBuffer, type Pose } from '../lib/interpolation'
import type { BatchEntry, PlayerTuple } from '@shared/protocol.gen'

export interface RemoteState {
  buffer: SnapshotBuffer
  /** Pose sampled this frame (read by avatars, audio and video logic). */
  pose: Pose
  hasPose: boolean
}

/**
 * Remote players' movement, outside React: batches land here ~15x/s and the
 * render loop samples each buffer once per frame.
 */
export const remotes = new Map<string, RemoteState>()
export const clock = new ClockSync()

function ensure(id: string): RemoteState {
  let r = remotes.get(id)
  if (!r) {
    r = { buffer: new SnapshotBuffer(), pose: { x: 0, y: 0, z: 0, rotY: 0, anim: 0 }, hasPose: false }
    remotes.set(id, r)
  }
  return r
}

export function applyBatch(t: number, entries: BatchEntry[], selfId: string | null) {
  clock.sample(t, performance.now())
  for (const [id, x, y, z, rotY, anim] of entries) {
    if (id === selfId) continue
    ensure(id).buffer.push({ t, x, y, z, rotY, anim })
  }
}

/** Initial state from the join snapshot (no history to interpolate from yet). */
export function applySnapshot(t: number, players: { id: string; s: PlayerTuple }[]) {
  for (const { id, s } of players) {
    const [x, y, z, rotY, anim] = s
    ensure(id).buffer.reset({ t, x, y, z, rotY, anim })
  }
}

export function removeRemote(id: string) {
  remotes.delete(id)
}

export function clearRemotes() {
  remotes.clear()
}
