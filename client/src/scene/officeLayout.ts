import * as THREE from 'three'
import type { Level, LevelFurniture } from '../lib/level'
import { rotateXZ, zoneAt } from '../lib/level'
import bounds from '../../public/office/models.json'

/**
 * Real 3D models for the office furniture (client/public/office, built by
 * shared/tools/office): Poly Haven CC0 pieces plus modelled office kit.
 * Every model is placed where level.json puts the item and fitted to its size
 * using the bounding boxes the build recorded (models.json), so placement is a
 * pure function (tested: nothing pokes through a wall). All copies of a model
 * share one InstancedMesh per part (OfficeModels.tsx).
 */

export type ModelName = keyof typeof bounds

type Fit =
  /** Natural size (scaled uniformly by `scale`). */
  | { kind: 'none'; scale?: number }
  /** Stretch to the item's footprint; height from `height` or the average stretch. */
  | { kind: 'footprint'; height?: number }
  /** Repeat along the item's width (long counters), each copy stretched to fit. */
  | { kind: 'tile'; length: number }

interface ModelSpec {
  model: ModelName
  fit: Fit
  /** Extra turn of the model before fitting (its front must face +Z). */
  turn?: number
  /** Standing height (on a counter). */
  y?: number
  /** Wall-mounted: centred at the item's elevation, against the wall. */
  wall?: boolean
  /** Material recoloured per item (item.color), e.g. the vending machine's body. */
  tint?: string
}

/** Chairs follow the room: swivel chairs to work, cafe chairs in the kitchen, stacking chairs in the hall. */
function chairFor(level: Level, x: number, z: number): ModelSpec {
  const zone = zoneAt(level, x, z)?.id
  if (zone === 'kitchen') return { model: 'cafe_chair', fit: { kind: 'none' } }
  if (zone === 'hall') return { model: 'conference_chair', fit: { kind: 'none' } }
  return { model: 'office_chair', fit: { kind: 'none' } }
}

/** Which model draws each furniture type. A function picks variants per item. */
const FURNITURE: Partial<Record<LevelFurniture['type'], ModelSpec | ((item: LevelFurniture, n: number, level: Level) => ModelSpec)>> = {
  chair: (item, _n, level) => chairFor(level, item.position[0], item.position[1]),
  plant: (_item, n) => (n % 3 === 1 ? { model: 'plant_leafy', fit: { kind: 'none', scale: 1.3 } } : { model: 'plant_tall', fit: { kind: 'none' } }),
  trash_bin: { model: 'trash_bin', fit: { kind: 'none' } },
  cubicle: { model: 'cubicle', fit: { kind: 'footprint', height: 1.28 } },
  filing_cabinet: { model: 'filing_cabinet', fit: { kind: 'none' } },
  sofa: { model: 'lounge_sofa', fit: { kind: 'footprint', height: 0.85 } },
  coffee_table: { model: 'coffee_table', fit: { kind: 'footprint', height: 0.42 } },
  cafe_table: { model: 'cafe_table', fit: { kind: 'footprint', height: 0.76 } },
  manager_desk: { model: 'manager_desk', fit: { kind: 'footprint', height: 0.78 }, turn: Math.PI },
  bookshelf: { model: 'bookshelf', fit: { kind: 'footprint', height: 1.85 }, turn: -Math.PI / 2 },
  water_cooler: { model: 'water_cooler', fit: { kind: 'none' } },
  vending_machine: { model: 'vending_machine', fit: { kind: 'none' }, tint: 'vending_body' },
  copier: { model: 'copier', fit: { kind: 'none' } },
  fridge: { model: 'fridge', fit: { kind: 'none' } },
  microwave: { model: 'microwave', fit: { kind: 'none' }, y: 0.95 },
  coffee_machine: { model: 'coffee_machine', fit: { kind: 'none' }, y: 0.95 },
  meeting_table: { model: 'meeting_table', fit: { kind: 'footprint', height: 0.77 } },
  // Stands against the wall with rotationY 0: its doors must face the room (-z).
  counter: { model: 'counter', fit: { kind: 'tile', length: 3 }, turn: Math.PI },
  reception_desk: { model: 'reception_desk', fit: { kind: 'footprint', height: 1.27 } },
  fire_alarm: { model: 'fire_alarm', fit: { kind: 'none', scale: 1.6 }, wall: true },
}

/** Everything these models replace in the procedural level (boxes only; colliders stay). */
export const MODELLED = new Set<string>([...Object.keys(FURNITURE), 'desk', 'clock'])

export interface Placement {
  model: ModelName
  matrix: THREE.Matrix4
  tint?: string
  color?: string
}

const up = new THREE.Vector3(0, 1, 0)

type Vec3 = [number, number, number]

function box(model: ModelName) {
  const b = bounds[model]
  return new THREE.Box3(new THREE.Vector3(...(b.min as Vec3)), new THREE.Vector3(...(b.max as Vec3)))
}

function size(model: ModelName) {
  return box(model).getSize(new THREE.Vector3())
}

/** Where every model instance goes, fitted to its item. Pure (tested). */
export function placements(level: Level): Placement[] {
  const out: Placement[] = []
  const at = (spec: ModelSpec, x: number, y: number, z: number, rotY: number, scale: THREE.Vector3, color?: string) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, rotY), scale)
    m.multiply(new THREE.Matrix4().makeRotationY(spec.turn ?? 0))
    out.push({ model: spec.model, matrix: m, tint: spec.tint, color: spec.tint ? color : undefined })
  }

  const counts = new Map<string, number>()
  for (const item of level.furniture) {
    const entry = FURNITURE[item.type]
    if (!entry) continue
    const n = counts.get(item.type) ?? 0
    counts.set(item.type, n + 1)
    const spec = typeof entry === 'function' ? entry(item, n, level) : entry
    const [x, z] = item.position
    const r = item.rotationY ?? 0
    const base = (item.base ?? 0) + (spec.y ?? 0)
    const fit = spec.fit
    const s = size(spec.model)
    if (spec.wall) {
      // Centred at the elevation, its back just off the wall.
      const k = fit.kind === 'none' ? (fit.scale ?? 1) : 1
      const [dx, dz] = rotateXZ(0, (s.z * k) / 2 + 0.01, r)
      at(spec, x + dx, (item.elevation ?? 1.5) - (s.y * k) / 2, z + dz, r, new THREE.Vector3(k, k, k), item.color)
    } else if (fit.kind === 'none') {
      const k = fit.scale ?? 1
      at(spec, x, base, z, r, new THREE.Vector3(k, k, k), item.color)
    } else if (fit.kind === 'tile') {
      const [w] = item.size ?? [fit.length, 1]
      const count = Math.max(1, Math.round(w / fit.length))
      const each = w / count
      for (let i = 0; i < count; i++) {
        const [dx, dz] = rotateXZ(-w / 2 + each * (i + 0.5), 0, r)
        at(spec, x + dx, base, z + dz, r, new THREE.Vector3(each / fit.length, 1, 1), item.color)
      }
    } else {
      // Footprint: the model's width and depth (after its own turn) stretched to the item's.
      const turned = Math.abs(Math.sin(spec.turn ?? 0)) > 0.5
      const [w, d] = item.size ?? [1, 1]
      const sx = w / (turned ? s.z : s.x)
      const sz = d / (turned ? s.x : s.z)
      const sy = fit.height ? fit.height / s.y : (sx + sz) / 2
      at(spec, x, base, z, r, new THREE.Vector3(sx, sy, sz), item.color)
    }
  }

  // Desks: a workstation model plus a swivel chair at the sitter's place, and
  // a succulent on some (stable per desk, the same for everyone).
  const one = new THREE.Vector3(1, 1, 1)
  for (const d of level.desks) {
    const [x, z] = d.position
    const r = d.rotationY
    at({ model: 'desk', fit: { kind: 'none' } }, x, 0, z, r, one)
    const [cx, cz] = rotateXZ(0, -0.75, r)
    at({ model: 'office_chair', fit: { kind: 'none' } }, x + cx, 0, z + cz, r, one)
    const pick = [...d.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7)
    if (pick % 3 === 0) {
      const [sx, sz] = rotateXZ(0.55, 0.22, r)
      at({ model: 'succulent', fit: { kind: 'none' } }, x + sx, 0.75, z + sz, r, one)
    }
  }
  // Wall clocks: the model is centred, so lift it by half its height.
  const clock = size('clock')
  for (const c of level.clocks ?? []) {
    const k = (c.radius * 2) / clock.x
    const [dx, dz] = rotateXZ(0, (clock.z * k) / 2 + 0.01, c.rotationY)
    at({ model: 'clock', fit: { kind: 'none' } }, c.position[0] + dx, c.position[1] - (clock.y * k) / 2, c.position[2] + dz, c.rotationY, new THREE.Vector3(k, k, k))
  }
  return out
}

/** World-space box of a placed model (for the wall test). */
export function placedBox(p: Placement): THREE.Box3 {
  return box(p.model).applyMatrix4(p.matrix)
}

