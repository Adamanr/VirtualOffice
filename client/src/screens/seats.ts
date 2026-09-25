import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { getSeat } from '../lib/level'
import { remotes } from '../net/remotes'
import { notify, useGame } from '../store/game'
import { local } from '../store/local'

/** Sits the local player down (desk chair, any chair or a sofa place). */
export function sit(seatId: string) {
  const seat = getSeat(seatId)
  if (!seat) return
  for (const r of remotes.values()) {
    if (r.hasPose && r.pose.anim === Anim.sit && Math.hypot(r.pose.x - seat.x, r.pose.z - seat.z) < 0.3) {
      notify('Это место уже занято')
      return
    }
  }
  local.teleport = new THREE.Vector3(seat.x, 0, seat.z)
  local.rotY = seat.rotY
  useGame.setState({ seat: seatId, menuOpen: false })
}

export function standUp() {
  const seat = getSeat(useGame.getState().seat)
  useGame.setState({ seat: null, menuOpen: false })
  if (!seat) return
  local.teleport = new THREE.Vector3(seat.exit[0], 0, seat.exit[1])
}
