import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useEffect } from 'react'
import * as THREE from 'three'
import { onKey } from '../input/keyboard'
import { getDesk, getScreen } from '../lib/level'
import { useGame } from '../store/game'
import { cameraState, local } from '../store/local'
import { playerBody } from './LocalPlayer'

const HEAD = 1.5
const MIN_DIST = 1.2
const MAX_DIST = 14
const TOP_HEIGHT = 26

/** Set when the pointer moved enough during a press to count as a camera drag, not a click. */
export const pointerDrag = { moved: false }

const target = new THREE.Vector3()
const desired = new THREE.Vector3()
const dir = new THREE.Vector3()
const lookAt = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)

/** Third-person orbit camera with wall collision, top-down view (Tab) and desk view. */
export function CameraRig() {
  const { camera, gl } = useThree()
  const { world, rapier } = useRapier()
  const toggleCameraMode = useGame((s) => s.toggleCameraMode)

  useEffect(() => onKey('Tab', () => toggleCameraMode()), [toggleCameraMode])

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let startX = 0
    let startY = 0
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return
      dragging = true
      startX = e.clientX
      startY = e.clientY
      pointerDrag.moved = false
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) pointerDrag.moved = true
      cameraState.yaw -= e.movementX * 0.005
      cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch + e.movementY * 0.004, 0.05, 1.35)
    }
    const upHandler = (e: PointerEvent) => {
      dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      cameraState.distance = THREE.MathUtils.clamp(cameraState.distance * (1 + e.deltaY * 0.001), MIN_DIST, MAX_DIST)
    }
    const menu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', upHandler)
    el.addEventListener('pointercancel', upHandler)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', menu)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', upHandler)
      el.removeEventListener('pointercancel', upHandler)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', menu)
    }
  }, [gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const { cameraMode, seat } = useGame.getState()
    target.set(local.position.x, local.position.y + HEAD, local.position.z)

    const deskScreen = seat ? getScreen(getDesk(seat)?.screenId ?? '') : undefined
    if (deskScreen) {
      // Seated: look over the shoulder at the monitor.
      const [sx, sy, sz] = deskScreen.position
      const nx = Math.sin(deskScreen.rotationY)
      const nz = Math.cos(deskScreen.rotationY)
      desired.set(sx + nx * 0.95, sy + 0.12, sz + nz * 0.95)
      lookAt.set(sx, sy, sz)
      camera.position.lerp(desired, 1 - Math.exp(-dt * 8))
      camera.up.copy(up)
      camera.lookAt(lookAt)
      return
    }

    if (cameraMode === 'top') {
      desired.set(target.x, target.y + TOP_HEIGHT, target.z)
      camera.position.lerp(desired, 1 - Math.exp(-dt * 8))
      camera.up.set(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw))
      camera.lookAt(target.x, target.y, target.z)
      return
    }

    const { yaw, pitch, distance } = cameraState
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    let allowed = distance
    const hit = world.castRay(
      new rapier.Ray(target, dir),
      distance + 0.3,
      true,
      undefined,
      undefined,
      undefined,
      playerBody.current ?? undefined,
    )
    if (hit) allowed = Math.max(0.3, hit.timeOfImpact - 0.3)
    // Snap in immediately when blocked, ease back out when free.
    cameraState.current =
      allowed < cameraState.current ? allowed : cameraState.current + (allowed - cameraState.current) * (1 - Math.exp(-dt * 4))
    desired.copy(target).addScaledVector(dir, cameraState.current)
    camera.position.copy(desired)
    camera.up.copy(up)
    camera.lookAt(target)
  })

  return null
}
