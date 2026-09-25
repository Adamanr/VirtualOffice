import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { level, zoneAt } from '../lib/level'
import { getConnection, netFlags } from '../net/session'
import { useGame } from '../store/game'
import { local } from '../store/local'

const SEND_INTERVAL = 1 / 15

/** Sends the local state at up to 15 Hz, only when it changed; tracks the current zone. */
export function NetSync() {
  const acc = useRef(0)
  const last = useRef({ x: NaN, y: NaN, z: NaN, r: NaN, a: -1 })

  useFrame((_, dt) => {
    const { x, y, z } = local.position
    const zone = zoneAt(level, x, z)?.id ?? null
    if (zone !== useGame.getState().zoneId) useGame.getState().setZone(zone)

    acc.current += dt
    if (acc.current < SEND_INTERVAL) return
    acc.current = 0
    const conn = getConnection()
    if (!conn) return
    const l = last.current
    const changed =
      Math.abs(x - l.x) > 0.01 ||
      Math.abs(y - l.y) > 0.02 ||
      Math.abs(z - l.z) > 0.01 ||
      Math.abs(local.rotY - l.r) > 0.02 ||
      local.anim !== l.a
    if (!changed && !netFlags.forceSend) return
    if (conn.channel.state !== 'joined') return
    netFlags.forceSend = false
    const r = Math.round(local.rotY * 1000) / 1000
    conn.send('move', { s: [round(x), round(y), round(z), r, local.anim] })
    Object.assign(l, { x, y, z, r: local.rotY, a: local.anim })
  })
  return null
}

const round = (v: number) => Math.round(v * 1000) / 1000
