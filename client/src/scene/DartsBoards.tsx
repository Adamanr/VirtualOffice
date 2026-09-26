import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { DART_FLIGHT_MS, throwDart } from '../activities/games'
import { DART_RADIUS } from '../activities/spots'
import { props, type Prop } from '../lib/level'
import { dartLandedAt, useActivity } from '../store/activity'
import { usePlayers } from '../store/players'

const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
const boards = props.filter((p) => p.kind === 'dartboard')
const FACE_OFFSET = 0.05
const MAX_DARTS = 30

/** A standard dartboard face (double ring at 170 mm = DART_RADIUS). */
function boardTexture() {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2
  const px = (mm: number) => (mm / 225) * (S / 2)
  g.fillStyle = '#111'
  g.beginPath()
  g.arc(cx, cx, S / 2, 0, Math.PI * 2)
  g.fill()
  const ring = (r0: number, r1: number, colorOf: (i: number) => string) => {
    for (let i = 0; i < 20; i++) {
      const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180
      const a1 = ((i * 18 + 9 - 90) * Math.PI) / 180
      g.fillStyle = colorOf(i)
      g.beginPath()
      g.arc(cx, cx, px(r1), a0, a1)
      g.arc(cx, cx, px(r0), a1, a0, true)
      g.closePath()
      g.fill()
    }
  }
  const light = (i: number) => (i % 2 === 0 ? '#1a1a1a' : '#f0e6c8')
  const accent = (i: number) => (i % 2 === 0 ? '#d7262b' : '#1e8a3c')
  ring(15.9, 99, light)
  ring(99, 107, accent)
  ring(107, 162, light)
  ring(162, 170, accent)
  g.fillStyle = '#1e8a3c'
  g.beginPath()
  g.arc(cx, cx, px(15.9), 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#d7262b'
  g.beginPath()
  g.arc(cx, cx, px(6.35), 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#f5f5f5'
  g.font = `700 ${Math.round(px(20))}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  SECTORS.forEach((n, i) => {
    const a = ((i * 18 - 90) * Math.PI) / 180
    g.fillText(String(n), cx + Math.cos(a) * px(196), cx + Math.sin(a) * px(196))
  })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** World point on the board face for board coords (u right, v up, 1 = double ring). */
function boardPoint(prop: Prop, u: number, v: number, depth: number, out: THREE.Vector3) {
  const rx = Math.cos(prop.rotY)
  const rz = -Math.sin(prop.rotY)
  const nx = Math.sin(prop.rotY)
  const nz = Math.cos(prop.rotY)
  return out.set(prop.x + nx * depth + rx * u * DART_RADIUS, prop.elevation + v * DART_RADIUS, prop.z + nz * depth + rz * u * DART_RADIUS)
}

const barrel = new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0, 0.06)
const flight = new THREE.BoxGeometry(0.035, 0.035, 0.002).translate(0, 0, 0.12)
const barrelMaterial = new THREE.MeshLambertMaterial({ color: '#c0c4cc' })
const flightMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' })

function Board({ prop, texture }: { prop: Prop; texture: THREE.Texture }) {
  const barrels = useRef<THREE.InstancedMesh>(null)
  const flights = useRef<THREE.InstancedMesh>(null)
  const reticle = useRef<THREE.Mesh>(null)
  const { camera, gl, raycaster, pointer } = useThree()
  const darts = useActivity((s) => s.darts[prop.id])
  const aiming = useActivity((s) => s.mode?.kind === 'darts' && s.mode.propId === prop.id)
  const players = usePlayers((s) => s.players)
  const aim = useRef({ u: 0, v: 0 })
  const lastThrow = useRef(0)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3(), c: new THREE.Color(), e: new THREE.Euler() }), [])
  const plane = useMemo(() => {
    const n = new THREE.Vector3(Math.sin(prop.rotY), 0, Math.cos(prop.rotY))
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(prop.x + n.x * FACE_OFFSET, prop.elevation, prop.z + n.z * FACE_OFFSET))
  }, [prop])

  // Click to throw while aiming.
  useEffect(() => {
    if (!aiming) return
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const now = performance.now()
      if (now - lastThrow.current < 750) return
      lastThrow.current = now
      throwDart(prop.id, aim.current.u, aim.current.v)
    }
    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
  }, [aiming, gl, prop.id])

  useFrame(({ clock }) => {
    // Stuck and flying darts.
    const bm = barrels.current
    const fm = flights.current
    if (bm && fm) {
      const st = useActivity.getState()
      const stuck = st.darts[prop.id] ?? []
      const inAir = st.flying.filter((f) => f.dart.boardId === prop.id)
      let i = 0
      const put = (pos: THREE.Vector3, yaw: number, pitch: number, color: string) => {
        tmp.e.set(pitch, yaw, 0, 'YXZ')
        tmp.q.setFromEuler(tmp.e)
        tmp.m.compose(pos, tmp.q, tmp.s)
        bm.setMatrixAt(i, tmp.m)
        fm.setMatrixAt(i, tmp.m)
        fm.setColorAt(i, tmp.c.set(color))
        i++
      }
      for (const d of stuck) {
        if (i >= MAX_DARTS) break
        const wobble = ((Number(d.id) % 7) - 3) * 0.03
        put(boardPoint(prop, d.u, d.v, FACE_OFFSET - 0.01, tmp.p), prop.rotY + wobble, wobble, players[d.by]?.color ?? '#ffffff')
      }
      for (const f of inAir) {
        if (i >= MAX_DARTS + 8) break
        const k = Math.min(1, (performance.now() - f.start) / DART_FLIGHT_MS)
        const to = boardPoint(prop, f.dart.u, f.dart.v, FACE_OFFSET - 0.01, new THREE.Vector3())
        const pos = tmp.p.set(f.from[0], f.from[1], f.from[2]).lerp(to, k)
        pos.y += Math.sin(k * Math.PI) * 0.18
        put(pos, prop.rotY, (0.5 - k) * 0.6, players[f.dart.by]?.color ?? '#ffffff')
      }
      bm.count = fm.count = i
      bm.visible = fm.visible = i > 0
      bm.instanceMatrix.needsUpdate = true
      fm.instanceMatrix.needsUpdate = true
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true
    }

    // Aim: the pointer on the board plane, with a drunken sway (skill!).
    const r = reticle.current
    if (!r) return
    r.visible = aiming
    if (!aiming) return
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.ray.intersectPlane(plane, tmp.p)
    if (!hit) return
    const t = clock.elapsedTime
    const rx = Math.cos(prop.rotY)
    const rz = -Math.sin(prop.rotY)
    let u = ((hit.x - prop.x) * rx + (hit.z - prop.z) * rz) / DART_RADIUS
    let v = (hit.y - prop.elevation) / DART_RADIUS
    u += Math.sin(t * 1.7) * 0.12 + Math.sin(t * 4.3) * 0.04
    v += Math.cos(t * 1.3) * 0.1 + Math.sin(t * 3.7) * 0.04
    aim.current = { u: Math.max(-1.4, Math.min(1.4, u)), v: Math.max(-1.4, Math.min(1.4, v)) }
    r.position.copy(boardPoint(prop, aim.current.u, aim.current.v, FACE_OFFSET + 0.004, tmp.p))
  })

  const last = darts?.[0]
  const [, force] = useState(0)
  useEffect(() => {
    if (!last) return
    const t = setTimeout(() => force((n) => n + 1), 2600)
    return () => clearTimeout(t)
  }, [last])
  const showScore = last && performance.now() - (dartLandedAt.get(last.id) ?? 0) < 2500
  const label = last ? (last.ring === 'bull' ? 'ЯБЛОЧКО! 50' : last.ring === 'miss' ? 'мимо' : `${last.ring === 'treble' ? 'x3 ' : last.ring === 'double' ? 'x2 ' : ''}${last.points}`) : ''

  const face = boardPoint(prop, 0, 0, FACE_OFFSET, new THREE.Vector3())
  return (
    <>
      <mesh position={face} rotation-y={prop.rotY}>
        <circleGeometry args={[DART_RADIUS * (225 / 170), 64]} />
        <meshLambertMaterial map={texture} />
      </mesh>
      <instancedMesh ref={barrels} args={[barrel, barrelMaterial, MAX_DARTS + 8]} frustumCulled={false} visible={false} />
      <instancedMesh ref={flights} args={[flight, flightMaterial, MAX_DARTS + 8]} frustumCulled={false} visible={false} />
      <mesh ref={reticle} rotation-y={prop.rotY} visible={false}>
        <ringGeometry args={[0.012, 0.018, 20]} />
        <meshBasicMaterial color="#3ddc84" depthTest={false} transparent />
      </mesh>
      {showScore && (
        <Html position={[face.x, face.y + 0.38, face.z]} center style={{ pointerEvents: 'none' }}>
          <div key={last.id} className="dart-score">
            {players[last.by]?.name ?? ''} · {label}
          </div>
        </Html>
      )}
    </>
  )
}

/** Dartboards with every dart ever thrown (until collected), for everyone. */
export function DartsBoards() {
  const texture = useMemo(boardTexture, [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <>
      {boards.map((b) => (
        <Board key={b.id} prop={b} texture={texture} />
      ))}
    </>
  )
}
