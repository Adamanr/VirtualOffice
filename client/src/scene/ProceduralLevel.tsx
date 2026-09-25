import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Level } from '../lib/level'
import { buildLevelGeometry, type Piece, type Shape } from './levelGeometry'

const geometries: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
}

function makeMaterial(name: string, color: string): THREE.Material {
  if (name === 'glass') {
    return new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false })
  }
  return new THREE.MeshLambertMaterial({ color, flatShading: name === 'plant' })
}

/** All pieces sharing a material and shape are drawn by a single InstancedMesh. */
function InstancedPieces({ pieces, material, shape }: { pieces: Piece[]; material: THREE.Material; shape: Shape }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    pieces.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rotY)
      m.compose(new THREE.Vector3(...p.center), q, new THREE.Vector3(...p.size))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [pieces])
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
      <mesh rotation-x={-Math.PI / 2} position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]}>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
        <meshLambertMaterial color={level.palette.floor} />
      </mesh>
      {level.zones
        .filter((z) => z.floorColor)
        .map((z) => (
          <mesh
            key={z.id}
            rotation-x={-Math.PI / 2}
            position={[(z.min[0] + z.max[0]) / 2, 0.003, (z.min[1] + z.max[1]) / 2]}
          >
            <planeGeometry args={[z.max[0] - z.min[0], z.max[1] - z.min[1]]} />
            <meshLambertMaterial color={z.floorColor!} />
          </mesh>
        ))}
    </group>
  )
}

export function ProceduralLevel({ level }: { level: Level }) {
  const groups = useMemo(() => {
    const { pieces } = buildLevelGeometry(level)
    const byKey = new Map<string, { material: THREE.Material; shape: Shape; pieces: Piece[] }>()
    for (const p of pieces) {
      const key = `${p.material}:${p.shape}`
      let g = byKey.get(key)
      if (!g) {
        g = { material: makeMaterial(p.material, level.palette[p.material] ?? '#ff00ff'), shape: p.shape, pieces: [] }
        byKey.set(key, g)
      }
      g.pieces.push(p)
    }
    // Opaque first, glass last so transparency sorts against a filled depth buffer.
    return [...byKey.entries()].sort(([a], [b]) => Number(a.startsWith('glass')) - Number(b.startsWith('glass')))
  }, [level])

  return (
    <group>
      <Floors level={level} />
      {groups.map(([key, g]) => (
        <InstancedPieces key={key} pieces={g.pieces} material={g.material} shape={g.shape} />
      ))}
      <LevelColliders level={level} />
    </group>
  )
}
