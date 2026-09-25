import { onKey } from '../input/keyboard'
import { chargeAt, throwVelocity, type V3 } from '../lib/toss'
import { throwPaper } from '../props/actions'
import { useGame } from '../store/game'
import { cameraState, local } from '../store/local'

/** Paper-basketball aiming: hold G to charge (power swings back and forth), release to throw. */
export const aim = { active: false, start: 0 }

export function aimCharge() {
  return aim.active ? chargeAt(performance.now() - aim.start) : 0
}

/** Where the ball leaves the hand, and with what velocity, for the current camera direction. */
export function currentThrow(charge = aimCharge()): { origin: V3; vel: V3 } {
  const yaw = cameraState.yaw
  const origin: V3 = [
    local.position.x - Math.sin(yaw) * 0.35,
    local.position.y + (useGame.getState().seat ? 1.15 : 1.45),
    local.position.z - Math.cos(yaw) * 0.35,
  ]
  return { origin, vel: throwVelocity(yaw, charge) }
}

export function installAimControls(): () => void {
  const offs = [
    onKey('KeyG', () => {
      aim.active = true
      aim.start = performance.now()
    }),
    onKey(
      'KeyG',
      () => {
        if (!aim.active) return
        const { origin, vel } = currentThrow()
        aim.active = false
        throwPaper(origin.map((v) => Math.round(v * 1000) / 1000) as V3, vel.map((v) => Math.round(v * 1000) / 1000) as V3)
      },
      'up',
    ),
  ]
  return () => offs.forEach((off) => off())
}
