import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { level } from '../lib/level'

/**
 * Mutable, per-frame state of the local player. Kept outside React/zustand:
 * it changes every frame and is read by the camera, network and audio loops.
 */
// Dev only: ?spawn=x,z starts somewhere else (the server rejects teleports once joined).
const devSpawn = import.meta.env.DEV ? new URLSearchParams(location.search).get('spawn')?.split(',').map(Number) : undefined
const [spawnX, spawnZ] = devSpawn?.length === 2 && devSpawn.every(Number.isFinite) ? devSpawn : level.spawn.position

export const local = {
  position: new THREE.Vector3(spawnX, 0, spawnZ),
  rotY: level.spawn.rotationY,
  anim: Anim.idle as number,
  /** Set to force a teleport (server correction, sitting down/standing up). */
  teleport: null as THREE.Vector3 | null,
}

/** Orbit camera parameters; yaw 0 means the camera sits on +Z looking toward -Z. */
export const cameraState = {
  yaw: level.spawn.rotationY + Math.PI,
  pitch: 0.45,
  distance: 6,
  /** Distance actually used after wall collision, smoothed. */
  current: 6,
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __office: object }).__office = { local, cameraState }
}
