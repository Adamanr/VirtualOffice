import { describe, expect, it } from 'vitest'
import { getZone, level, zoneAt } from './level'
import {
  audibility,
  canSeeScreen,
  HEAR_FULL,
  HEAR_MAX,
  panFor,
  pickVideoTiles,
  screenAudibility,
  SUBSCRIBE_RADIUS,
  UNSUBSCRIBE_RADIUS,
  volumeAtDistance,
} from './audio'

const isolated = (id: string | null) => getZone(id)?.isolated ?? false
const at = (x: number, z: number) => ({ x, z, zoneId: zoneAt(level, x, z)?.id ?? null })
const listener = (x: number, z: number, yaw = 0) => ({ ...at(x, z), yaw })

describe('volumeAtDistance', () => {
  it('is full up close, silent after HEAR_MAX, monotonic in between', () => {
    expect(volumeAtDistance(0)).toBe(1)
    expect(volumeAtDistance(HEAR_FULL)).toBe(1)
    expect(volumeAtDistance(HEAR_MAX)).toBe(0)
    expect(volumeAtDistance(50)).toBe(0)
    let prev = 1
    for (let d = HEAR_FULL; d <= HEAR_MAX; d += 0.5) {
      const v = volumeAtDistance(d)
      expect(v).toBeLessThanOrEqual(prev)
      prev = v
    }
  })
})

describe('audibility in the open space', () => {
  it('fades with distance', () => {
    const a = audibility(listener(-8, 6), at(-7, 6), isolated)
    const b = audibility(listener(-8, 6), at(-2, 6), isolated)
    const c = audibility(listener(-8, 6), at(3, 6), isolated)
    expect(a.volume).toBe(1)
    expect(b.volume).toBeGreaterThan(0)
    expect(b.volume).toBeLessThan(1)
    expect(c.volume).toBe(0)
  })

  it('subscribes with hysteresis', () => {
    const d = (SUBSCRIBE_RADIUS + UNSUBSCRIBE_RADIUS) / 2
    expect(audibility(listener(-15, 1), at(-15 + d, 1), isolated, false).subscribe).toBe(false)
    expect(audibility(listener(-15, 1), at(-15 + d, 1), isolated, true).subscribe).toBe(true)
    expect(audibility(listener(-15, 1), at(-15 + UNSUBSCRIBE_RADIUS + 1, 1), isolated, true).subscribe).toBe(false)
  })

  it('open space and kitchen hear each other across the doorway', () => {
    const r = audibility(listener(3, 10), at(6, 10), isolated)
    expect(r.volume).toBeGreaterThan(0.5)
  })
})

describe('audibility with isolated rooms', () => {
  it('inside the same room everyone is at full volume regardless of distance', () => {
    const r = audibility(listener(-19, -14), at(-11, -4), isolated)
    expect(r.distance).toBeGreaterThan(HEAR_MAX)
    expect(r.volume).toBe(1)
    expect(r.subscribe).toBe(true)
  })

  it('nobody hears through the room boundary, in either direction', () => {
    // 1 m apart, across the glass wall of meeting room 1
    const inside = listener(-15, -3.5)
    const outside = listener(-15, -2.5)
    expect(audibility(inside, outside, isolated).volume).toBe(0)
    expect(audibility(outside, inside, isolated).volume).toBe(0)
    expect(audibility(outside, inside, isolated).subscribe).toBe(false)
  })

  it('two different isolated rooms are separate', () => {
    expect(audibility(listener(-11, -9), at(-9, -9), isolated).volume).toBe(0)
  })
})

describe('panFor', () => {
  it('puts a source on the right of the camera to the right', () => {
    // yaw 0: camera looks toward -Z, so +X is to the right
    expect(panFor(listener(0, 0, 0), at(3, 0), 3)).toBeGreaterThan(0)
    expect(panFor(listener(0, 0, 0), at(-3, 0), 3)).toBeLessThan(0)
    expect(panFor(listener(0, 0, 0), at(0, -3), 3)).toBeCloseTo(0)
    // turned around (yaw π): +X is now on the left
    expect(panFor(listener(0, 0, Math.PI), at(3, 0), 3)).toBeLessThan(0)
  })
})

describe('canSeeScreen', () => {
  it('wall screens need the same zone, desk monitors also need proximity', () => {
    const hall = level.screens.find((s) => s.id === 'hall_screen')!
    expect(canSeeScreen(at(10, -5), hall)).toBe(true)
    expect(canSeeScreen(at(2, -5), hall)).toBe(false)
    const desk = level.screens.find((s) => s.kind === 'desk')!
    expect(canSeeScreen(at(desk.position[0] + 1, desk.position[2]), desk)).toBe(true)
    expect(canSeeScreen(at(desk.position[0] + 10, desk.position[2]), desk)).toBe(false)
  })
})

describe('pickVideoTiles', () => {
  it('shows the nearest audible people first, capped', () => {
    const ids = pickVideoTiles(
      [
        { id: 'far', distance: 8, audible: true },
        { id: 'near', distance: 1, audible: true },
        { id: 'muted-room', distance: 0.5, audible: false },
        { id: 'mid', distance: 4, audible: true },
      ],
      2,
    )
    expect(ids).toEqual(['near', 'mid'])
  })
})

describe('screenAudibility (shared browser sound)', () => {
  const hall = level.screens.find((s) => s.id === 'hall_screen')!
  const desk = level.screens.find((s) => s.kind === 'desk')!

  it('fills an isolated room and stays inside it', () => {
    expect(screenAudibility(at(6, -12), hall, isolated)).toBe(1)
    expect(screenAudibility(at(2, -5), hall, isolated)).toBe(0)
  })

  it('fades around a desk monitor', () => {
    const near = at(desk.position[0] + 1, desk.position[2])
    const mid = at(desk.position[0] + 3.5, desk.position[2])
    const far = at(desk.position[0] + 8, desk.position[2])
    expect(screenAudibility(near, desk, isolated)).toBe(1)
    expect(screenAudibility(mid, desk, isolated)).toBeGreaterThan(0)
    expect(screenAudibility(mid, desk, isolated)).toBeLessThan(1)
    expect(screenAudibility(far, desk, isolated)).toBe(0)
  })
})
