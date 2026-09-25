import { useGLTF } from '@react-three/drei'
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Loads a Blender-exported office. Meshes named `col_*` become invisible
 * trimesh colliders (baked to world space); everything else is rendered as is.
 * Zones, screens and desks still come from level.json.
 */
export function GlbLevel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const { visual, colliders } = useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const colliders: { vertices: Float32Array; indices: Uint32Array }[] = []
    const hide: THREE.Object3D[] = []
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (obj.name.startsWith('col_')) {
        const geom = (obj.geometry as THREE.BufferGeometry).clone().applyMatrix4(obj.matrixWorld)
        const pos = geom.getAttribute('position')
        const vertices = new Float32Array(pos.array.length)
        vertices.set(pos.array as ArrayLike<number>)
        const index = geom.getIndex()
        const indices = index
          ? Uint32Array.from(index.array as ArrayLike<number>)
          : Uint32Array.from({ length: pos.count }, (_, i) => i)
        colliders.push({ vertices, indices })
        hide.push(obj)
      } else {
        obj.matrixAutoUpdate = false
      }
    })
    hide.forEach((o) => o.removeFromParent())
    return { visual: root, colliders }
  }, [scene])

  return (
    <group>
      <primitive object={visual} />
      <RigidBody type="fixed" colliders={false}>
        {colliders.map((c, i) => (
          <TrimeshCollider key={i} args={[c.vertices, c.indices]} />
        ))}
      </RigidBody>
    </group>
  )
}
