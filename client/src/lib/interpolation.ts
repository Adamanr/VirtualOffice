/** A remote player's state at server time `t` (ms). */
export interface Snapshot {
  t: number
  x: number
  y: number
  z: number
  rotY: number
  anim: number
}

export type Pose = Omit<Snapshot, 't'>

/** How far behind the newest data we render, so there is (almost) always a pair to interpolate between. */
export const INTERP_DELAY_MS = 100
/** Beyond the newest snapshot we extrapolate at most this long, then hold. */
export const MAX_EXTRAPOLATION_MS = 150

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function lerpAngle(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * k
}

/**
 * Time-ordered buffer of snapshots, sampled at `now - INTERP_DELAY_MS`
 * (in server time) for jitter-free motion of remote players.
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = []
  private readonly capacity: number

  constructor(capacity = 32) {
    this.capacity = capacity
  }

  get size() {
    return this.snaps.length
  }

  latest(): Snapshot | undefined {
    return this.snaps[this.snaps.length - 1]
  }

  push(s: Snapshot) {
    const last = this.latest()
    if (last && s.t <= last.t) {
      if (s.t === last.t) this.snaps[this.snaps.length - 1] = s
      return // out of order: drop
    }
    this.snaps.push(s)
    if (this.snaps.length > this.capacity) this.snaps.shift()
  }

  /** Teleports (e.g. server correction or a fresh join): forget history. */
  reset(s: Snapshot) {
    this.snaps = [s]
  }

  sample(t: number, out: Pose = { x: 0, y: 0, z: 0, rotY: 0, anim: 0 }): Pose | null {
    const snaps = this.snaps
    const n = snaps.length
    if (n === 0) return null
    const first = snaps[0]!
    if (n === 1 || t <= first.t) return assign(out, first)

    const last = snaps[n - 1]!
    if (t >= last.t) {
      // Players go idle by simply not sending: with an idle anim we hold still,
      // otherwise extrapolate a little along the last velocity.
      const prev = snaps[n - 2]!
      const dt = last.t - prev.t
      const ahead = Math.min(t - last.t, MAX_EXTRAPOLATION_MS)
      if (last.anim === 0 || dt <= 0 || ahead <= 0) return assign(out, last)
      const k = ahead / dt
      out.x = last.x + (last.x - prev.x) * k
      out.y = last.y
      out.z = last.z + (last.z - prev.z) * k
      out.rotY = last.rotY
      out.anim = last.anim
      return out
    }

    // Drop snapshots we will never need again (keep one before t).
    let i = 1
    while (i < n && snaps[i]!.t < t) i++
    if (i > 2) {
      this.snaps.splice(0, i - 2)
      i = 2
    }
    const a = this.snaps[i - 1]!
    const b = this.snaps[i]!
    const k = (t - a.t) / (b.t - a.t)
    out.x = lerp(a.x, b.x, k)
    out.y = lerp(a.y, b.y, k)
    out.z = lerp(a.z, b.z, k)
    out.rotY = lerpAngle(a.rotY, b.rotY, k)
    out.anim = k < 0.5 ? a.anim : b.anim
    return out
  }
}

function assign(out: Pose, s: Snapshot): Pose {
  out.x = s.x
  out.y = s.y
  out.z = s.z
  out.rotY = s.rotY
  out.anim = s.anim
  return out
}

/**
 * Maps server timestamps to the local clock. Tracks offset = localReceive - serverT:
 * a lower sample means a faster path, so we jump down to it; higher samples
 * (network jitter) only pull the estimate up slowly, which also absorbs drift.
 */
export class ClockSync {
  private offset: number | null = null

  sample(serverT: number, localNow: number) {
    const s = localNow - serverT
    if (this.offset === null || s < this.offset) this.offset = s
    else this.offset += (s - this.offset) * 0.02
  }

  /** Server time corresponding to `localNow`; falls back to localNow before the first sample. */
  toServer(localNow: number): number {
    return this.offset === null ? localNow : localNow - this.offset
  }
}
