import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { INTERP_DELAY_MS } from '../lib/interpolation'
import { clock, remotes } from '../net/remotes'
import { usePlayers } from '../store/players'
import { Avatar } from './Avatar'
import { Nameplate } from './Nameplate'

function RemotePlayer({ id, color }: { id: string; color: string }) {
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    const g = group.current
    const r = remotes.get(id)
    if (!g) return
    if (!r) {
      g.visible = false
      return
    }
    const t = clock.toServer(performance.now()) - INTERP_DELAY_MS
    r.hasPose = r.buffer.sample(t, r.pose) !== null
    g.visible = r.hasPose
    g.position.set(r.pose.x, r.pose.y, r.pose.z)
    g.rotation.y = r.pose.rotY
  })

  return (
    <group ref={group} visible={false}>
      <Avatar color={color} getAnim={() => remotes.get(id)?.pose.anim ?? 0}>
        <Nameplate id={id} />
      </Avatar>
    </group>
  )
}

export function RemotePlayers() {
  const players = usePlayers((s) => s.players)
  const selfId = usePlayers((s) => s.selfId)
  return (
    <>
      {Object.values(players)
        .filter((p) => p.id !== selfId)
        .map((p) => (
          <RemotePlayer key={p.id} id={p.id} color={p.color} />
        ))}
    </>
  )
}
