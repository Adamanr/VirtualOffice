import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { INTERP_DELAY_MS } from '../lib/interpolation'
import { lookFor } from '../lib/look'
import { clock, remotes } from '../net/remotes'
import { usePlayers } from '../store/players'
import { Avatar } from './Avatar'
import { Nameplate } from './Nameplate'

function RemotePlayer({ id, encodedLook }: { id: string; encodedLook?: string }) {
  const group = useRef<THREE.Group>(null)
  const look = useMemo(() => lookFor(id, encodedLook), [id, encodedLook])

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
      <Suspense fallback={<Nameplate id={id} />}>
        <Avatar id={id} look={look} getAnim={() => remotes.get(id)?.pose.anim ?? 0}>
          <Nameplate id={id} />
        </Avatar>
      </Suspense>
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
          <RemotePlayer key={p.id} id={p.id} encodedLook={p.look} />
        ))}
    </>
  )
}
