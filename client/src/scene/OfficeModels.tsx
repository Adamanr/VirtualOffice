import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Level, LevelFurniture } from '../lib/level'
import { rotateXZ } from '../lib/level'

/**
 * Real 3D models for the office furniture (client/public/office, built by
 * shared/tools/office): Poly Haven CC0 pieces plus modelled office kit.
 * Every model is placed where level.json puts the item and fitted to its
 * size; all copies of a model share one InstancedMesh per part, so 59 chairs
 * cost a handful of draw calls.
 */

type Fit =
  /** Natural size (scaled uniformly by `scale`). */
  | { kind: 'none'; scale?: number }
  /** Stretch to the item's footprint; height from `height` or the average stretch. */
  | { kind: 'footprint'; height?: number }
  /** Repeat along the item's width (long counters), each copy stretched to fit. */
  | { kind: 'tile'; length: number }

interface ModelSpec {
  url: string
  fit: Fit
  /** Extra turn of the model before fitting (its front must face +Z). */
  turn?: number
  /** Standing height (counter tops) or, for wall items, the centre height. */
  y?: number
  wall?: boolean
  /** Material recoloured per item (item.color), e.g. the vending machine's body. */
  tint?: string
}

const office = (name: string) => `/office/${name}.glb`

/** Which model draws each furniture type. A function picks variants per item. */
const FURNITURE: Partial<Record<LevelFurniture['type'], ModelSpec | ((item: LevelFurniture, n: number) => ModelSpec)>> = {
  chair: { url: office('office_chair'), fit: { kind: 'none' } },
  plant: (_item, n) => ({ url: office(n % 3 === 1 ? 'plant_leafy' : 'plant_tall'), fit: { kind: 'none', scale: n % 3 === 1 ? 1.3 : 1 } }),
  trash_bin: { url: office('trash_bin'), fit: { kind: 'none' } },
  cubicle: { url: office('cubicle'), fit: { kind: 'footprint', height: 1.28 } },
  filing_cabinet: { url: office('filing_cabinet'), fit: { kind: 'none' } },
  sofa: { url: office('sofa'), fit: { kind: 'footprint' } },
  coffee_table: { url: office('coffee_table'), fit: { kind: 'footprint', height: 0.42 } },
  cafe_table: { url: office('cafe_table'), fit: { kind: 'footprint', height: 0.76 } },
  manager_desk: { url: office('manager_desk'), fit: { kind: 'footprint', height: 0.78 }, turn: Math.PI },
  bookshelf: { url: office('bookshelf'), fit: { kind: 'footprint', height: 1.85 }, turn: -Math.PI / 2 },
  water_cooler: { url: office('water_cooler'), fit: { kind: 'none' } },
  vending_machine: { url: office('vending_machine'), fit: { kind: 'none' }, tint: 'vending_body' },
  copier: { url: office('copier'), fit: { kind: 'none' } },
  fridge: { url: office('fridge'), fit: { kind: 'none' } },
  microwave: { url: office('microwave'), fit: { kind: 'none', scale: 0.5 }, y: 0.95 },
  coffee_machine: { url: office('coffee_machine'), fit: { kind: 'none' }, y: 0.95 },
  meeting_table: { url: office('meeting_table'), fit: { kind: 'footprint', height: 0.77 } },
  // Stands against the wall with rotationY 0: its doors must face the room (-z).
  counter: { url: office('counter'), fit: { kind: 'tile', length: 3 }, turn: Math.PI },
  reception_desk: { url: office('reception_desk'), fit: { kind: 'footprint', height: 1.27 } },
  fire_alarm: { url: office('fire_alarm'), fit: { kind: 'none', scale: 1.6 }, wall: true },
}

/** Everything these models replace in the procedural level (boxes only; colliders stay). */
export const MODELLED = new Set<string>([...Object.keys(FURNITURE), 'desk', 'clock'])

interface Placement {
  spec: ModelSpec
  /** Item frame (position + rotation), times the fit scale when it's already known. */
  matrix: THREE.Matrix4
  color?: string
  /** Footprint fit, resolved once the model's size is known (see ModelGroup). */
  footprint?: { size: [number, number]; height?: number }
}

const up = new THREE.Vector3(0, 1, 0)

function placements(level: Level): Placement[] {
  const out: Placement[] = []
  const at = (spec: ModelSpec, x: number, y: number, z: number, rotY: number, scale: THREE.Vector3, color?: string) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(up, rotY),
      new THREE.Vector3(1, 1, 1),
    )
    // Fit in the item's frame, after the model's own turn.
    m.multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
    m.multiply(new THREE.Matrix4().makeRotationY(spec.turn ?? 0))
    out.push({ spec, matrix: m, color })
  }

  const counts = new Map<string, number>()
  for (const item of level.furniture) {
    const entry = FURNITURE[item.type]
    if (!entry) continue
    const n = counts.get(item.type) ?? 0
    counts.set(item.type, n + 1)
    const spec = typeof entry === 'function' ? entry(item, n) : entry
    const [x, z] = item.position
    const r = item.rotationY ?? 0
    const base = (item.base ?? 0) + (spec.y ?? 0)
    const fit = spec.fit
    if (spec.wall) {
      // Wall items: centred at the elevation, just off the wall.
      const s = fit.kind === 'none' ? (fit.scale ?? 1) : 1
      const [dx, dz] = rotateXZ(0, 0.02, r)
      at(spec, x + dx, (item.elevation ?? 1.5) - 0.07 * s, z + dz, r, new THREE.Vector3(s, s, s), item.color)
      continue
    }
    if (fit.kind === 'none') {
      const s = fit.scale ?? 1
      at(spec, x, base, z, r, new THREE.Vector3(s, s, s), item.color)
    } else if (fit.kind === 'tile') {
      const [w] = item.size ?? [fit.length, 1]
      const count = Math.max(1, Math.round(w / fit.length))
      const each = w / count
      for (let i = 0; i < count; i++) {
        const [dx, dz] = rotateXZ(-w / 2 + each * (i + 0.5), 0, r)
        at(spec, x + dx, base, z + dz, r, new THREE.Vector3(each / fit.length, 1, 1), item.color)
      }
    } else {
      at(spec, x, base, z, r, new THREE.Vector3(1, 1, 1), item.color)
      out[out.length - 1]!.footprint = { size: item.size ?? [1, 1], height: fit.height }
    }
  }

  // Desks: a workstation model plus a swivel chair at the sitter's place, and
  // a succulent or a pen cup on some (stable per desk, the same for everyone).
  const desk: ModelSpec = { url: office('desk'), fit: { kind: 'none' } }
  const chair = FURNITURE.chair as ModelSpec
  const succulent: ModelSpec = { url: office('succulent'), fit: { kind: 'none' } }
  const stationery: ModelSpec = { url: office('stationery'), fit: { kind: 'none' } }
  const one = new THREE.Vector3(1, 1, 1)
  for (const d of level.desks) {
    const [x, z] = d.position
    const r = d.rotationY
    at(desk, x, 0, z, r, one)
    const [cx, cz] = rotateXZ(0, -0.75, r)
    at(chair, x + cx, 0, z + cz, r, one)
    const pick = [...d.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7)
    if (pick % 3 === 0) {
      const [sx, sz] = rotateXZ(0.55, 0.22, r)
      at(succulent, x + sx, 0.75, z + sz, r, one)
    }
    if (pick % 4 === 1) {
      const [px, pz] = rotateXZ(0.3, -0.25, r)
      at(stationery, x + px, 0.75, z + pz, r + 0.4, one)
    }
  }
  // Wall clocks.
  const clock: ModelSpec = { url: office('clock'), fit: { kind: 'none' } }
  for (const c of level.clocks ?? []) {
    const s = (c.radius * 2) / 0.32
    const [dx, dz] = rotateXZ(0, 0.03, c.rotationY)
    at(clock, c.position[0] + dx, c.position[1] - 0.16 * s, c.position[2] + dz, c.rotationY, new THREE.Vector3(s, s, s))
  }
  return out
}

/** Model parts in model space (the GLB's own node transforms baked into each part's matrix). */
function useParts(url: string) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: mesh.matrixWorld.clone() })
    })
    const box = new THREE.Box3().setFromObject(scene)
    return { parts, size: box.getSize(new THREE.Vector3()) }
  }, [scene])
}

/** All copies of one model (optionally one recoloured group) as instanced parts. */
function ModelGroup({ url, items, tint, color }: { url: string; items: Placement[]; tint?: string; color?: string }) {
  const { parts, size } = useParts(url)
  const matrices = useMemo(
    () =>
      items.map((p) => {
        const data = p.footprint
        if (!data) return p.matrix
        // Footprint fit: now that the model's size is known.
        const turned = Math.abs(Math.sin(p.spec.turn ?? 0)) > 0.5
        const mw = turned ? size.z : size.x
        const md = turned ? size.x : size.z
        const sx = data.size[0] / mw
        const sz = data.size[1] / md
        const sy = data.height ? data.height / size.y : (sx + sz) / 2
        const e = p.matrix.elements
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(e[12], e[13], e[14]),
          new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(p.matrix)),
          new THREE.Vector3(1, 1, 1),
        )
        return m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz)).multiply(new THREE.Matrix4().makeRotationY(p.spec.turn ?? 0))
      }),
    [items, size],
  )
  return (
    <>
      {parts.map((part, i) => {
        let material = part.material
        if (tint && color && material.name === tint) {
          material = (material as THREE.MeshStandardMaterial).clone()
          ;(material as THREE.MeshStandardMaterial).color.set(color)
        }
        return <InstancedPart key={i} geometry={part.geometry} material={material} local={part.matrix} matrices={matrices} />
      })}
    </>
  )
}

function InstancedPart({ geometry, material, local, matrices }: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    matrices.forEach((w, i) => mesh.setMatrixAt(i, m.multiplyMatrices(w, local)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices, local])
  const transparent = material.transparent
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, matrices.length]}
      castShadow={!transparent}
      receiveShadow
      frustumCulled={false}
    />
  )
}

export function OfficeModels({ level }: { level: Level }) {
  const groups = useMemo(() => {
    const byKey = new Map<string, { url: string; tint?: string; color?: string; items: Placement[] }>()
    for (const p of placements(level)) {
      const color = p.spec.tint ? p.color : undefined
      const key = `${p.spec.url}|${color ?? ''}`
      let g = byKey.get(key)
      if (!g) byKey.set(key, (g = { url: p.spec.url, tint: p.spec.tint, color, items: [] }))
      g.items.push(p)
    }
    return [...byKey.entries()]
  }, [level])
  return (
    <>
      {groups.map(([key, g]) => (
        <ModelGroup key={key} url={g.url} items={g.items} tint={g.tint} color={g.color} />
      ))}
    </>
  )
}
