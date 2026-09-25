import { describe, expect, it } from 'vitest'
import { buildLevelGeometry } from '../scene/levelGeometry'
import { buildSeats, getScreen, level, rotateXZ, seats, zoneAt } from './level'

describe('zoneAt', () => {
  it('resolves rooms before the open space that contains them', () => {
    expect(zoneAt(level, -15, -9)?.id).toBe('meeting_room_1')
    expect(zoneAt(level, 12, -5)?.id).toBe('hall')
    expect(zoneAt(level, -8, 6)?.id).toBe('open_space')
    expect(zoneAt(level, 100, 100)).toBeNull()
  })
})

describe('rotateXZ', () => {
  it('matches three.js rotation.y (forward = (sin r, cos r))', () => {
    const [x, z] = rotateXZ(0, 1, Math.PI / 2)
    expect(x).toBeCloseTo(1)
    expect(z).toBeCloseTo(0)
  })
})

describe('level data', () => {
  it('every screen references an existing zone and every desk an existing screen', () => {
    const zones = new Set(level.zones.map((z) => z.id))
    for (const s of level.screens) expect(zones.has(s.zoneId)).toBe(true)
    for (const d of level.desks) expect(getScreen(d.screenId)?.deskId).toBe(d.id)
  })

  it('wall screens sit inside their zone', () => {
    for (const s of level.screens) {
      expect(zoneAt(level, s.position[0], s.position[2])?.id).toBe(s.zoneId)
    }
  })
})

describe('buildLevelGeometry', () => {
  const geo = buildLevelGeometry(level)

  it('leaves doorways free of colliders', () => {
    for (const wall of level.walls) {
      for (const door of (wall.doors ?? []).filter((d) => !d.closed)) {
        const alongX = wall.from[1] === wall.to[1]
        const px = alongX ? door.at : wall.from[0]
        const pz = alongX ? wall.from[1] : door.at
        const blocked = geo.colliders.some(
          (c) =>
            c.rotY === 0 &&
            c.center[1] - c.half[1] < 1 &&
            Math.abs(px - c.center[0]) < c.half[0] &&
            Math.abs(pz - c.center[2]) < c.half[2],
        )
        expect(blocked, `door at ${door.at}`).toBe(false)
      }
    }
  })

  it('keeps the number of distinct materials (≈ draw calls) small', () => {
    const keys = new Set(geo.pieces.map((p) => `${p.material}:${p.shape}`))
    expect(keys.size).toBeLessThan(40)
  })

  const blocked = (x: number, z: number, y = 0.9) =>
    geo.colliders.some((c) => {
      // Point in rotated box (XZ), and within its height.
      const dx = x - c.center[0]
      const dz = z - c.center[2]
      const lx = dx * Math.cos(-c.rotY) + dz * Math.sin(-c.rotY)
      const lz = -dx * Math.sin(-c.rotY) + dz * Math.cos(-c.rotY)
      return Math.abs(lx) < c.half[0] && Math.abs(lz) < c.half[2] && Math.abs(y - c.center[1]) < c.half[1]
    })

  it('spawns outside any collider', () => {
    expect(blocked(level.spawn.position[0], level.spawn.position[1])).toBe(false)
  })

  it('lets you stand up from every seat into free space', () => {
    for (const s of seats) expect(blocked(s.exit[0], s.exit[1]), s.id).toBe(false)
  })
})

describe('seats', () => {
  it('derives desk, chair and sofa seats', () => {
    const kinds = new Set(seats.map((s) => s.kind))
    expect(kinds).toEqual(new Set(['desk', 'chair', 'sofa']))
    expect(seats.filter((s) => s.kind === 'desk')).toHaveLength(level.desks.length)
    expect(new Set(seats.map((s) => s.id)).size).toBe(seats.length)
  })

  it('chairs in rooms with a screen look at that screen; desks at their monitor', () => {
    const conference = seats.filter((s) => s.kind === 'chair' && s.zoneId === 'meeting_room_1')
    expect(conference.length).toBeGreaterThan(0)
    for (const s of conference) expect(s.screenId).toBe('meeting_room_1_screen')
    const hall = seats.filter((s) => s.zoneId === 'hall')
    expect(hall.length).toBeGreaterThan(20)
    for (const s of hall) expect(s.screenId).toBe('hall_screen')
    for (const s of seats.filter((x) => x.kind === 'desk')) expect(getScreen(s.screenId!)?.deskId).toBe(s.deskId)
    expect(seats.find((s) => s.zoneId === 'kitchen' && s.kind === 'chair')?.screenId).toBeNull()
  })

  it('is a pure function of the level', () => {
    expect(buildSeats(level)).toEqual(seats)
  })
})
