import type { Level, LevelFurniture, Vec3 } from '../lib/level'
import { rotateXZ } from '../lib/level'

/** Shapes available for instanced rendering. */
export type Shape = 'box' | 'ico'

/** One instanced piece of static geometry. `size` is the full extent (for ico: diameter). */
export interface Piece {
  material: string
  shape: Shape
  center: Vec3
  size: Vec3
  rotY: number
}

/** Axis-aligned-in-local-space collider box (half extents), rotated by rotY. */
export interface ColliderBox {
  center: Vec3
  half: Vec3
  rotY: number
}

export interface LevelGeometry {
  pieces: Piece[]
  colliders: ColliderBox[]
}

const DOOR_HEIGHT = 2.3

/** Expands level.json into instanced pieces and collider boxes. Pure: covered by tests. */
export function buildLevelGeometry(level: Level): LevelGeometry {
  const pieces: Piece[] = []
  const colliders: ColliderBox[] = []

  // Places a local-space box of an object at (ox, oz) rotated by r.
  const part = (
    material: string,
    ox: number,
    oz: number,
    r: number,
    local: Vec3,
    size: Vec3,
    shape: Shape = 'box',
  ) => {
    const [dx, dz] = rotateXZ(local[0], local[2], r)
    pieces.push({ material, shape, center: [ox + dx, local[1], oz + dz], size, rotY: r })
  }
  const collider = (ox: number, oz: number, r: number, local: Vec3, size: Vec3) => {
    const [dx, dz] = rotateXZ(local[0], local[2], r)
    colliders.push({ center: [ox + dx, local[1], oz + dz], half: [size[0] / 2, size[1] / 2, size[2] / 2], rotY: r })
  }

  // Walls, split around doorways, with a lintel above each door.
  const h = level.wallHeight
  const t = level.wallThickness
  for (const wall of level.walls) {
    const material = wall.material ?? 'wall'
    const alongX = wall.from[1] === wall.to[1]
    const a0 = alongX ? Math.min(wall.from[0], wall.to[0]) : Math.min(wall.from[1], wall.to[1])
    const a1 = alongX ? Math.max(wall.from[0], wall.to[0]) : Math.max(wall.from[1], wall.to[1])
    const fixed = alongX ? wall.from[1] : wall.from[0]
    const doors = [...(wall.doors ?? [])].sort((p, q) => p.at - q.at)
    const segments: [number, number][] = []
    let cursor = a0
    for (const door of doors) {
      const d0 = door.at - door.width / 2
      const d1 = door.at + door.width / 2
      if (d0 > cursor) segments.push([cursor, d0])
      pushWallBox(material, d0, d1, DOOR_HEIGHT, h, false)
      cursor = d1
    }
    if (cursor < a1) segments.push([cursor, a1])
    for (const [s0, s1] of segments) pushWallBox(material, s0, s1, 0, h, true)

    function pushWallBox(mat: string, s0: number, s1: number, y0: number, y1: number, solid: boolean) {
      // Outer walls overlap at corners by half a thickness to close the gaps.
      const len = s1 - s0 + (solid ? t : 0)
      const mid = (s0 + s1) / 2
      const center: Vec3 = alongX ? [mid, (y0 + y1) / 2, fixed] : [fixed, (y0 + y1) / 2, mid]
      const size: Vec3 = alongX ? [len, y1 - y0, t] : [t, y1 - y0, len]
      pieces.push({ material: mat, shape: 'box', center, size, rotY: 0 })
      if (solid) colliders.push({ center, half: [size[0] / 2, size[1] / 2, size[2] / 2], rotY: 0 })
    }
  }

  // Desks: sitter at local z = -0.75 faces +Z, monitor at local z = +0.15 faces the sitter.
  for (const desk of level.desks) {
    const [x, z] = desk.position
    const r = desk.rotationY
    part('desk', x, z, r, [0, 0.73, 0], [1.4, 0.04, 0.7])
    part('deskLeg', x, z, r, [-0.66, 0.355, 0], [0.04, 0.71, 0.64])
    part('deskLeg', x, z, r, [0.66, 0.355, 0], [0.04, 0.71, 0.64])
    part('monitor', x, z, r, [0, 1.02, 0.17], [0.64, 0.38, 0.03])
    part('deskLeg', x, z, r, [0, 0.86, 0.2], [0.05, 0.24, 0.05])
    part('deskLeg', x, z, r, [0, 0.755, 0.2], [0.22, 0.01, 0.16])
    part('monitor', x, z, r, [0, 0.76, -0.12], [0.44, 0.015, 0.14])
    collider(x, z, r, [0, 0.375, 0], [1.4, 0.75, 0.7])
    chair(x, z, r, -0.75)
  }

  // Wall screens get a dark frame; the live picture is drawn slightly in front of it.
  for (const screen of level.screens) {
    if (screen.kind !== 'wall') continue
    const [x, y, z] = screen.position
    const [w, hh] = screen.size
    const [dx, dz] = rotateXZ(0, -0.035, screen.rotationY)
    pieces.push({ material: 'monitor', shape: 'box', center: [x + dx, y, z + dz], size: [w + 0.12, hh + 0.12, 0.06], rotY: screen.rotationY })
  }

  for (const item of level.furniture) furniture(item)

  function chair(x: number, z: number, r: number, localZ: number) {
    const [dx, dz] = rotateXZ(0, localZ, r)
    const cx = x + dx
    const cz = z + dz
    part('chair', cx, cz, r, [0, 0.46, 0], [0.46, 0.08, 0.46])
    part('chair', cx, cz, r, [0, 0.76, -0.21], [0.46, 0.52, 0.06])
    part('deskLeg', cx, cz, r, [0, 0.23, 0], [0.06, 0.42, 0.06])
    part('deskLeg', cx, cz, r, [0, 0.02, 0], [0.5, 0.04, 0.5])
  }

  function furniture(item: LevelFurniture) {
    const [x, z] = item.position
    const r = item.rotationY ?? 0
    const [w, d] = item.size ?? [1, 1]
    switch (item.type) {
      case 'chair':
        chair(x, z, r, 0)
        break
      case 'meeting_table':
        part('wood', x, z, r, [0, 0.74, 0], [w, 0.06, d])
        part('deskLeg', x, z, r, [-w / 3, 0.36, 0], [0.12, 0.72, d * 0.5])
        part('deskLeg', x, z, r, [w / 3, 0.36, 0], [0.12, 0.72, d * 0.5])
        collider(x, z, r, [0, 0.385, 0], [w, 0.77, d])
        break
      case 'cafe_table':
        part('wood', x, z, r, [0, 0.74, 0], [w, 0.05, d])
        part('deskLeg', x, z, r, [0, 0.37, 0], [0.1, 0.72, 0.1])
        part('deskLeg', x, z, r, [0, 0.02, 0], [0.5, 0.04, 0.5])
        collider(x, z, r, [0, 0.38, 0], [w, 0.76, d])
        break
      case 'coffee_table':
        part('wood', x, z, r, [0, 0.4, 0], [w, 0.05, d])
        part('deskLeg', x, z, r, [0, 0.19, 0], [w * 0.8, 0.38, d * 0.8])
        collider(x, z, r, [0, 0.21, 0], [w, 0.42, d])
        break
      case 'sofa':
        part('sofa', x, z, r, [0, 0.22, 0.05], [w, 0.44, d - 0.1])
        part('sofa', x, z, r, [0, 0.62, -d / 2 + 0.1], [w, 0.5, 0.2])
        part('sofa', x, z, r, [-w / 2 + 0.1, 0.52, 0.05], [0.2, 0.3, d - 0.1])
        part('sofa', x, z, r, [w / 2 - 0.1, 0.52, 0.05], [0.2, 0.3, d - 0.1])
        collider(x, z, r, [0, 0.43, 0], [w, 0.86, d])
        break
      case 'counter':
        part('counter', x, z, r, [0, 0.45, 0], [w, 0.9, d])
        part('wood', x, z, r, [0, 0.925, 0], [w + 0.04, 0.05, d + 0.04])
        collider(x, z, r, [0, 0.475, 0], [w, 0.95, d])
        break
      case 'plant':
        part('pot', x, z, r, [0, 0.22, 0], [0.4, 0.44, 0.4])
        part('plant', x, z, r, [0, 0.85, 0], [0.8, 0.95, 0.8], 'ico')
        collider(x, z, r, [0, 0.6, 0], [0.45, 1.2, 0.45])
        break
      case 'stage':
        part('stage', x, z, r, [0, 0.15, 0], [w, 0.3, d])
        collider(x, z, r, [0, 0.15, 0], [w, 0.3, d])
        break
    }
  }

  return { pieces, colliders }
}
