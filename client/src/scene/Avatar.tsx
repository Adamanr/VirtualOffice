import { createPortal, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Anim } from '@shared/protocol.gen'
import { animsUrl, avatarInfo, avatarUrl, type Look } from '../lib/look'
import { gestures, useActivity, type HeldItem } from '../store/activity'

interface AvatarProps {
  /** Player id: drives gestures and held items shared by everyone. */
  id?: string | null
  look: Look
  /** Current animation (Anim enum); read every frame, so pass a getter over mutable state. */
  getAnim: () => number
  children?: ReactNode
}

type Clip = 'idle' | 'walk' | 'run' | 'sit' | 'wave' | 'drink'

/** Playback speed so feet roughly match the ground speed (see LocalPlayer WALK/RUN_SPEED). */
const TIME_SCALE: Record<Clip, number> = { idle: 1, walk: 1.55, run: 1.4, sit: 1, wave: 1.3, drink: 1 }
/** Pelvis height (m) in the sitting clip; our seats put the hips at SEAT_HIPS. */
const SIT_PELVIS = { m: 0.59, f: 0.61 }
const SEAT_HIPS = 0.5

/**
 * The walk and run clips still carry their forward travel in the pelvis track:
 * remove the linear trend so people walk in place (the game moves them), keeping
 * the natural bob and sway. Done once per shared clip.
 */
const inPlace = new WeakSet<THREE.AnimationClip>()
function makeInPlace(clip: THREE.AnimationClip) {
  if (inPlace.has(clip)) return
  inPlace.add(clip)
  for (const track of clip.tracks) {
    if (!track.name.endsWith('Pelvis.position')) continue
    const { times, values } = track
    const n = times.length
    if (n < 2) continue
    const t0 = times[0]!
    const span = times[n - 1]! - t0
    for (let c = 0; c < 3; c++) {
      const first = values[c]!
      const drift = values[(n - 1) * 3 + c]! - first
      for (let i = 0; i < n; i++) values[i * 3 + c]! -= (drift * (times[i]! - t0)) / span
    }
  }
}
const FADE = 0.25

/** Is this player carrying something right now (a coffee, a snack…)? */
const carrying = (id: string | null | undefined) => {
  const held = id ? useActivity.getState().held[id] : undefined
  return !!held && held.until > Date.now()
}

/**
 * Materials of a loaded avatar, once per model: matte PBR lit by the office
 * environment like everything else, hair and lashes alpha-tested.
 */
const prepared = new WeakSet<THREE.Object3D>()
function prepare(scene: THREE.Object3D) {
  if (prepared.has(scene)) return
  prepared.add(scene)
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    const matte = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial
      std.metalness = 0
      std.roughness = Math.max(std.roughness, 0.7)
      std.transparent = false
      return std
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(matte) : matte(mesh.material)
  })
}

/**
 * A real person (Rocketbox model) with motion-captured idle / walk / run / sit
 * clips cross-faded by the network `anim`, one-shot gestures from activities,
 * and whatever they carry in the right hand.
 */
export function Avatar({ id, look, getAnim, children }: AvatarProps) {
  const info = avatarInfo(look.avatar)
  const { scene } = useGLTF(avatarUrl(info.id))
  const { animations } = useGLTF(animsUrl(info.gender))
  const figure = useRef<THREE.Group>(null)

  const model = useMemo(() => {
    prepare(scene)
    const m = cloneSkinned(scene)
    m.traverse((o) => {
      // Poses move vertices far from the bind-pose bounds (sitting, arms up).
      o.frustumCulled = false
      o.castShadow = true
    })
    return m
  }, [scene])
  const hand = useMemo(() => model.getObjectByName('Bip01_R_Hand') ?? null, [model])

  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  const actions = useMemo(() => {
    const map = new Map<Clip, THREE.AnimationAction>()
    for (const clip of animations) {
      if (clip.name === 'walk' || clip.name === 'run') makeInPlace(clip)
      const action = mixer.clipAction(clip)
      action.timeScale = TIME_SCALE[clip.name as Clip] ?? 1
      map.set(clip.name as Clip, action)
    }
    return map
  }, [animations, mixer])
  useEffect(() => () => void mixer.stopAllAction(), [mixer])

  // Which clip plays on which mixer: a new model (another person) starts from scratch.
  const current = useRef<{ mixer: THREE.AnimationMixer; clip: Clip } | null>(null)
  // Random start phase so idle people don't breathe in sync.
  const [offset] = useState(() => Math.random() * 10)

  useFrame((_, rawDt) => {
    const g = figure.current
    if (!g) return
    const dt = Math.min(rawDt, 0.05)
    const anim = getAnim()
    const gs = id ? gestures.get(id) : undefined
    const k = gs ? (performance.now() - gs.start) / gs.duration : 1
    if (gs && k >= 1) gestures.delete(id!)

    let want: Clip = anim === Anim.run ? 'run' : anim === Anim.walk ? 'walk' : anim === Anim.sit ? 'sit' : 'idle'
    if (want === 'idle' && carrying(id)) want = 'drink'
    if (k < 1 && (gs!.type === 'use' || gs!.type === 'throw') && want !== 'sit') want = 'wave'
    const playing = current.current?.mixer === mixer ? current.current.clip : null
    const next = actions.get(want)
    // Also restart a clip that was stopped behind our back (Suspense hides and
    // re-shows the tree, running effect cleanups; a T-pose otherwise).
    if (next && (want !== playing || !next.isRunning())) {
      const prev = playing && playing !== want ? actions.get(playing) : undefined
      {
        next.reset()
        if (want === 'idle' || want === 'sit') next.time = offset % next.getClip().duration
        next.setEffectiveWeight(1).play()
        if (prev) prev.crossFadeTo(next, FADE, false)
        current.current = { mixer, clip: want }
      }
    }
    mixer.update(dt)

    // Whole-body touches for the gestures that have no clip.
    // The sitting clip sits on a taller chair than ours.
    let y = anim === Anim.sit ? SEAT_HIPS - SIT_PELVIS[info.gender] * look.height : 0
    let tilt = 0
    let sway = 0
    let squash = 1
    if (k < 1) {
      const s = Math.sin(k * Math.PI)
      switch (gs!.type) {
        case 'kick':
          tilt -= 0.25 * Math.sin(k * Math.PI * 2)
          break
        case 'hop':
          y += 0.35 * Math.abs(Math.sin(k * Math.PI * 2))
          break
        case 'bonk':
          sway += 0.25 * Math.sin(k * 30) * (1 - k)
          squash = 1 - 0.12 * s
          break
        case 'shiver':
          sway += 0.05 * Math.sin(k * 60)
          break
      }
    }
    const ks = 1 - Math.exp(-dt * 12)
    g.position.y += (y - g.position.y) * (anim === Anim.sit ? 1 : ks)
    g.rotation.x += (tilt - g.rotation.x) * ks
    g.rotation.z += (sway - g.rotation.z) * (gs ? 0.6 : ks)
    g.scale.y += (squash - g.scale.y) * 0.5
  })

  return (
    <group>
      <group ref={figure}>
        <group scale={look.height}>
          <primitive object={model} />
        </group>
        {id && hand && createPortal(<Held id={id} upright={figure} />, hand)}
      </group>
      {children}
    </group>
  )
}

// The people used by default start loading with the office.
useGLTF.preload(animsUrl('m'))
useGLTF.preload(animsUrl('f'))

/** Rocketbox skeletons are in centimetres (the armature is scaled by 0.01). */
const HAND_SCALE = 100

/** Whatever the player is carrying after an activity (coffee, snack, popcorn…). */
const _q = new THREE.Quaternion()

function Held({ id, upright }: { id: string; upright: RefObject<THREE.Group | null> }) {
  const held = useActivity((s) => s.held[id])
  const group = useRef<THREE.Group>(null)
  const [, force] = useState(0)
  useEffect(() => {
    if (!held) return
    const t = setTimeout(() => force((n) => n + 1), Math.max(0, held.until - Date.now()))
    return () => clearTimeout(t)
  }, [held])
  // Follows the palm but stays upright (a cup doesn't tilt with the wrist bone's axes).
  useFrame(() => {
    const g = group.current
    const hand = g?.parent
    if (!g || !hand || !upright.current) return
    hand.getWorldQuaternion(_q).invert()
    g.quaternion.copy(_q.multiply(upright.current.getWorldQuaternion(new THREE.Quaternion())))
  })
  if (!held || held.until < Date.now()) return null
  // Bones live in the model's centimetre space: undo that scale; the palm is ~8 cm down the hand.
  return (
    <group ref={group} scale={HAND_SCALE} position={[8, 0, 2]}>
      <group position-y={-0.02}>
        <HeldMesh item={held.item} color={held.color} />
      </group>
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
