import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { level, props, propPoint } from '../lib/level'
import { useActivity } from '../store/activity'
import { local } from '../store/local'
import { usePlayers } from '../store/players'

const ringGeometry = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2)
const discGeometry = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)
const strobeGeometry = new THREE.SphereGeometry(0.07, 10, 8)
const arrowGeometry = new THREE.ConeGeometry(0.12, 0.3, 12).rotateX(Math.PI / 2)
const alarms = props.filter((p) => p.kind === 'fire_alarm')

function labelTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.font = '800 64px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('ТОЧКА СБОРА', 256, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Fire drill for everyone: red pulsing light over the whole office, flashing
 * strobes on the alarms, a glowing assembly point in the hall, and an arrow
 * over your own head pointing the way until you get there.
 */
export function DrillFx() {
  const active = useActivity((s) => !!s.drill?.active)
  const assembly = level.activities?.assembly
  const light = useRef<THREE.AmbientLight>(null)
  const strobes = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const arrow = useRef<THREE.Mesh>(null)
  const materials = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.9 }),
      disc: new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.18, depthWrite: false }),
      label: new THREE.MeshBasicMaterial({ map: labelTexture(), transparent: true, depthWrite: false }),
      strobe: new THREE.MeshBasicMaterial({ color: '#ff2020' }),
      arrow: new THREE.MeshBasicMaterial({ color: '#3ddc84' }),
    }),
    [],
  )

  useFrame(({ clock: c }) => {
    const t = c.elapsedTime
    const on = Math.sin(t * 9) > 0
    if (light.current) light.current.intensity = active ? 0.9 + 0.9 * Math.max(0, Math.sin(t * 4.5)) : 0
    if (strobes.current) strobes.current.visible = active && on
    if (ring.current) ring.current.scale.setScalar(1 + 0.06 * Math.sin(t * 5))
    const a = arrow.current
    if (a && assembly) {
      const drill = useActivity.getState().drill
      const self = usePlayers.getState().selfId
      const done = !drill || drill.evacuated.some((e) => e.id === self)
      a.visible = active && !done
      if (a.visible) {
        const dx = assembly.position[0] - local.position.x
        const dz = assembly.position[1] - local.position.z
        a.position.set(local.position.x, 2.6 + 0.08 * Math.sin(t * 6), local.position.z)
        a.rotation.set(0, Math.atan2(dx, dz), 0)
      }
    }
  })

  return (
    <>
      <ambientLight ref={light} color="#ff3b2f" intensity={0} />
      <group ref={strobes} visible={false}>
        {alarms.map((p) => (
          <mesh key={p.id} geometry={strobeGeometry} material={materials.strobe} position={propPoint(p, 0, p.elevation + 0.28, 0.1)} />
        ))}
      </group>
      {active && assembly && (
        <group position={[assembly.position[0], 0.03, assembly.position[1]]}>
          <mesh ref={ring} geometry={ringGeometry} material={materials.ring} scale={assembly.radius} />
          <mesh geometry={discGeometry} material={materials.disc} scale={assembly.radius} />
          <mesh material={materials.label} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
            <planeGeometry args={[assembly.radius * 1.6, assembly.radius * 0.4]} />
          </mesh>
        </group>
      )}
      <mesh ref={arrow} geometry={arrowGeometry} material={materials.arrow} visible={false} />
    </>
  )
}
