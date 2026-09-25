import { describe, expect, it } from 'vitest'
import { chargeAt, landingTime, MAX_SPEED, MIN_SPEED, positionAt, throwVelocity } from './toss'

describe('toss ballistics', () => {
  it('matches the server formula p = o + v t + ½ g t²', () => {
    const p = positionAt([1, 1.4, 2], [2, 4.4, -1], 1)
    expect(p[0]).toBeCloseTo(3)
    expect(p[1]).toBeCloseTo(1.4 + 4.4 - 4.905)
    expect(p[2]).toBeCloseTo(1)
  })

  it('throws along the camera direction with a speed set by the charge', () => {
    const v = throwVelocity(0, 0)
    expect(v[0]).toBeCloseTo(0)
    expect(v[2]).toBeLessThan(0) // yaw 0 looks toward -Z
    expect(Math.hypot(...v)).toBeCloseTo(MIN_SPEED)
    expect(Math.hypot(...throwVelocity(1.2, 1))).toBeCloseTo(MAX_SPEED)
    // Server rejects anything faster than 14 m/s.
    expect(Math.hypot(...throwVelocity(0, 5))).toBeLessThanOrEqual(14)
  })

  it('finds the landing time on the floor', () => {
    const o: [number, number, number] = [0, 1.4, 0]
    const v = throwVelocity(0, 0.5)
    const t = landingTime(o, v)
    expect(positionAt(o, v, t)[1]).toBeCloseTo(0.05)
  })

  it('charge swings 0 → 1 → 0', () => {
    expect(chargeAt(0)).toBe(0)
    expect(chargeAt(700)).toBeCloseTo(1)
    expect(chargeAt(1400)).toBeCloseTo(0)
  })
})
