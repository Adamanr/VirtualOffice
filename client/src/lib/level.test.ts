import { describe, expect, it } from 'vitest'
import { buildLevelGeometry } from '../scene/levelGeometry'
import { getScreen, level, rotateXZ, zoneAt } from './level'

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
      for (const door of wall.doors ?? []) {
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
    expect(keys.size).toBeLessThan(20)
  })
})
