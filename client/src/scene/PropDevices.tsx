import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { props, propPoint, type Prop } from '../lib/level'
import { vendingColor } from '../props/jokes'
import { useActivity } from '../store/activity'
import { useProps } from '../store/props'

const box = new THREE.BoxGeometry(1, 1, 1)
const glow = new THREE.MeshBasicMaterial({ color: '#ffb347' })
const interior = new THREE.MeshBasicMaterial({ color: '#f4fbff' })
const fridgeDoor = new THREE.MeshLambertMaterial({ color: '#f2f0ea' })
const red = new THREE.MeshBasicMaterial({ color: '#ff2a2a' })
const green = new THREE.MeshBasicMaterial({ color: '#3ddc84' })
const paper = new THREE.MeshLambertMaterial({ color: '#fbfaf5' })

/** Re-renders when any device state expires, so effects switch off on time. */
function useNow(until: number | undefined) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!until) return
    const t = setTimeout(() => force((n) => n + 1), Math.max(0, until - Date.now()) + 20)
    return () => clearTimeout(t)
  }, [until])
  return Date.now()
}

function place(p: Prop, lx: number, ly: number, lz: number) {
  const [x, y, z] = propPoint(p, lx, ly, lz)
  return { position: [x, y, z] as [number, number, number], 'rotation-y': p.rotY }
}

function Microwave({ prop }: { prop: Prop }) {
  const dev = useActivity((s) => s.devices[prop.id])
  const now = useNow(dev?.until)
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.y = 0.2 * (0.85 + 0.15 * Math.sin(clock.elapsedTime * 12))
  })
  if (dev?.state !== 'running' || dev.until < now) return null
  return <mesh ref={ref} geometry={box} material={glow} {...place(prop, -0.05, 1.1, 0.185)} scale={[0.3, 0.2, 0.005]} />
}

function Fridge({ prop }: { prop: Prop }) {
  const dev = useActivity((s) => s.devices[prop.id])
  const now = useNow(dev?.until)
  if (dev?.state !== 'open' || dev.until < now) return null
  // Door swings open on its right hinge; the lit interior shows where it was.
  const [hx, , hz] = propPoint(prop, 0.4, 0, 0.36)
  return (
    <>
      <mesh geometry={box} material={interior} {...place(prop, 0, 0.95, 0.352)} scale={[0.72, 1.8, 0.005]} />
      <group position={[hx, 0.95, hz]} rotation-y={prop.rotY + 1.9}>
        <mesh geometry={box} material={fridgeDoor} position={[-0.4, 0, 0]} scale={[0.8, 1.88, 0.05]} />
      </group>
    </>
  )
}

function StatusLight({ prop, at }: { prop: Prop; at: [number, number, number] }) {
  const dev = useActivity((s) => s.devices[prop.id])
  const now = useNow(dev?.until)
  const ref = useRef<THREE.Mesh>(null)
  const active = !!dev && dev.until >= now && (dev.state === 'jammed' || dev.state === 'printing' || dev.state === 'brewing')
  useFrame(({ clock }) => {
    if (ref.current) ref.current.visible = Math.sin(clock.elapsedTime * (dev?.state === 'jammed' ? 8 : 16)) > 0
  })
  if (!active) return null
  return (
    <mesh ref={ref} geometry={box} material={dev.state === 'jammed' ? red : green} {...place(prop, at[0], at[1], at[2])} scale={[0.05, 0.03, 0.05]} />
  )
}

function Vending({ prop }: { prop: Prop }) {
  const state = useProps((s) => s.vending[prop.id])
  const material = useMemo(() => new THREE.MeshLambertMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  if (!state?.jammed) return null
  material.color.set(vendingColor(state.lastItem))
  // The snack dangles from its spiral behind the glass — everybody sees it's stuck.
  const p = place(prop, -0.12, 0.98, 0.43)
  return <mesh geometry={box} material={material} position={p.position} rotation={[0.5, prop.rotY, 0.25]} scale={[0.1, 0.15, 0.04]} />
}

function PaperPiles() {
  const piles = useActivity((s) => s.piles)
  const ref = useRef<THREE.InstancedMesh>(null)
  const perPile = 14
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    let i = 0
    for (const pile of piles) {
      let seed = [...pile.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let k = 0; k < perPile; k++) {
        e.set(0, rnd() * Math.PI, (rnd() - 0.5) * 0.3)
        q.setFromEuler(e)
        m.compose(new THREE.Vector3(pile.x + (rnd() - 0.5) * 0.9, 0.01 + k * 0.012, pile.z + (rnd() - 0.5) * 0.9), q, new THREE.Vector3(0.21, 0.004, 0.29))
        mesh.setMatrixAt(i++, m)
      }
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
  }, [piles])
  return <instancedMesh ref={ref} args={[box, paper, 6 * perPile]} frustumCulled={false} />
}

/** Visible state of appliances, the same for everyone in the office. */
export function PropDevices() {
  // Expired piles are dropped lazily.
  useEffect(() => {
    const t = setInterval(() => {
      const { piles } = useActivity.getState()
      const alive = piles.filter((p) => p.until > Date.now())
      if (alive.length !== piles.length) useActivity.setState({ piles: alive })
    }, 5000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      {props.map((p) => {
        switch (p.kind) {
          case 'microwave':
            return <Microwave key={p.id} prop={p} />
          case 'fridge':
            return <Fridge key={p.id} prop={p} />
          case 'copier':
            return <StatusLight key={p.id} prop={p} at={[0.42, 1.0, 0.28]} />
          case 'coffee_machine':
            return <StatusLight key={p.id} prop={p} at={[0.1, 1.33, 0.16]} />
          case 'vending_machine':
            return <Vending key={p.id} prop={p} />
          default:
            return null
        }
      })}
      <PaperPiles />
    </>
  )
}
