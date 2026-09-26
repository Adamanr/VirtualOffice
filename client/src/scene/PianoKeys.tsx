import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pressed } from '../activities/piano'
import { keyLayout } from '../activities/pianoLayout'
import { props, rotateXZ, type Prop } from '../lib/level'

const pianos = props.filter((p) => p.kind === 'piano')
const box = new THREE.BoxGeometry(1, 1, 1)
const whiteMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
const blackMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
const { whites, blacks } = keyLayout()

/** The keys of a piano: pressed keys dip and glow for everyone in earshot. */
function Keys({ prop }: { prop: Prop }) {
  const w = useRef<THREE.InstancedMesh>(null)
  const b = useRef<THREE.InstancedMesh>(null)
  const base = 0.3 // standing on the stage
  const width = 1.3
  const keyW = width / whites.length
  const t = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), prop.rotY), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() }), [prop.rotY])

  useFrame(() => {
    const now = performance.now()
    const put = (mesh: THREE.InstancedMesh, i: number, lx: number, lz: number, y: number, sx: number, sy: number, sz: number, color: string) => {
      const [dx, dz] = rotateXZ(lx, lz, prop.rotY)
      t.p.set(prop.x + dx, base + y, prop.z + dz)
      t.s.set(sx, sy, sz)
      t.m.compose(t.p, t.q, t.s)
      mesh.setMatrixAt(i, t.m)
      mesh.setColorAt(i, t.c.set(color))
    }
    const down = (midi: number) => (pressed.get(`${prop.id}:${midi}`) ?? 0) > now
    const wm = w.current
    const bm = b.current
    if (!wm || !bm) return
    whites.forEach(({ midi, i }) => {
      const lx = -width / 2 + keyW * (i + 0.5)
      const d = down(midi)
      put(wm, i, lx, 0.36, d ? 0.735 : 0.75, keyW * 0.92, 0.02, 0.15, d ? '#ffd84a' : '#f7f5ee')
    })
    blacks.forEach(({ midi, after }, i) => {
      const lx = -width / 2 + keyW * (after + 1)
      const d = down(midi)
      put(bm, i, lx, 0.32, d ? 0.76 : 0.772, keyW * 0.55, 0.02, 0.09, d ? '#f5a524' : '#1d2026')
    })
    wm.instanceMatrix.needsUpdate = bm.instanceMatrix.needsUpdate = true
    if (wm.instanceColor) wm.instanceColor.needsUpdate = true
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={w} args={[box, whiteMat, whites.length]} frustumCulled={false} />
      <instancedMesh ref={b} args={[box, blackMat, blacks.length]} frustumCulled={false} />
    </>
  )
}

export function PianoKeys() {
  return (
    <>
      {pianos.map((p) => (
        <Keys key={p.id} prop={p} />
      ))}
    </>
  )
}
