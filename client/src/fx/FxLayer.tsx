import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { particles, stepParticles, type ParticleKind } from './particles'

const KINDS: { kind: ParticleKind; geometry: THREE.BufferGeometry; material: THREE.Material; flat?: boolean }[] = [
  { kind: 'puff', geometry: new THREE.IcosahedronGeometry(0.5, 1), material: new THREE.MeshLambertMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.55, depthWrite: false }) },
  { kind: 'paper', geometry: new THREE.BoxGeometry(0.74, 0.01, 1), material: new THREE.MeshLambertMaterial({ color: '#fbfaf5' }) },
  { kind: 'popcorn', geometry: new THREE.IcosahedronGeometry(0.5, 0), material: new THREE.MeshLambertMaterial({ color: '#fff3c4', flatShading: true }) },
  { kind: 'jelly', geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshLambertMaterial({ color: '#56d364', transparent: true, opacity: 0.75 }) },
  { kind: 'spark', geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshBasicMaterial({ color: '#ffcf4a' }) },
  { kind: 'star', geometry: new THREE.OctahedronGeometry(0.6, 0), material: new THREE.MeshBasicMaterial({ color: '#ffd84a' }) },
  { kind: 'stink', geometry: new THREE.IcosahedronGeometry(0.5, 1), material: new THREE.MeshLambertMaterial({ color: '#8fbf3a', transparent: true, opacity: 0.35, depthWrite: false }) },
  { kind: 'confetti', geometry: new THREE.BoxGeometry(1, 0.15, 0.6), material: new THREE.MeshBasicMaterial({ color: '#ffffff' }) },
  { kind: 'bubble', geometry: new THREE.IcosahedronGeometry(0.5, 1), material: new THREE.MeshBasicMaterial({ color: '#dff3ff', transparent: true, opacity: 0.7 }) },
  { kind: 'dust', geometry: new THREE.IcosahedronGeometry(0.5, 1), material: new THREE.MeshLambertMaterial({ color: '#b9ad97', transparent: true, opacity: 0.45, depthWrite: false }) },
]
const MAX_PER_KIND = 400

// A ♪ sprite for piano notes (billboarded, tinted per note).
function noteMaterial() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.font = '700 110px serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('♪', 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide })
}
KINDS.push({ kind: 'note', geometry: new THREE.PlaneGeometry(1, 1), material: noteMaterial() })

/** Draws every live particle; steps the simulation once per frame. */
export function FxLayer() {
  const refs = useRef<Record<string, THREE.InstancedMesh | null>>({})
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), white: new THREE.Color('#ffffff') }), [])

  useFrame(({ camera }, rawDt) => {
    stepParticles(Math.min(rawDt, 0.05))
    const counts: Record<string, number> = {}
    for (const p of particles) {
      const mesh = refs.current[p.kind]
      if (!mesh) continue
      const i = counts[p.kind] ?? 0
      if (i >= MAX_PER_KIND) continue
      counts[p.kind] = i + 1
      // Fade out by shrinking over the last 30% of life.
      const k = p.life / p.maxLife
      const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      // Notes face the camera; everything else tumbles.
      if (p.kind === 'note') tmp.q.copy(camera.quaternion)
      else tmp.q.setFromEuler(p.rot)
      tmp.s.setScalar(p.size * fade)
      tmp.m.compose(p.p, tmp.q, tmp.s)
      mesh.setMatrixAt(i, tmp.m)
      if (p.kind === 'confetti' || p.kind === 'note') mesh.setColorAt(i, p.color ?? tmp.white)
    }
    for (const { kind } of KINDS) {
      const mesh = refs.current[kind]
      if (!mesh) continue
      const n = counts[kind] ?? 0
      mesh.count = n
      mesh.visible = n > 0
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    }
  })

  return (
    <>
      {KINDS.map(({ kind, geometry, material }) => (
        <instancedMesh
          key={kind}
          ref={(m) => {
            refs.current[kind] = m
          }}
          args={[geometry, material, MAX_PER_KIND]}
          frustumCulled={false}
          visible={false}
        />
      ))}
    </>
  )
}
