import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FloorPattern, Level, Vec2 } from '../lib/level'
import { Decor } from './Decor'
import { buildLevelGeometry, type Piece, type Shape } from './levelGeometry'
import { MODELLED, OfficeModels } from './OfficeModels'
import { surfaceMaterial, type Surface } from './surfaces'

const geometries: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
}

/** How each procedural material reacts to light (PBR, lit by the office environment). */
const FINISH: Record<string, { roughness: number; metalness?: number }> = {
  metal: { roughness: 0.35, metalness: 0.8 },
  deskLeg: { roughness: 0.4, metalness: 0.6 },
  monitor: { roughness: 0.3 },
  dark: { roughness: 0.45 },
  white: { roughness: 0.5 },
  wood: { roughness: 0.55 },
  trim: { roughness: 0.6 },
  paper: { roughness: 0.9 },
  blinds: { roughness: 0.7 },
  decor: { roughness: 0.6 },
}

function makeMaterial(name: string, color: string, tinted: boolean): THREE.Material {
  // Instances with their own color multiply a white base.
  const base = tinted ? '#ffffff' : color
  if (name === 'glass') {
    return new THREE.MeshPhysicalMaterial({ color: base, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false })
  }
  // Daylight through the windows: unlit so it reads as bright sky.
  if (name === 'window') return new THREE.MeshBasicMaterial({ color: base, toneMapped: false })
  // Painted plaster, at its real scale on every wall.
  if (name === 'wall') return surfaceMaterial('wall', color, { color: new THREE.Color(color).multiplyScalar(1.45), normalScale: new THREE.Vector2(0.3, 0.3) })
  const finish = FINISH[name] ?? { roughness: 0.75 }
  return new THREE.MeshStandardMaterial({ color: base, flatShading: name === 'plant', metalness: 0, ...finish })
}

/** All pieces sharing a material and shape are drawn by a single InstancedMesh. */
function InstancedPieces({
  pieces,
  material,
  shape,
  baseColor,
}: {
  pieces: Piece[]
  material: THREE.Material
  shape: Shape
  baseColor: string
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const c = new THREE.Color()
    const tinted = pieces.some((p) => p.color)
    pieces.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rotY)
      m.compose(new THREE.Vector3(...p.center), q, new THREE.Vector3(...p.size))
      mesh.setMatrixAt(i, m)
      if (tinted) mesh.setColorAt(i, c.set(p.color ?? baseColor))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [pieces, baseColor])
  const glass = (material as THREE.Material).transparent
  return <instancedMesh ref={ref} args={[geometries[shape], material, pieces.length]} frustumCulled={false} castShadow={!glass} receiveShadow />
}

export function LevelColliders({ level }: { level: Level }) {
  const { colliders } = useMemo(() => buildLevelGeometry(level, { modelled: MODELLED }), [level])
  const [x0, z0] = level.bounds.min
  const [x1, z1] = level.bounds.max
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[(x1 - x0) / 2 + 2, 0.5, (z1 - z0) / 2 + 2]} position={[(x0 + x1) / 2, -0.5, (z0 + z1) / 2]} />
      {colliders.map((c, i) => (
        <CuboidCollider key={i} args={c.half} position={c.center} rotation={[0, c.rotY, 0]} />
      ))}
    </RigidBody>
  )
}

export function Floors({ level }: { level: Level }) {
  const [x0, z0] = level.bounds.min
  const [x1, z1] = level.bounds.max
  return (
    <group>
      <FloorPlane
        pattern={level.floorPattern ?? 'carpet'}
        color={level.palette.floor ?? '#888888'}
        min={[x0, z0]}
        max={[x1, z1]}
        y={0}
      />
      {level.zones
        .filter((z) => z.floorColor)
        .map((z) => (
          <FloorPlane key={z.id} pattern={z.floorPattern ?? 'carpet'} color={z.floorColor!} min={z.min} max={z.max} y={0.003} />
        ))}
    </group>
  )
}

const FLOOR_SURFACE: Record<FloorPattern, Surface> = { carpet: 'carpet', tiles: 'tiles', wood: 'wood' }

/** A zone's floor: the real carpet / parquet / tiles, tinted towards the zone's colour. */
function FloorPlane({ pattern, color, min, max, y }: { pattern: FloorPattern; color: string; min: Vec2; max: Vec2; y: number }) {
  const w = max[0] - min[0]
  const d = max[1] - min[1]
  const material = useMemo(() => {
    // Carpet: the zone's own colour, with the fibre relief and sheen of the real
    // carpet (its photo is a dark brown); parquet and tiles keep their photo.
    if (pattern === 'carpet') return surfaceMaterial('carpet', color, { map: null })
    const tint = '#' + new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.7).getHexString()
    // The parquet photo's roughness is a polished mirror; an office floor is satin.
    if (pattern === 'wood') return surfaceMaterial('wood', tint, { roughnessMap: null, roughness: 0.45 })
    return surfaceMaterial(FLOOR_SURFACE[pattern], tint)
  }, [pattern, color])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(min[0] + max[0]) / 2, y, (min[1] + max[1]) / 2]} material={material} receiveShadow>
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

/** Light panels every few metres of the suspended ceiling (glowing faces point down). */
const LIGHT_PANEL = new THREE.PlaneGeometry(1.15, 0.55)
const LIGHT_MATERIAL = new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false })

/**
 * The suspended ceiling with troffer lights. One-sided and facing down: from
 * the usual third-person camera above the walls it simply isn't drawn, so the
 * office stays visible like a doll's house; from inside (sitting, first-person
 * framing, low camera) it's there.
 */
function Ceiling({ level }: { level: Level }) {
  const [x0, z0] = level.bounds.min
  const [x1, z1] = level.bounds.max
  const h = level.wallHeight
  const ref = useRef<THREE.InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: [number, number][] = []
    for (let x = x0 + 2; x <= x1 - 1.5; x += 3) for (let z = z0 + 2; z <= z1 - 1.5; z += 2.5) out.push([x, z])
    return out
  }, [x0, x1, z0, z1])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    spots.forEach(([x, z], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, h - 0.005, z), q, new THREE.Vector3(1, 1, 1))))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [spots, h])
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[(x0 + x1) / 2, h, (z0 + z1) / 2]} material={surfaceMaterial('ceiling', '#f6f4ef', { map: null })}>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
      </mesh>
      <instancedMesh ref={ref} args={[LIGHT_PANEL, LIGHT_MATERIAL, spots.length]} frustumCulled={false} />
    </group>
  )
}

export function ProceduralLevel({ level }: { level: Level }) {
  const groups = useMemo(() => {
    const { pieces } = buildLevelGeometry(level, { modelled: MODELLED })
    const byKey = new Map<string, { name: string; shape: Shape; pieces: Piece[] }>()
    for (const p of pieces) {
      const key = `${p.material}:${p.shape}`
      let g = byKey.get(key)
      if (!g) byKey.set(key, (g = { name: p.material, shape: p.shape, pieces: [] }))
      g.pieces.push(p)
    }
    // Opaque first, glass last so transparency sorts against a filled depth buffer.
    return [...byKey.entries()]
      .sort(([a], [b]) => Number(a.startsWith('glass')) - Number(b.startsWith('glass')))
      .map(([key, g]) => {
        const baseColor = level.palette[g.name] ?? '#ff00ff'
        const tinted = g.pieces.some((p) => p.color)
        return [key, { ...g, baseColor, material: makeMaterial(g.name, baseColor, tinted) }] as const
      })
  }, [level])

  return (
    <group>
      <Floors level={level} />
      {groups.map(([key, g]) => (
        <InstancedPieces key={key} pieces={g.pieces} material={g.material} shape={g.shape} baseColor={g.baseColor} />
      ))}
      <Decor level={level} />
      <Ceiling level={level} />
      <Suspense fallback={null}>
        <OfficeModels level={level} />
      </Suspense>
      <LevelColliders level={level} />
    </group>
  )
}
