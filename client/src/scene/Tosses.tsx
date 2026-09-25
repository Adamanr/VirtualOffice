import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Toss } from '@shared/protocol.gen'
import { aim, aimCharge, currentThrow, installAimControls } from '../activities/aim'
import { landingTime, positionAt, type V3 } from '../lib/toss'
import { clock } from '../net/remotes'
import { useActivity } from '../store/activity'

const ballGeometry = new THREE.IcosahedronGeometry(0.07, 0)
const ballMaterial = new THREE.MeshLambertMaterial({ color: '#f7f5ee', flatShading: true })
const dotGeometry = new THREE.SphereGeometry(0.025, 6, 4)
const dotMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 })
const ringGeometry = new THREE.RingGeometry(0.18, 0.24, 24).rotateX(-Math.PI / 2)
const ringMaterial = new THREE.MeshBasicMaterial({ color: '#f5a524', transparent: true, opacity: 0.9 })
const MAX_BALLS = 48
const DOTS = 24

/** Flying paper balls (animated on the server's clock for everyone), litter, and the local aim arc. */
export function Tosses() {
  const balls = useRef<THREE.InstancedMesh>(null)
  const dots = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const tmp = useRef({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3(), e: new THREE.Euler(), v: [0, 0, 0] as V3 })

  useEffect(() => installAimControls(), [])

  useFrame(() => {
    const t = tmp.current
    const mesh = balls.current
    if (mesh) {
      const now = clock.toServer(performance.now())
      const tosses: Toss[] = useActivity.getState().tosses
      let i = 0
      for (const toss of tosses) {
        const elapsed = (now - toss.t) / 1000
        if (elapsed < 0) continue
        // Balls that went in stay in the bin (hidden); misses stay on the floor as litter.
        if (elapsed >= toss.flight && toss.hit === 'bin') continue
        if (i >= MAX_BALLS) break
        const at = elapsed >= toss.flight ? (toss.land as V3) : positionAt(toss.origin as V3, toss.vel as V3, elapsed, t.v)
        const spin = Math.min(elapsed, toss.flight) * 12
        t.e.set(spin, spin * 0.7, 0)
        t.q.setFromEuler(t.e)
        t.p.set(at[0], at[1], at[2])
        t.m.compose(t.p, t.q, t.s)
        mesh.setMatrixAt(i++, t.m)
      }
      mesh.count = i
      mesh.visible = i > 0
      mesh.instanceMatrix.needsUpdate = true
    }

    // Local aim preview while G is held.
    const d = dots.current
    const r = ring.current
    if (d && r) {
      if (!aim.active) {
        d.visible = false
        r.visible = false
        return
      }
      const { origin, vel } = currentThrow(aimCharge())
      const tl = landingTime(origin, vel)
      for (let k = 0; k < DOTS; k++) {
        const p = positionAt(origin, vel, (tl * (k + 1)) / (DOTS + 1), t.v)
        t.p.set(p[0], p[1], p[2])
        t.m.compose(t.p, t.q.identity(), t.s)
        d.setMatrixAt(k, t.m)
      }
      d.instanceMatrix.needsUpdate = true
      d.visible = true
      const end = positionAt(origin, vel, tl, t.v)
      r.position.set(end[0], 0.02, end[2])
      r.visible = true
    }
  })

  return (
    <>
      <instancedMesh ref={balls} args={[ballGeometry, ballMaterial, MAX_BALLS]} frustumCulled={false} visible={false} />
      <instancedMesh ref={dots} args={[dotGeometry, dotMaterial, DOTS]} frustumCulled={false} visible={false} />
      <mesh ref={ring} geometry={ringGeometry} material={ringMaterial} visible={false} />
    </>
  )
}
