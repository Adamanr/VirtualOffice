import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FloorPattern, Level, Vec2 } from '../lib/level'
import { FLOOR_TILE_METERS, floorTexture } from './floorTextures'
import { Decor } from './Decor'
import { buildLevelGeometry, type Piece, type Shape } from './levelGeometry'

const geometries: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
}

function makeMaterial(name: string, color: string, tinted: boolean): THREE.Material {
  // Instances with their own color multiply a white base.
  const base = tinted ? '#ffffff' : color
  if (name === 'glass') {
    return new THREE.MeshLambertMaterial({ color: base, transparent: true, opacity: 0.28, depthWrite: false })
  }
  // Daylight through the windows: unlit so it reads as bright sky.
  if (name === 'window') return new THREE.MeshBasicMaterial({ color: base })
  return new THREE.MeshLambertMaterial({ color: base, flatShading: name === 'plant' })
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
  return <instancedMesh ref={ref} args={[geometries[shape], material, pieces.length]} frustumCulled={false} />
}

export function LevelColliders({ level }: { level: Level }) {
  const { colliders } = useMemo(() => buildLevelGeometry(level), [level])
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

function FloorPlane({ pattern, color, min, max, y }: { pattern: FloorPattern; color: string; min: Vec2; max: Vec2; y: number }) {
  const w = max[0] - min[0]
  const d = max[1] - min[1]
  const texture = useMemo(() => {
    const t = floorTexture(pattern, color).clone()
    const tile = FLOOR_TILE_METERS[pattern]
    t.repeat.set(w / tile, d / tile)
    t.needsUpdate = true
    return t
  }, [pattern, color, w, d])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(min[0] + max[0]) / 2, y, (min[1] + max[1]) / 2]}>
      <planeGeometry args={[w, d]} />
      <meshLambertMaterial map={texture} />
    </mesh>
  )
}

export function ProceduralLevel({ level }: { level: Level }) {
  const groups = useMemo(() => {
    const { pieces } = buildLevelGeometry(level)
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
      <LevelColliders level={level} />
    </group>
  )
}
