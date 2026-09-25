import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'

const bodyGeometry = new THREE.CapsuleGeometry(0.28, 0.6, 4, 12)
const headGeometry = new THREE.IcosahedronGeometry(0.22, 2)
const visorGeometry = new THREE.BoxGeometry(0.3, 0.09, 0.08)
const headMaterial = new THREE.MeshLambertMaterial({ color: '#f1d3b8' })
const visorMaterial = new THREE.MeshLambertMaterial({ color: '#1d2026' })
const bodyMaterials = new Map<string, THREE.MeshLambertMaterial>()

function bodyMaterial(color: string) {
  let m = bodyMaterials.get(color)
  if (!m) bodyMaterials.set(color, (m = new THREE.MeshLambertMaterial({ color })))
  return m
}

interface AvatarProps {
  color: string
  /** Current animation (Anim enum); read every frame, so pass a getter over mutable state. */
  getAnim: () => number
  children?: ReactNode
}

/** Stylized low-poly figure (3 draw calls) with procedural idle/walk/run/sit motion. */
export function Avatar({ color, getAnim, children }: AvatarProps) {
  const figure = useRef<THREE.Group>(null)
  // Random start phase so idle players don't bob in sync.
  const [initialPhase] = useState(() => Math.random() * 10)
  const phase = useRef(initialPhase)
  const material = useMemo(() => bodyMaterial(color), [color])

  useFrame((_, dt) => {
    const g = figure.current
    if (!g) return
    const anim = getAnim()
    const speed = anim === Anim.run ? 15 : anim === Anim.walk ? 9 : 2
    phase.current += dt * speed
    const t = phase.current
    let y = 0
    let tilt = 0
    let sway = 0
    if (anim === Anim.walk || anim === Anim.run) {
      y = Math.abs(Math.sin(t)) * (anim === Anim.run ? 0.1 : 0.06)
      tilt = anim === Anim.run ? 0.18 : 0.07
      sway = Math.sin(t) * 0.06
    } else if (anim === Anim.sit) {
      y = -0.3
      tilt = -0.08
    } else {
      y = Math.sin(t) * 0.01
    }
    const k = 1 - Math.exp(-dt * 12)
    g.position.y += (y - g.position.y) * k
    g.rotation.x += (tilt - g.rotation.x) * k
    g.rotation.z += (sway - g.rotation.z) * k
  })

  return (
    <group>
      <group ref={figure}>
        <mesh geometry={bodyGeometry} material={material} position-y={0.72} />
        <mesh geometry={headGeometry} material={headMaterial} position-y={1.52} />
        <mesh geometry={visorGeometry} material={visorMaterial} position={[0, 1.55, 0.17]} />
      </group>
      {children}
    </group>
  )
}
