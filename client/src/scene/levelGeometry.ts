import type { Level, LevelFurniture, LevelWindow, Vec3 } from '../lib/level'
import { rotateXZ } from '../lib/level'

/** Shapes available for instanced rendering. */
export type Shape = 'box' | 'ico' | 'cyl'

/**
 * One instanced piece of static geometry. `size` is the full extent (ico/cyl: diameter in x/z).
 * `color` overrides the material color per instance (drawn in the same draw call).
 */
export interface Piece {
  material: string
  shape: Shape
  center: Vec3
  size: Vec3
  rotY: number
  color?: string
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

// Small deterministic PRNG so desk clutter looks random but is identical for everyone.
function prng(seedText: string) {
  let h = 2166136261
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h >>>= 0) % 10000) / 10000
  }
}

const MUGS = ['#ffffff', '#c8322f', '#2f5fc8', '#f5a524', '#30a46c', '#1d2026']
const BOOKS = ['#8e2c2c', '#2c4a8e', '#2f6b3b', '#c9a227', '#5b3a73', '#d7d2c4', '#1f1f1f', '#a0522d', '#3b7a8c']
const NOTES = ['#fff176', '#f8bbd0', '#ffffff', '#b3e5fc', '#c8e6c9']
const ART = ['#6d8fb3', '#c97b4a', '#7aa36d', '#d9c27a', '#8a6fb0', '#b35c5c', '#4f7f7a']
const SNACKS = ['#e5484d', '#f5a524', '#30a46c', '#4f8cff', '#8e4ec6', '#ffffff', '#1d2026', '#e93d82']

/** Expands level.json into instanced pieces and collider boxes. Pure: covered by tests. */
export function buildLevelGeometry(level: Level): LevelGeometry {
  const pieces: Piece[] = []
  const colliders: ColliderBox[] = []

  // Places a local-space shape of an object at (ox, oz) rotated by r.
  const part = (
    material: string,
    ox: number,
    oz: number,
    r: number,
    local: Vec3,
    size: Vec3,
    shape: Shape = 'box',
    color?: string,
  ) => {
    const [dx, dz] = rotateXZ(local[0], local[2], r)
    pieces.push({ material, shape, center: [ox + dx, local[1], oz + dz], size, rotY: r, ...(color ? { color } : {}) })
  }
  const collider = (ox: number, oz: number, r: number, local: Vec3, size: Vec3) => {
    const [dx, dz] = rotateXZ(local[0], local[2], r)
    colliders.push({ center: [ox + dx, local[1], oz + dz], half: [size[0] / 2, size[1] / 2, size[2] / 2], rotY: r })
  }

  walls()
  for (const desk of level.desks) deskWithClutter(desk.id, desk.position[0], desk.position[1], desk.rotationY)

  // Wall screens get a dark frame; the live picture is drawn slightly in front of it.
  for (const screen of level.screens) {
    if (screen.kind !== 'wall') continue
    const [x, y, z] = screen.position
    const [w, hh] = screen.size
    const [dx, dz] = rotateXZ(0, -0.035, screen.rotationY)
    pieces.push({ material: 'monitor', shape: 'box', center: [x + dx, y, z + dz], size: [w + 0.12, hh + 0.12, 0.06], rotY: screen.rotationY })
  }
  for (const item of level.furniture) furniture(item)
  for (const win of level.windows ?? []) windowPieces(win)
  for (const clock of level.clocks ?? []) {
    const [x, y, z] = clock.position
    const d = clock.radius * 2
    part('white', x, z, clock.rotationY, [0, y, 0.02], [d, d, 0.04], 'cyl')
    part('dark', x, z, clock.rotationY, [0, y, 0.005], [d + 0.05, d + 0.05, 0.03], 'cyl')
  }

  function walls() {
    const h = level.wallHeight
    const t = level.wallThickness
    for (const wall of level.walls) {
      const glass = wall.material === 'glass'
      const material = wall.material ?? 'wall'
      const alongX = wall.from[1] === wall.to[1]
      const a0 = alongX ? Math.min(wall.from[0], wall.to[0]) : Math.min(wall.from[1], wall.to[1])
      const a1 = alongX ? Math.max(wall.from[0], wall.to[0]) : Math.max(wall.from[1], wall.to[1])
      const fixed = alongX ? wall.from[1] : wall.from[0]
      const at = (s: number, y: number, off = 0): Vec3 => (alongX ? [s, y, fixed + off] : [fixed + off, y, s])
      const sized = (len: number, height: number, thick: number): Vec3 => (alongX ? [len, height, thick] : [thick, height, len])
      const box = (mat: string, s0: number, s1: number, y0: number, y1: number, thick: number, solid: boolean, off = 0) => {
        const center = at((s0 + s1) / 2, (y0 + y1) / 2, off)
        const size = sized(s1 - s0, y1 - y0, thick)
        pieces.push({ material: mat, shape: 'box', center, size, rotY: 0 })
        if (solid) colliders.push({ center, half: [size[0] / 2, size[1] / 2, size[2] / 2], rotY: 0 })
      }

      const doors = [...(wall.doors ?? [])].sort((p, q) => p.at - q.at)
      const segments: [number, number][] = []
      let cursor = a0
      for (const door of doors) {
        const d0 = door.at - door.width / 2
        const d1 = door.at + door.width / 2
        if (d0 > cursor) segments.push([cursor, d0])
        // Lintel: solid so the camera does not slip through above the door.
        box(material, d0, d1, DOOR_HEIGHT, h, t, true)
        // Door frame: two jambs and a head, on both faces.
        box('trim', d0 - 0.04, d0 + 0.04, 0, DOOR_HEIGHT, t + 0.06, false)
        box('trim', d1 - 0.04, d1 + 0.04, 0, DOOR_HEIGHT, t + 0.06, false)
        box('trim', d0 - 0.04, d1 + 0.04, DOOR_HEIGHT - 0.04, DOOR_HEIGHT + 0.06, t + 0.06, false)
        if (door.closed) {
          // A pair of wooden doors with small windows (the entrance): drawn and blocking.
          const mid = (d0 + d1) / 2
          box('trim', d0 + 0.04, mid - 0.01, 0, DOOR_HEIGHT - 0.04, t * 0.5, true)
          box('trim', mid + 0.01, d1 - 0.04, 0, DOOR_HEIGHT - 0.04, t * 0.5, true)
          box('window', d0 + 0.2, mid - 0.2, 1.3, 1.9, t * 0.5 + 0.02, false)
          box('window', mid + 0.2, d1 - 0.2, 1.3, 1.9, t * 0.5 + 0.02, false)
          box('metal', mid - 0.12, mid - 0.04, 1.0, 1.08, t * 0.5 + 0.08, false)
          box('metal', mid + 0.04, mid + 0.12, 1.0, 1.08, t * 0.5 + 0.08, false)
        }
        cursor = d1
      }
      if (cursor < a1) segments.push([cursor, a1])

      for (const [s0, s1] of segments) {
        // Wall ends overlap at corners by half a thickness to close the gaps (not at doorways).
        const e0 = !glass && s0 === a0 ? t / 2 : 0
        const e1 = !glass && s1 === a1 ? t / 2 : 0
        box(material, s0 - e0, s1 + e1, 0, h, t, true)
        if (glass) {
          // Aluminium frame: sill, head rail and mullions every ~1.5 m.
          box('metal', s0, s1, 0, 0.1, t + 0.02, false)
          box('metal', s0, s1, DOOR_HEIGHT - 0.03, DOOR_HEIGHT + 0.03, t + 0.02, false)
          const count = Math.max(1, Math.round((s1 - s0) / 1.5))
          for (let i = 0; i <= count; i++) {
            const s = s0 + ((s1 - s0) * i) / count
            box('metal', s - 0.025, s + 0.025, 0, h, t + 0.02, false)
          }
        } else {
          box('trim', s0, s1, 0, 0.1, t + 0.03, false) // baseboard
        }
      }

      // Blinds behind glass walls (e.g. the manager's office).
      for (const [b0, b1] of wall.blinds ?? []) {
        for (let y = 2.2; y > 1.0; y -= 0.07) box('blinds', b0 + 0.05, b1 - 0.05, y - 0.006, y + 0.006, 0.05, false, -(t / 2 + 0.05))
      }
    }
  }

  function windowPieces(win: LevelWindow) {
    const [x, y, z] = win.position
    const r = win.rotationY
    const [w, h] = win.size
    part('window', x, z, r, [0, y, 0.005], [w, h, 0.01])
    part('trim', x, z, r, [0, y + h / 2 + 0.03, 0.03], [w + 0.12, 0.06, 0.06])
    part('trim', x, z, r, [0, y - h / 2 - 0.03, 0.06], [w + 0.16, 0.05, 0.14])
    part('trim', x, z, r, [-w / 2 - 0.03, y, 0.03], [0.06, h, 0.06])
    part('trim', x, z, r, [w / 2 + 0.03, y, 0.03], [0.06, h, 0.06])
    part('trim', x, z, r, [0, y, 0.02], [0.04, h, 0.04]) // mullion
    const covered = h * win.blinds
    for (let d = 0.04; d < covered; d += 0.07) part('blinds', x, z, r, [0, y + h / 2 - d, 0.07], [w - 0.02, 0.012, 0.05])
    part('trim', x, z, r, [0, y + h / 2 - covered, 0.07], [w, 0.03, 0.06])
  }

  // Desks: sitter at local z = -0.75 faces +Z, monitor at local z = +0.15 faces the sitter.
  function deskWithClutter(id: string, x: number, z: number, r: number) {
    part('desk', x, z, r, [0, 0.73, 0], [1.4, 0.04, 0.7])
    part('deskLeg', x, z, r, [-0.66, 0.355, 0], [0.04, 0.71, 0.64])
    part('deskLeg', x, z, r, [0.66, 0.355, 0], [0.04, 0.71, 0.64])
    part('monitor', x, z, r, [0, 1.02, 0.17], [0.64, 0.38, 0.03])
    part('deskLeg', x, z, r, [0, 0.86, 0.2], [0.05, 0.24, 0.05])
    part('deskLeg', x, z, r, [0, 0.755, 0.2], [0.22, 0.01, 0.16])
    part('dark', x, z, r, [0, 0.76, -0.12], [0.44, 0.015, 0.14])
    part('metal', x, z, r, [-0.45, 0.2, 0.15], [0.4, 0.4, 0.5]) // drawer pedestal
    collider(x, z, r, [0, 0.375, 0], [1.4, 0.75, 0.7])
    chair(x, z, r, -0.75)

    const rnd = prng(id)
    if (rnd() < 0.8) {
      const stack = 0.02 + rnd() * 0.1
      part('paper', x, z, r, [0.45, 0.75 + stack / 2, 0.02 + rnd() * 0.1], [0.24, stack, 0.31])
    }
    if (rnd() < 0.85) part('decor', x, z, r, [-0.5 + rnd() * 0.1, 0.805, -0.2], [0.085, 0.1, 0.085], 'cyl', MUGS[Math.floor(rnd() * MUGS.length)])
    if (rnd() < 0.7) part('dark', x, z, r, [-0.48, 0.785, 0.12], [0.2, 0.07, 0.2]) // desk phone
    if (rnd() < 0.5) part('decor', x, z, r, [0.22, 0.775, -0.22], [0.04, 0.05, 0.16], 'box', '#c8322f') // red stapler
    if (rnd() < 0.6) part('decor', x, z, r, [-0.3, 0.83, 0.22], [0.15, 0.17, 0.02], 'box', ART[Math.floor(rnd() * ART.length)]) // photo
    if (rnd() < 0.4) part('plant', x, z, r, [0.55, 0.85, 0.22], [0.16, 0.18, 0.16], 'ico')
  }

  function chair(x: number, z: number, r: number, localZ: number) {
    const [dx, dz] = rotateXZ(0, localZ, r)
    const cx = x + dx
    const cz = z + dz
    part('chair', cx, cz, r, [0, 0.46, 0], [0.46, 0.08, 0.46])
    part('chair', cx, cz, r, [0, 0.76, -0.21], [0.46, 0.52, 0.06])
    part('deskLeg', cx, cz, r, [0, 0.23, 0], [0.06, 0.42, 0.06])
    part('deskLeg', cx, cz, r, [0, 0.02, 0], [0.5, 0.04, 0.5])
    part('deskLeg', cx, cz, r, [-0.25, 0.6, 0], [0.04, 0.04, 0.3])
    part('deskLeg', cx, cz, r, [0.25, 0.6, 0], [0.04, 0.04, 0.3])
  }

  function wallItem(x: number, z: number, r: number, y: number, w: number, h: number, material: string, color?: string) {
    part(material, x, z, r, [0, y, 0.015], [w, h, 0.03], 'box', color)
  }

  function furniture(item: LevelFurniture) {
    const [x, z] = item.position
    const r = item.rotationY ?? 0
    const [w, d] = item.size ?? [1, 1]
    const b = item.base ?? 0
    const y = item.elevation ?? 1.5
    const rnd = prng(`${item.type}:${x}:${z}`)
    switch (item.type) {
      case 'chair':
        chair(x, z, r, 0)
        break
      case 'meeting_table':
        part('wood', x, z, r, [0, 0.74, 0], [w, 0.06, d])
        part('deskLeg', x, z, r, [-w / 3, 0.36, 0], [0.12, 0.72, d * 0.5])
        part('deskLeg', x, z, r, [w / 3, 0.36, 0], [0.12, 0.72, d * 0.5])
        for (let i = 0; i < 4; i++) {
          part('paper', x, z, r, [(rnd() - 0.5) * (w - 0.6), 0.775, (rnd() - 0.5) * (d - 0.5)], [0.21, 0.01, 0.29])
        }
        collider(x, z, r, [0, 0.385, 0], [w, 0.77, d])
        break
      case 'cafe_table':
        part('wood', x, z, r, [0, 0.74, 0], [w, 0.05, d], 'cyl')
        part('deskLeg', x, z, r, [0, 0.37, 0], [0.1, 0.72, 0.1])
        part('deskLeg', x, z, r, [0, 0.02, 0], [0.5, 0.04, 0.5])
        if (rnd() < 0.7) part('decor', x, z, r, [0.2, 0.815, -0.1], [0.085, 0.1, 0.085], 'cyl', MUGS[Math.floor(rnd() * MUGS.length)])
        collider(x, z, r, [0, 0.38, 0], [w * 0.8, 0.76, d * 0.8])
        break
      case 'coffee_table':
        part('wood', x, z, r, [0, 0.4, 0], [w, 0.05, d])
        part('deskLeg', x, z, r, [0, 0.19, 0], [w * 0.8, 0.38, d * 0.8])
        part('decor', x, z, r, [0, 0.43, -d / 5], [0.3, 0.02, 0.22], 'box', ART[Math.floor(rnd() * ART.length)]) // magazine
        collider(x, z, r, [0, 0.21, 0], [w, 0.42, d])
        break
      case 'sofa':
        part('sofa', x, z, r, [0, 0.22, 0.05], [w, 0.44, d - 0.1])
        part('sofa', x, z, r, [0, 0.62, -d / 2 + 0.1], [w, 0.5, 0.2])
        part('sofa', x, z, r, [-w / 2 + 0.1, 0.52, 0.05], [0.2, 0.3, d - 0.1])
        part('sofa', x, z, r, [w / 2 - 0.1, 0.52, 0.05], [0.2, 0.3, d - 0.1])
        part('decor', x, z, r, [-w / 2 + 0.4, 0.56, -d / 2 + 0.28], [0.4, 0.35, 0.12], 'box', ART[Math.floor(rnd() * ART.length)]) // cushion
        collider(x, z, r, [0, 0.43, 0], [w, 0.86, d])
        break
      case 'counter':
        part('counter', x, z, r, [0, 0.45, 0], [w, 0.9, d])
        part('wood', x, z, r, [0, 0.925, 0], [w + 0.04, 0.05, d + 0.04])
        for (let i = 1; i < Math.floor(w / 0.6); i++) part('dark', x, z, r, [-w / 2 + i * 0.6, 0.45, d / 2 + 0.002], [0.01, 0.8, 0.005]) // cabinet doors
        collider(x, z, r, [0, 0.475, 0], [w, 0.95, d])
        break
      case 'plant':
        part('pot', x, z, r, [0, 0.22, 0], [0.4, 0.44, 0.4], 'cyl')
        part('plant', x, z, r, [0, 0.85, 0], [0.8, 0.95, 0.8], 'ico')
        collider(x, z, r, [0, 0.6, 0], [0.45, 1.2, 0.45])
        break
      case 'stage':
        part('stage', x, z, r, [0, 0.15, 0], [w, 0.3, d])
        collider(x, z, r, [0, 0.15, 0], [w, 0.3, d])
        break
      case 'cubicle': {
        // Fabric partitions: a spine between back-to-back desks, side walls and a divider.
        const hw = w / 2 + 0.03
        const hd = d / 2
        const H = 1.25
        part('partition', x, z, r, [0, H / 2, 0], [w + 0.1, H, 0.05])
        part('partition', x, z, r, [-hw, H / 2, 0], [0.05, H, d])
        part('partition', x, z, r, [hw, H / 2, 0], [0.05, H, d])
        part('partition', x, z, r, [0, H / 2, hd / 2], [0.04, H, hd])
        part('partition', x, z, r, [0, H / 2, -hd / 2], [0.04, H, hd])
        part('trim', x, z, r, [0, H + 0.015, 0], [w + 0.14, 0.03, 0.07])
        part('trim', x, z, r, [-hw, H + 0.015, 0], [0.07, 0.03, d])
        part('trim', x, z, r, [hw, H + 0.015, 0], [0.07, 0.03, d])
        collider(x, z, r, [0, H / 2, 0], [w + 0.1, H, 0.05])
        collider(x, z, r, [-hw, H / 2, 0], [0.05, H, d])
        collider(x, z, r, [hw, H / 2, 0], [0.05, H, d])
        // Pinned notes on the spine.
        for (let i = 0; i < 5; i++) {
          const side = rnd() < 0.5 ? -1 : 1
          part('decor', x, z, r, [(rnd() - 0.5) * w * 0.9, 1.0 + rnd() * 0.15, side * 0.03], [0.1, 0.1, 0.005], 'box', NOTES[Math.floor(rnd() * NOTES.length)])
        }
        break
      }
      case 'reception_desk':
        part('wood', x, z, r, [0, 0.55, d / 2 - 0.03], [w, 1.1, 0.06])
        part('counter', x, z, r, [0, 1.12, d / 2 - 0.1], [w + 0.05, 0.04, 0.3])
        part('desk', x, z, r, [0, 0.74, -0.05], [w - 0.1, 0.04, d - 0.1])
        part('wood', x, z, r, [-w / 2 + 0.02, 0.55, 0], [0.04, 1.1, d])
        part('wood', x, z, r, [w / 2 - 0.02, 0.55, 0], [0.04, 1.1, d])
        part('monitor', x, z, r, [0.4, 1.0, 0.05], [0.55, 0.33, 0.03])
        part('dark', x, z, r, [-0.5, 0.79, -0.1], [0.2, 0.07, 0.2])
        part('window', x, z, r, [-0.25, 1.2, d / 2 - 0.1], [0.16, 0.13, 0.16], 'cyl') // candy jar…
        part('decor', x, z, r, [-0.25, 1.17, d / 2 - 0.1], [0.13, 0.07, 0.13], 'cyl', '#e5484d') // …with jelly beans
        part('paper', x, z, r, [0.1, 0.77, -0.15], [0.24, 0.04, 0.31])
        collider(x, z, r, [0, 0.57, 0], [w, 1.14, d])
        break
      case 'manager_desk':
        part('wood', x, z, r, [0, 0.75, 0], [w, 0.05, d])
        part('wood', x, z, r, [0, 0.4, d / 2 - 0.03], [w - 0.05, 0.66, 0.04])
        part('wood', x, z, r, [-w / 2 + 0.23, 0.36, 0], [0.45, 0.72, d - 0.05])
        part('wood', x, z, r, [w / 2 - 0.23, 0.36, 0], [0.45, 0.72, d - 0.05])
        part('monitor', x, z, r, [0.3, 1.02, 0.15], [0.6, 0.36, 0.03])
        part('deskLeg', x, z, r, [0.3, 0.86, 0.18], [0.05, 0.22, 0.05])
        part('white', x, z, r, [-0.6, 0.83, 0.05], [0.095, 0.11, 0.095], 'cyl') // «World's Best Boss» mug
        part('paper', x, z, r, [-0.25, 0.8, -0.1], [0.24, 0.06, 0.31])
        part('dark', x, z, r, [0, 0.8, 0.35], [0.4, 0.06, 0.05]) // name plate
        part('dark', x, z, r, [-0.6, 0.81, -0.25], [0.2, 0.07, 0.2])
        collider(x, z, r, [0, 0.39, 0], [w, 0.78, d])
        break
      case 'conference_phone':
        part('dark', x, z, r, [0, 0.795, 0], [0.3, 0.05, 0.3], 'cyl')
        break
      case 'whiteboard': {
        part('metal', x, z, r, [0, y, 0.008], [w + 0.06, d + 0.06, 0.015])
        wallItem(x, z, r, y, w, d, 'white')
        part('metal', x, z, r, [0, y - d / 2 - 0.02, 0.05], [w * 0.5, 0.025, 0.07])
        const inks = ['#1d4ed8', '#c8322f', '#1d2026', '#15803d']
        for (let i = 0; i < 3; i++) part('decor', x, z, r, [-w * 0.2 + i * 0.12, y - d / 2 - 0.003, 0.055], [0.1, 0.02, 0.02], 'box', inks[i])
        // The writing surface itself is live (drawn by BoardSurfaces), so no fake scribbles here.
        break
      }
      case 'bulletin_board':
        part('trim', x, z, r, [0, y, 0.01], [w + 0.06, d + 0.06, 0.02])
        wallItem(x, z, r, y, w, d, 'decor', '#b58b5a')
        for (let i = 0; i < 9; i++) {
          const nw = 0.15 + rnd() * 0.12
          part('decor', x, z, r, [(rnd() - 0.5) * (w - 0.3), y + (rnd() - 0.5) * (d - 0.3), 0.033], [nw, nw * (1 + rnd() * 0.4), 0.004], 'box', NOTES[Math.floor(rnd() * NOTES.length)])
        }
        break
      case 'picture':
        part('dark', x, z, r, [0, y, 0.012], [w, d, 0.025])
        part('decor', x, z, r, [0, y, 0.026], [w - 0.1, d - 0.1, 0.004], 'box', ART[Math.floor(rnd() * ART.length)])
        part('decor', x, z, r, [(rnd() - 0.5) * 0.2, y - d * 0.12, 0.029], [w * 0.5, d * 0.3, 0.003], 'box', ART[Math.floor(rnd() * ART.length)])
        break
      case 'bookshelf': {
        const H = 1.9
        part('wood', x, z, r, [0, H / 2, -d / 2 + 0.01], [w, H, 0.02])
        part('wood', x, z, r, [-w / 2 + 0.01, H / 2, 0], [0.02, H, d])
        part('wood', x, z, r, [w / 2 - 0.01, H / 2, 0], [0.02, H, d])
        for (let s = 0; s < 5; s++) {
          const sy = 0.05 + s * 0.45
          part('wood', x, z, r, [0, sy, 0], [w, 0.03, d])
          if (s === 4) break
          let bx = -w / 2 + 0.04
          while (bx < w / 2 - 0.08) {
            const bw = 0.025 + rnd() * 0.035
            const bh = 0.24 + rnd() * 0.14
            if (rnd() < 0.9) part('book', x, z, r, [bx + bw / 2, sy + 0.015 + bh / 2, 0.02], [bw, bh, d * 0.75], 'box', BOOKS[Math.floor(rnd() * BOOKS.length)])
            bx += bw + 0.004
          }
        }
        collider(x, z, r, [0, H / 2, 0], [w, H, d])
        break
      }
      case 'filing_cabinet':
        part('metal', x, z, r, [0, 0.66, 0], [0.5, 1.32, 0.6])
        for (let i = 0; i < 4; i++) {
          const dy = 0.17 + i * 0.32
          part('dark', x, z, r, [0, dy + 0.155, 0.301], [0.46, 0.008, 0.004])
          part('dark', x, z, r, [0, dy + 0.02, 0.31], [0.12, 0.02, 0.02])
          part('white', x, z, r, [0, dy + 0.08, 0.301], [0.08, 0.04, 0.003])
        }
        collider(x, z, r, [0, 0.66, 0], [0.5, 1.32, 0.6])
        break
      case 'water_cooler':
        part('white', x, z, r, [0, 0.5, 0], [0.34, 1.0, 0.34])
        part('window', x, z, r, [0, 1.22, 0], [0.28, 0.44, 0.28], 'cyl')
        part('decor', x, z, r, [-0.06, 0.8, 0.18], [0.04, 0.05, 0.04], 'box', '#2f5fc8')
        part('decor', x, z, r, [0.06, 0.8, 0.18], [0.04, 0.05, 0.04], 'box', '#c8322f')
        collider(x, z, r, [0, 0.72, 0], [0.36, 1.44, 0.36])
        break
      case 'copier':
        part('white', x, z, r, [0, 0.45, 0], [1.0, 0.9, 0.7])
        part('dark', x, z, r, [0, 0.93, 0], [0.95, 0.06, 0.66])
        part('dark', x, z, r, [0.3, 0.97, 0.25], [0.3, 0.03, 0.14])
        part('decor', x, z, r, [0.42, 0.99, 0.28], [0.03, 0.01, 0.03], 'box', '#3ddc84')
        part('paper', x, z, r, [-0.62, 0.7, 0], [0.26, 0.03, 0.32])
        for (let i = 0; i < 3; i++) part('dark', x, z, r, [0, 0.2 + i * 0.2, 0.351], [0.9, 0.006, 0.003])
        collider(x, z, r, [0, 0.48, 0], [1.0, 0.96, 0.7])
        break
      case 'vending_machine': {
        part('vending', x, z, r, [0, 0.95, 0], [0.9, 1.9, 0.8], 'box', item.color ?? '#c8322f')
        part('dark', x, z, r, [-0.08, 1.15, 0.401], [0.62, 1.35, 0.01])
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 4; col++) {
            part('decor', x, z, r, [-0.32 + col * 0.15, 0.62 + row * 0.25, 0.41], [0.1, 0.13, 0.01], 'box', SNACKS[Math.floor(rnd() * SNACKS.length)])
          }
        }
        part('metal', x, z, r, [0.34, 1.2, 0.405], [0.14, 0.4, 0.015])
        part('dark', x, z, r, [-0.08, 0.26, 0.405], [0.55, 0.14, 0.015])
        collider(x, z, r, [0, 0.95, 0], [0.9, 1.9, 0.8])
        break
      }
      case 'fridge':
        part('white', x, z, r, [0, 0.95, 0], [0.8, 1.9, 0.7])
        part('metal', x, z, r, [0, 1.25, 0.351], [0.78, 0.01, 0.004])
        part('metal', x, z, r, [0.33, 1.55, 0.37], [0.03, 0.4, 0.03])
        part('metal', x, z, r, [0.33, 0.85, 0.37], [0.03, 0.4, 0.03])
        for (let i = 0; i < 4; i++) {
          part('decor', x, z, r, [-0.25 + rnd() * 0.4, 1.4 + rnd() * 0.4, 0.352], [0.09, 0.09, 0.004], 'box', NOTES[Math.floor(rnd() * NOTES.length)]) // magnets & notes
        }
        collider(x, z, r, [0, 0.95, 0], [0.8, 1.9, 0.7])
        break
      case 'microwave':
        part('white', x, z, r, [0, 0.95 + 0.15, 0], [0.5, 0.3, 0.36])
        part('dark', x, z, r, [-0.05, 1.1, 0.181], [0.3, 0.2, 0.004])
        break
      case 'coffee_machine':
        part('dark', x, z, r, [0, 0.95 + 0.2, 0], [0.3, 0.4, 0.3])
        part('window', x, z, r, [0, 1.03, 0.08], [0.14, 0.14, 0.14], 'cyl')
        break
      case 'trash_bin':
        part('dark', x, z, r, [0, 0.2, 0], [0.3, 0.4, 0.3], 'cyl')
        break
      case 'podium':
        part('wood', x, z, r, [0, b + 0.55, 0], [0.7, 1.1, 0.5])
        part('wood', x, z, r, [0, b + 1.12, -0.03], [0.76, 0.05, 0.58])
        part('dark', x, z, r, [0, b + 1.25, 0.18], [0.02, 0.25, 0.02])
        collider(x, z, r, [0, b + 0.57, 0], [0.7, 1.14, 0.5])
        break
      case 'fire_alarm':
        part('decor', x, z, r, [0, y, 0.035], [0.16, 0.22, 0.07], 'box', '#c8322f')
        part('white', x, z, r, [0, y - 0.02, 0.072], [0.1, 0.05, 0.02])
        part('decor', x, z, r, [0, y + 0.07, 0.072], [0.1, 0.03, 0.005], 'box', '#ffffff')
        part('decor', x, z, r, [0, y + 0.28, 0.06], [0.1, 0.1, 0.12], 'cyl', '#e5484d') // strobe
        break
      case 'rug':
        part('rug', x, z, r, [0, 0.006, 0], [w, 0.008, d], 'box', item.color ?? '#8c6d5a')
        break
    }
  }

  return { pieces, colliders }
}
