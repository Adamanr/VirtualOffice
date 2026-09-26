import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import type { Look } from '../lib/look'
import { gestures, useActivity, type HeldItem } from '../store/activity'
import { acquireBody, avatarMaterial, hipX, releaseBody, shoulderX, SKELETON } from './humanoid'

interface AvatarProps {
  /** Player id: drives gestures and held items shared by everyone. */
  id?: string | null
  look: Look
  /** Current animation (Anim enum); read every frame, so pass a getter over mutable state. */
  getAnim: () => number
  children?: ReactNode
}

type Joint = RefObject<THREE.Group | null>

/** Target joint angles for one frame (radians; x = swing forward/back, z = out to the side). */
interface Pose {
  legL: number
  legR: number
  kneeL: number
  kneeR: number
  armL: number
  armR: number
  armOutL: number
  armOutR: number
  elbowL: number
  elbowR: number
  spine: number
  head: number
  headTurn: number
}

const rest = (): Pose => ({ legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, armOutL: 0.1, armOutR: 0.1, elbowL: -0.1, elbowR: -0.1, spine: 0, head: 0, headTurn: 0 })

/** Is this player carrying something right now (a coffee, a snack…)? */
const carrying = (id: string | null | undefined) => {
  const held = id ? useActivity.getState().held[id] : undefined
  return !!held && held.until > Date.now()
}

/**
 * A low-poly office worker (see humanoid.ts) with procedural motion: walk and
 * run cycles, sitting, idle breathing, one-shot gestures from activities, and
 * a held item in the right hand.
 */
export function Avatar({ id, look, getAnim, children }: AvatarProps) {
  const figure = useRef<THREE.Group>(null)
  const spine = useRef<THREE.Group>(null)
  const neck = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const elbowL = useRef<THREE.Group>(null)
  const elbowR = useRef<THREE.Group>(null)
  // Random start phase so idle players don't breathe in sync.
  const [initialPhase] = useState(() => Math.random() * 10)
  const phase = useRef(initialPhase)
  const walkBlend = useRef(0)

  const { key, body } = useMemo(() => acquireBody(look), [look])
  useEffect(() => () => releaseBody(key), [key])

  useFrame((_, rawDt) => {
    const g = figure.current
    if (!g) return
    const dt = Math.min(rawDt, 0.05)
    const anim = getAnim()
    const moving = anim === Anim.walk || anim === Anim.run
    const run = anim === Anim.run
    phase.current += dt * (run ? 11 : moving ? 7.5 : 1.6)
    const t = phase.current
    walkBlend.current += ((moving ? 1 : 0) - walkBlend.current) * (1 - Math.exp(-dt * 10))
    const w = walkBlend.current

    const p = rest()
    let y = 0
    let tilt = 0
    let sway = 0
    let squash = 1
    // Walk / run: legs swing, the knee bends on the way back, arms counter-swing.
    const swing = Math.sin(t) * (run ? 0.75 : 0.5) * w
    p.legL = swing
    p.legR = -swing
    p.kneeL = Math.max(0, Math.sin(t - 1.3)) * (run ? 1.3 : 0.75) * w
    p.kneeR = Math.max(0, Math.sin(t + Math.PI - 1.3)) * (run ? 1.3 : 0.75) * w
    p.armL = -swing * 0.8
    p.armR = swing * 0.8
    p.elbowL = p.elbowR = run ? -1.25 * w - 0.1 : -0.25 * w - 0.1
    y = Math.abs(Math.cos(t)) * (run ? 0.07 : 0.035) * w - (run ? 0.04 : 0.015) * w
    tilt = (run ? 0.16 : 0.04) * w
    if (!moving) {
      // Idle: breathing, a slow look around.
      p.spine = Math.sin(t * 0.9) * 0.012
      p.headTurn = Math.sin(t * 0.23) * 0.25 * (1 - w)
    }
    if (anim === Anim.sit) {
      p.legL = p.legR = -Math.PI / 2 + 0.05
      p.kneeL = p.kneeR = Math.PI / 2 - 0.05
      p.armL = p.armR = -0.45
      p.elbowL = p.elbowR = -0.7
      p.armOutL = p.armOutR = 0.12
      y = -SKELETON.hipY * look.height + 0.5
      tilt = -0.04
    }
    if (carrying(id)) {
      p.armR = -0.35
      p.elbowR = -1.25
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
            p.armR = -1.3 * s
            p.elbowR = -0.3
            tilt += 0.12 * s
            break
          case 'kick':
            p.legR = -1.2 * Math.sin(k * Math.PI)
            p.kneeR = 0.3 * (1 - s)
            p.armL = 0.4 * s
            tilt -= 0.15 * s
            break
          case 'hop':
            y += 0.4 * Math.abs(Math.sin(k * Math.PI * 2))
            p.armL = p.armR = -2.7 * s
            p.armOutL = p.armOutR = 0.3 * s
            p.kneeL = p.kneeR = 0.8 * Math.abs(Math.sin(k * Math.PI * 2))
            break
          case 'throw':
            if (k < 0.4) {
              p.armR = -2.8 * (k / 0.4)
              p.elbowR = -1.5 * (k / 0.4)
              tilt -= 0.12 * (k / 0.4)
            } else {
              const q = (k - 0.4) / 0.6
              p.armR = -2.8 + 2.1 * Math.min(1, q * 1.6)
              p.elbowR = -1.5 * (1 - q)
              tilt += 0.25 * Math.sin(q * Math.PI)
            }
            break
          case 'bonk':
            sway += 0.3 * Math.sin(k * 30) * (1 - k)
            squash = 1 - 0.15 * s
            p.head = 0.4 * s
            p.armOutL = p.armOutR = 0.6 * s
            break
          case 'shiver':
            sway += 0.06 * Math.sin(k * 60)
            p.armL = p.armR = -0.6
            p.elbowL = p.elbowR = -1.9
            p.armOutL = p.armOutR = -0.35
            break
        }
      }
    }

    const kk = 1 - Math.exp(-dt * (gs ? 22 : 14))
    const set = (j: Joint, x: number, z = 0) => {
      const o = j.current
      if (!o) return
      o.rotation.x += (x - o.rotation.x) * kk
      o.rotation.z += (z - o.rotation.z) * kk
    }
    set(legL, p.legL)
    set(legR, p.legR)
    set(kneeL, p.kneeL)
    set(kneeR, p.kneeR)
    set(armL, p.armL, -p.armOutL)
    set(armR, p.armR, p.armOutR)
    set(elbowL, p.elbowL)
    set(elbowR, p.elbowR)
    set(spine, p.spine)
    if (neck.current) {
      neck.current.rotation.x += (p.head - neck.current.rotation.x) * kk
      neck.current.rotation.y += (p.headTurn - neck.current.rotation.y) * kk
    }
    const ks = 1 - Math.exp(-dt * 12)
    g.position.y += (y - g.position.y) * (anim === Anim.sit ? 1 : ks)
    g.rotation.x += (tilt - g.rotation.x) * ks
    g.rotation.z += (sway - g.rotation.z) * (gs ? 0.6 : ks)
    g.scale.y += (squash - g.scale.y) * 0.5
  })

  const { hipY, thigh, shoulderY, neckY, upperArm } = SKELETON
  const m = avatarMaterial
  return (
    <group>
      <group ref={figure}>
        <group scale={look.height}>
          <group ref={legL} position={[-hipX(look), hipY, 0]}>
            <mesh geometry={body.thighL} material={m} />
            <group ref={kneeL} position-y={-thigh}>
              <mesh geometry={body.shinL} material={m} />
            </group>
          </group>
          <group ref={legR} position={[hipX(look), hipY, 0]}>
            <mesh geometry={body.thighR} material={m} />
            <group ref={kneeR} position-y={-thigh}>
              <mesh geometry={body.shinR} material={m} />
            </group>
          </group>
          <group ref={spine} position-y={hipY}>
            <mesh geometry={body.torso} material={m} />
            <group ref={neck} position-y={neckY}>
              <mesh geometry={body.head} material={m} />
            </group>
            <group ref={armL} position={[-shoulderX(look), shoulderY, 0]}>
              <mesh geometry={body.upperArmL} material={m} />
              <group ref={elbowL} position-y={-upperArm}>
                <mesh geometry={body.forearmL} material={m} />
              </group>
            </group>
            <group ref={armR} position={[shoulderX(look), shoulderY, 0]}>
              <mesh geometry={body.upperArmR} material={m} />
              <group ref={elbowR} position-y={-upperArm}>
                <mesh geometry={body.forearmR} material={m} />
                {id && <Held id={id} />}
              </group>
            </group>
          </group>
        </group>
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
  // In the right hand; turned back upright against the bent arm (see the carry pose).
  return (
    <group position={[0, -0.3, 0.04]} rotation-x={1.6}>
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
