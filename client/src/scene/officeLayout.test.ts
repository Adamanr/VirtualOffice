import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { level } from '../lib/level'
import { buildLevelGeometry } from './levelGeometry'
import { placedBox, placements } from './officeLayout'

/** The building's walls as world boxes (a level without furniture: walls and doors only). */
function wallBoxes() {
  const bare = { ...level, furniture: [], desks: [], screens: [], windows: [], clocks: [] }
  return buildLevelGeometry(bare).colliders.map((c) => {
    const half = new THREE.Vector3(...c.half)
    if (Math.abs(Math.sin(c.rotY)) > 0.5) half.set(half.z, half.y, half.x)
    const center = new THREE.Vector3(...c.center)
    return new THREE.Box3(center.clone().sub(half), center.clone().add(half))
  })
}

describe('office furniture models', () => {
  const all = placements(level)

  it('places a model for every desk, chair and piece of furniture', () => {
    expect(all.filter((p) => p.model === 'desk')).toHaveLength(level.desks.length)
    expect(all.length).toBeGreaterThan(150)
  })

  it('never pokes through a wall', () => {
    const walls = wallBoxes()
    const through: string[] = []
    for (const p of all) {
      const box = placedBox(p).expandByScalar(-0.01) // touching is fine
      if (walls.some((w) => w.intersectsBox(box))) {
        const c = box.getCenter(new THREE.Vector3())
        through.push(`${p.model} at (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`)
      }
    }
    expect(through).toEqual([])
  })

  it('furnishes each room in its own style', () => {
    const at = (model: string) => all.filter((p) => p.model === model).length
    expect(at('conference_chair')).toBeGreaterThan(30) // the hall
    expect(at('cafe_chair')).toBeGreaterThan(4) // the kitchen
    expect(at('office_chair')).toBeGreaterThanOrEqual(level.desks.length)
  })
})
