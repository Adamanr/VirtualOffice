import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { sendPaddle } from '../activities/games'
import { PONG_HALF_L, PONG_HALF_W, TABLE_TOP } from '../activities/spots'
import { isDown } from '../input/keyboard'
import { props, rotateXZ, type Prop } from '../lib/level'
import { pongReceivedAt, useActivity } from '../store/activity'
import { usePlayers } from '../store/players'

const ballGeometry = new THREE.SphereGeometry(0.03, 12, 8)
const ballMaterial = new THREE.MeshBasicMaterial({ color: '#ff9f1c' })
const paddleGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.015, 20).rotateX(Math.PI / 2)
const handleGeometry = new THREE.BoxGeometry(0.03, 0.1, 0.02)
const paddleMaterials = { a: new THREE.MeshLambertMaterial({ color: '#d7262b' }), b: new THREE.MeshLambertMaterial({ color: '#1d2026' }) }
const handleMaterial = new THREE.MeshLambertMaterial({ color: '#b98a5a' })
const tables = props.filter((p) => p.kind === 'pingpong_table')

function world(prop: Prop, lx: number, y: number, lz: number, out: THREE.Vector3) {
  const [dx, dz] = rotateXZ(lx, lz, prop.rotY)
  return out.set(prop.x + dx, y, prop.z + dz)
}

function Table({ prop }: { prop: Prop }) {
  const ball = useRef<THREE.Mesh>(null)
  const pa = useRef<THREE.Group>(null)
  const pb = useRef<THREE.Group>(null)
  const localPaddle = useRef(0)
  const v = useRef(new THREE.Vector3())
  const pong = useActivity((s) => s.pongs[prop.id])
  const mode = useActivity((s) => s.mode)
  const players = usePlayers((s) => s.players)
  const mySide = mode?.kind === 'pong' && mode.propId === prop.id ? mode.side : undefined

  useFrame(({ pointer }, dt) => {
    const p = useActivity.getState().pongs[prop.id]
    const b = ball.current
    if (!p || !b) return

    // Local paddle: mouse across the screen (or A/D), predicted immediately.
    if (mySide) {
      // Looking down the table from side "a", screen-right is local -x.
      const dir = mySide === 'a' ? -1 : 1
      let x = dir * pointer.x * PONG_HALF_W * 1.15
      const keys = Number(isDown('KeyD')) - Number(isDown('KeyA'))
      if (keys) x = localPaddle.current + dir * keys * 2.2 * dt
      localPaddle.current = Math.max(-PONG_HALF_W, Math.min(PONG_HALF_W, x))
      sendPaddle(prop.id, localPaddle.current)
    }

    // Ball: extrapolate from the last server state, with a cosmetic bounce arc.
    const [bx = 0, bz = 0, vx = 0, vz = 0] = p.ball
    const age = p.status === 'playing' ? Math.min(0.2, (performance.now() - (pongReceivedAt.get(prop.id) ?? 0)) / 1000) : 0
    let x = bx + vx * age
    const z = Math.max(-PONG_HALF_L - 0.2, Math.min(PONG_HALF_L + 0.2, bz + vz * age))
    if (x > PONG_HALF_W) x = 2 * PONG_HALF_W - x
    if (x < -PONG_HALF_W) x = -2 * PONG_HALF_W - x
    const s = (z + PONG_HALF_L) / PONG_HALF_L
    const y = TABLE_TOP + 0.03 + (p.status === 'playing' ? 0.26 * Math.abs(Math.sin(Math.PI * s)) : 0.25)
    b.visible = p.status !== 'idle'
    b.position.copy(world(prop, x, y, z, v.current))

    const place = (g: THREE.Group | null, side: 'a' | 'b', px: number, who: string | null) => {
      if (!g) return
      g.visible = !!who
      const lz = side === 'a' ? -PONG_HALF_L - 0.15 : PONG_HALF_L + 0.15
      const target = mySide === side ? localPaddle.current : px
      g.position.copy(world(prop, target, TABLE_TOP + 0.14, lz, v.current))
      g.rotation.y = prop.rotY
    }
    place(pa.current, 'a', p.pa, p.a)
    place(pb.current, 'b', p.pb, p.b)
  })

  const name = (id: string | null | undefined) => (id === 'bot' ? 'Дуайт-бот 🤖' : id ? (players[id]?.name ?? '…') : '—')
  return (
    <>
      <mesh ref={ball} geometry={ballGeometry} material={ballMaterial} visible={false} />
      {(['a', 'b'] as const).map((side) => (
        <group key={side} ref={side === 'a' ? pa : pb} visible={false}>
          <mesh geometry={paddleGeometry} material={paddleMaterials[side]} />
          <mesh geometry={handleGeometry} material={handleMaterial} position-y={-0.12} />
        </group>
      ))}
      {pong && pong.status !== 'idle' && (
        <Html position={[prop.x, 2.3, prop.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="pong-score">
            <span>{name(pong.a)}</span>
            <strong>
              {pong.sa} : {pong.sb}
            </strong>
            <span>{name(pong.b)}</span>
            {pong.status === 'won' && <div className="pong-win">🏆 Победа: {name(pong.winner)}</div>}
          </div>
        </Html>
      )}
    </>
  )
}

/** Ping-pong tables: ball, paddles and score, the same for everyone watching. */
export function PongTables() {
  return (
    <>
      {tables.map((t) => (
        <Table key={t.id} prop={t} />
      ))}
    </>
  )
}
