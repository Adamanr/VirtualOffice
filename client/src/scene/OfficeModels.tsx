import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Level } from '../lib/level'
import { placements, type ModelName, type Placement } from './officeLayout'

export { MODELLED } from './officeLayout'

/**
 * Draws the office's furniture models (placed by officeLayout.ts). All copies
 * of a model share one InstancedMesh per part: 83 chairs cost a handful of
 * draw calls.
 */
const url = (model: ModelName) => `/office/${model}.glb`

/** Model parts in model space (the GLB's own node transforms baked into each part's matrix). */
function useParts(model: ModelName) {
  const { scene } = useGLTF(url(model))
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: mesh.matrixWorld.clone() })
    })
    return parts
  }, [scene])
}

/** All copies of one model (optionally one recoloured group) as instanced parts. */
function ModelGroup({ model, items }: { model: ModelName; items: Placement[] }) {
  const parts = useParts(model)
  const matrices = useMemo(() => items.map((p) => p.matrix), [items])
  const { tint, color } = items[0]!
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
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow={!material.transparent} receiveShadow frustumCulled={false} />
}

export function OfficeModels({ level }: { level: Level }) {
  const groups = useMemo(() => {
    const byKey = new Map<string, Placement[]>()
    for (const p of placements(level)) {
      const key = `${p.model}|${p.color ?? ''}`
      const g = byKey.get(key)
      if (g) g.push(p)
      else byKey.set(key, [p])
    }
    return [...byKey.entries()]
  }, [level])
  return (
    <>
      {groups.map(([key, items]) => (
        <ModelGroup key={key} model={items[0]!.model} items={items} />
      ))}
    </>
  )
}
