import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { useEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { isDown } from '../input/keyboard'
import { getSeat, level } from '../lib/level'
import { cameraState, local } from '../store/local'
import { useGame } from '../store/game'
import { usePlayers } from '../store/players'
import { useActivity } from '../store/activity'
import { Avatar } from './Avatar'

const WALK_SPEED = 3
const RUN_SPEED = 6
const GRAVITY = 20
const CAPSULE_HALF = 0.5
const CAPSULE_RADIUS = 0.35

/** Exposed so the camera ray can ignore the player's own collider. */
export const playerBody: { current: RapierRigidBody | null } = { current: null }

function dampAngle(from: number, to: number, k: number) {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + d * k
}

export function LocalPlayer({ color, children }: { color: string; children?: ReactNode }) {
  const selfId = usePlayers((s) => s.selfId)
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<THREE.Group>(null)
  const controller = useRef<KinematicCharacterController | null>(null)
  const vy = useRef(0)
  const { world } = useRapier()

  useEffect(() => {
    const c = world.createCharacterController(0.02)
    c.enableAutostep(0.35, 0.15, false)
    c.enableSnapToGround(0.3)
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    c.setSlideEnabled(true)
    controller.current = c
    playerBody.current = body.current
    return () => {
      controller.current = null
      world.removeCharacterController(c)
    }
  }, [world])

  useFrame((_, rawDt) => {
    const rb = body.current
    const kcc = controller.current
    if (!rb || !kcc) return
    const dt = Math.min(rawDt, 0.05)
    const collider = rb.collider(0)
    const game = useActivity.getState().mode
    // Sitting, or standing at a game: the player stays put.
    const seated = useGame.getState().seat !== null || game !== null

    if (local.teleport) {
      const t = local.teleport
      rb.setTranslation({ x: t.x, y: t.y + CAPSULE_HALF + CAPSULE_RADIUS, z: t.z }, true)
      rb.setNextKinematicTranslation({ x: t.x, y: t.y + CAPSULE_HALF + CAPSULE_RADIUS, z: t.z })
      local.position.copy(t)
      local.teleport = null
      vy.current = 0
    } else if (!seated) {
      const f = Number(isDown('KeyW') || isDown('ArrowUp')) - Number(isDown('KeyS') || isDown('ArrowDown'))
      const s = Number(isDown('KeyD')) - Number(isDown('KeyA'))
      const run = isDown('ShiftLeft') || isDown('ShiftRight')
      const yaw = cameraState.yaw
      let mx = -Math.sin(yaw) * f + Math.cos(yaw) * s
      let mz = -Math.cos(yaw) * f - Math.sin(yaw) * s
      const len = Math.hypot(mx, mz)
      const moving = len > 0
      if (moving) {
        const speed = run ? RUN_SPEED : WALK_SPEED
        mx = (mx / len) * speed * dt
        mz = (mz / len) * speed * dt
        local.rotY = dampAngle(local.rotY, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14))
      }
      vy.current -= GRAVITY * dt
      kcc.computeColliderMovement(collider, { x: mx, y: vy.current * dt, z: mz })
      if (kcc.computedGrounded()) vy.current = 0
      const m = kcc.computedMovement()
      const p = rb.translation()
      const next = { x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }
      if (next.y < -5) {
        next.x = level.spawn.position[0]
        next.y = 1
        next.z = level.spawn.position[1]
      }
      rb.setNextKinematicTranslation(next)
      local.position.set(next.x, next.y - CAPSULE_HALF - CAPSULE_RADIUS, next.z)
      const actuallyMoving = Math.hypot(m.x, m.z) > 0.2 * dt
      local.anim = moving && actuallyMoving ? (run ? Anim.run : Anim.walk) : Anim.idle
    }

    if (seated) local.anim = game && game.kind !== 'piano' ? Anim.idle : Anim.sit
    const v = visual.current
    if (v) {
      v.position.copy(local.position)
      v.rotation.y = local.rotY
      // The desk camera sits where our head is; so does a camera squeezed against a wall.
      v.visible = getSeat(useGame.getState().seat)?.kind !== 'desk' && (useGame.getState().cameraMode === 'top' || cameraState.current > 0.7)
    }
  })

  return (
    <>
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[local.position.x, local.position.y + CAPSULE_HALF + CAPSULE_RADIUS + 0.05, local.position.z]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[CAPSULE_HALF, CAPSULE_RADIUS]} />
      </RigidBody>
      <group ref={visual}>
        <Avatar id={selfId} color={color} getAnim={() => local.anim}>
          {children}
        </Avatar>
      </group>
    </>
  )
}
