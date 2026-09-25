import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { getDesk, rotateXZ } from '../lib/level'
import { useActivity } from '../store/activity'

const box = new THREE.BoxGeometry(1, 1, 1)
const jelloMaterial = new THREE.MeshLambertMaterial({ color: '#4cd964', transparent: true, opacity: 0.55, emissive: '#0d3d12', depthWrite: false })
const staplerMaterial = new THREE.MeshLambertMaterial({ color: '#c8322f' })
const MAX = 24

/** Staplers set in wobbly green jello — Jim's classic prank, visible to everyone. */
export function Jellos() {
  const jello = useRef<THREE.InstancedMesh>(null)
  const staplers = useRef<THREE.InstancedMesh>(null)
  const tmp = useRef({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) })

  useFrame(({ clock }) => {
    const j = jello.current
    const st = staplers.current
    if (!j || !st) return
    const t = tmp.current
    const ids = Object.keys(useActivity.getState().jellos)
    let i = 0
    for (const id of ids) {
      const desk = getDesk(id)
      if (!desk || i >= MAX) continue
      const [dx, dz] = rotateXZ(0.2, -0.2, desk.rotationY)
      const x = desk.position[0] + dx
      const z = desk.position[1] + dz
      const w = Math.sin(clock.elapsedTime * 7 + i) * 0.04
      t.q.setFromAxisAngle(t.up, desk.rotationY)
      t.p.set(x, 0.75 + 0.09 * (1 + w), z)
      t.s.set(0.2 * (1 - w * 0.5), 0.18 * (1 + w), 0.3 * (1 - w * 0.5))
      t.m.compose(t.p, t.q, t.s)
      j.setMatrixAt(i, t.m)
      t.p.set(x, 0.8, z)
      t.s.set(0.05, 0.05, 0.17)
      t.m.compose(t.p, t.q, t.s)
      st.setMatrixAt(i, t.m)
      i++
    }
    j.count = st.count = i
    j.visible = st.visible = i > 0
    j.instanceMatrix.needsUpdate = true
    st.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={staplers} args={[box, staplerMaterial, MAX]} frustumCulled={false} visible={false} />
      <instancedMesh ref={jello} args={[box, jelloMaterial, MAX]} frustumCulled={false} visible={false} />
    </>
  )
}
