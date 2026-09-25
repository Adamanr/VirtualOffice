import { describe, expect, it } from 'vitest'
import { ClockSync, lerpAngle, MAX_EXTRAPOLATION_MS, SnapshotBuffer } from './interpolation'

const snap = (t: number, x: number, rotY = 0, anim = 1) => ({ t, x, y: 0, z: 0, rotY, anim })

describe('SnapshotBuffer', () => {
  it('returns null when empty and the only snapshot otherwise', () => {
    const b = new SnapshotBuffer()
    expect(b.sample(0)).toBeNull()
    b.push(snap(100, 5))
    expect(b.sample(0)?.x).toBe(5)
    expect(b.sample(1000)?.x).toBe(5)
  })

  it('interpolates linearly between the surrounding snapshots', () => {
    const b = new SnapshotBuffer()
    b.push(snap(0, 0))
    b.push(snap(100, 1))
    b.push(snap(200, 3))
    expect(b.sample(50)?.x).toBeCloseTo(0.5)
    expect(b.sample(150)?.x).toBeCloseTo(2)
  })

  it('is smooth under jittery arrival as long as the delay covers it', () => {
    const b = new SnapshotBuffer()
    // 15 Hz updates of constant 3 m/s motion
    for (let i = 0; i < 10; i++) b.push(snap(i * 66, i * 0.2))
    const xs = [300, 310, 320, 330].map((t) => b.sample(t)!.x)
    const steps = xs.slice(1).map((x, i) => x - xs[i]!)
    for (const s of steps) expect(s).toBeCloseTo(0.2 * (10 / 66), 5)
  })

  it('drops out-of-order snapshots', () => {
    const b = new SnapshotBuffer()
    b.push(snap(100, 1))
    b.push(snap(50, 99))
    expect(b.size).toBe(1)
  })

  it('extrapolates briefly when data runs out, then holds', () => {
    const b = new SnapshotBuffer()
    b.push(snap(0, 0))
    b.push(snap(100, 1))
    expect(b.sample(150)?.x).toBeCloseTo(1.5)
    expect(b.sample(100 + MAX_EXTRAPOLATION_MS + 500)?.x).toBeCloseTo(1 + MAX_EXTRAPOLATION_MS / 100)
  })

  it('does not extrapolate idle players', () => {
    const b = new SnapshotBuffer()
    b.push(snap(0, 0))
    b.push(snap(100, 1, 0, 0))
    expect(b.sample(200)?.x).toBe(1)
  })

  it('interpolates rotation along the shortest arc', () => {
    const b = new SnapshotBuffer()
    b.push(snap(0, 0, Math.PI - 0.1))
    b.push(snap(100, 0, -Math.PI + 0.1))
    const r = b.sample(50)!.rotY
    expect(Math.abs(Math.atan2(Math.sin(r), Math.cos(r)))).toBeCloseTo(Math.PI, 5)
  })

  it('bounds memory', () => {
    const b = new SnapshotBuffer(8)
    for (let i = 0; i < 100; i++) b.push(snap(i, i))
    expect(b.size).toBe(8)
  })
})

describe('lerpAngle', () => {
  it('wraps around ±π', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1)
  })
})

describe('ClockSync', () => {
  it('maps server time onto local time using the fastest observed path', () => {
    const c = new ClockSync()
    c.sample(1000, 5050) // 50 ms latency + unknown clock skew
    c.sample(1066, 5106) // 40 ms: faster path wins immediately
    expect(c.toServer(5106)).toBe(1066)
    c.sample(1132, 5300) // 168 ms jitter spike: estimate moves only 2% of the way
    expect(c.toServer(5300)).toBeCloseTo(5300 - 4040 - 128 * 0.02)
  })
})
