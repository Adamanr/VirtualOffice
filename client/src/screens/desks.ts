import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { deskSeat, getDesk } from '../lib/level'
import { remotes } from '../net/remotes'
import { notify, useGame } from '../store/game'
import { local } from '../store/local'

/** Sits the local player at a desk: locks position, camera looks at the monitor. */
export function sit(deskId: string) {
  const desk = getDesk(deskId)
  if (!desk) return
  const seat = deskSeat(desk)
  for (const r of remotes.values()) {
    if (r.hasPose && r.pose.anim === Anim.sit && Math.hypot(r.pose.x - seat.x, r.pose.z - seat.z) < 0.3) {
      notify('Это место уже занято')
      return
    }
  }
  local.teleport = new THREE.Vector3(seat.x, 0, seat.z)
  local.rotY = seat.rotY
  useGame.setState({ seat: deskId, menuOpen: false })
}

export function standUp() {
  const deskId = useGame.getState().seat
  const desk = deskId ? getDesk(deskId) : undefined
  useGame.setState({ seat: null, menuOpen: false })
  if (!desk) return
  const seat = deskSeat(desk)
  // Step back from the desk so we don't start inside the chair.
  local.teleport = new THREE.Vector3(seat.x - Math.sin(seat.rotY) * 0.5, 0, seat.z - Math.cos(seat.rotY) * 0.5)
}

