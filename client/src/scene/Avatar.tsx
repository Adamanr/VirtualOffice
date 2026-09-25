import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { gestures, useActivity, type HeldItem } from '../store/activity'

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
  /** Player id: drives gestures and held items shared by everyone. */
  id?: string | null
  color: string
  /** Current animation (Anim enum); read every frame, so pass a getter over mutable state. */
  getAnim: () => number
  children?: ReactNode
}

/** Stylized low-poly figure (3 draw calls) with procedural motion, gestures and a held item. */
export function Avatar({ id, color, getAnim, children }: AvatarProps) {
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
    let squash = 1
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

    // One-shot gestures triggered by activities (seen by everyone).
    const gs = id ? gestures.get(id) : undefined
    if (gs) {
      const k = (performance.now() - gs.start) / gs.duration
      if (k >= 1) gestures.delete(id!)
      else {
        const s = Math.sin(k * Math.PI)
        switch (gs.type) {
          case 'use':
            tilt += 0.3 * s
            break
          case 'kick':
            tilt -= 0.35 * Math.sin(k * Math.PI * 2)
            sway += 0.15 * s
            break
          case 'hop':
            y += 0.4 * Math.abs(Math.sin(k * Math.PI * 2))
            sway += 0.2 * Math.sin(k * 20) * (1 - k)
            break
          case 'throw':
            tilt += k < 0.4 ? -0.35 * (k / 0.4) : 0.4 * Math.sin(((k - 0.4) / 0.6) * Math.PI)
            break
          case 'bonk':
            sway += 0.35 * Math.sin(k * 30) * (1 - k)
            squash = 1 - 0.18 * s
            break
          case 'shiver':
            sway += 0.08 * Math.sin(k * 60)
            break
        }
      }
    }

    const kk = 1 - Math.exp(-dt * 12)
    g.position.y += (y - g.position.y) * kk
    g.rotation.x += (tilt - g.rotation.x) * kk
    g.rotation.z += (sway - g.rotation.z) * (gs ? 0.6 : kk)
    g.scale.y += (squash - g.scale.y) * 0.5
  })

  return (
    <group>
      <group ref={figure}>
        <mesh geometry={bodyGeometry} material={material} position-y={0.72} />
        <mesh geometry={headGeometry} material={headMaterial} position-y={1.52} />
        <mesh geometry={visorGeometry} material={visorMaterial} position={[0, 1.55, 0.17]} />
        {id && <Held id={id} />}
      </group>
      {children}
    </group>
  )
}

/** Whatever the player is carrying after an activity (coffee, snack, popcorn…). */
function Held({ id }: { id: string }) {
  const held = useActivity((s) => s.held[id])
  const [, force] = useState(0)
  useEffect(() => {
    if (!held) return
    const t = setTimeout(() => force((n) => n + 1), Math.max(0, held.until - Date.now()))
    return () => clearTimeout(t)
  }, [held])
  if (!held || held.until < Date.now()) return null
  return (
    <group position={[0.3, 1.0, 0.18]}>
      <HeldMesh item={held.item} color={held.color} />
    </group>
  )
}

const cup = new THREE.CylinderGeometry(0.05, 0.04, 0.11, 12)
const box = new THREE.BoxGeometry(1, 1, 1)
const mats = new Map<string, THREE.Material>()
const mat = (c: string) => {
  let m = mats.get(c)
  if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })))
  return m
}

function HeldMesh({ item, color }: { item: HeldItem; color?: string }) {
  switch (item) {
    case 'coffee':
      return (
        <>
          <mesh geometry={cup} material={mat('#ffffff')} />
          <mesh geometry={box} material={mat('#5a3a22')} position-y={0.05} scale={[0.07, 0.01, 0.07]} />
        </>
      )
    case 'water':
      return <mesh geometry={cup} material={mat('#dff3ff')} scale={[0.9, 0.9, 0.9]} />
    case 'yogurt':
      return <mesh geometry={cup} material={mat('#f8bbd0')} scale={[1, 0.7, 1]} />
    case 'snack':
      return <mesh geometry={box} material={mat(color ?? '#e5484d')} scale={[0.1, 0.16, 0.04]} rotation-z={0.3} />
    case 'popcorn':
      return (
        <>
          <mesh geometry={box} material={mat('#c8322f')} scale={[0.12, 0.16, 0.08]} />
          <mesh geometry={box} material={mat('#fff3c4')} position-y={0.1} scale={[0.13, 0.05, 0.09]} />
        </>
      )
    case 'paper':
      return <mesh geometry={box} material={mat('#fbfaf5')} scale={[0.21, 0.29, 0.005]} rotation-x={-0.4} />
    case 'cake':
      return <mesh geometry={box} material={mat('#f5d0a9')} scale={[0.12, 0.07, 0.1]} />
    case 'lunch':
      return <mesh geometry={box} material={mat('#8a5a2b')} scale={[0.2, 0.08, 0.14]} />
  }
}
