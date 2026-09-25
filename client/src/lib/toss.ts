/**
 * Paper-basketball ballistics, shared by the aim preview and the flight
 * animation. Must match Office.Toss on the server: p(t) = o + v·t + ½·g·t².
 */
export const GRAVITY = -9.81
export const MIN_SPEED = 3
export const MAX_SPEED = 11.5
export const LAUNCH_ANGLE = 0.72 // ~41°: a friendly lob

export type V3 = [number, number, number]

export function positionAt(origin: V3, vel: V3, t: number, out: V3 = [0, 0, 0]): V3 {
  out[0] = origin[0] + vel[0] * t
  out[1] = origin[1] + vel[1] * t + 0.5 * GRAVITY * t * t
  out[2] = origin[2] + vel[2] * t
  return out
}

/** Velocity for a throw toward camera yaw with charge 0..1. yaw 0 = camera looks toward -Z. */
export function throwVelocity(yaw: number, charge: number): V3 {
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.max(0, charge))
  const h = Math.cos(LAUNCH_ANGLE) * speed
  return [-Math.sin(yaw) * h, Math.sin(LAUNCH_ANGLE) * speed, -Math.cos(yaw) * h]
}

/** Where the ball hits the floor (y = 0.05), for the aim marker. */
export function landingTime(origin: V3, vel: V3, floor = 0.05): number {
  // floor = oy + vy t + ½ g t²  →  solve for the positive root.
  const a = 0.5 * GRAVITY
  const b = vel[1]
  const c = origin[1] - floor
  const disc = b * b - 4 * a * c
  return disc < 0 ? 0 : (-b - Math.sqrt(disc)) / (2 * a)
}

/** Charge oscillates 0→1→0 while the key is held, so timing matters. */
export function chargeAt(heldMs: number, periodMs = 1400): number {
  const phase = (heldMs % periodMs) / periodMs
  return phase < 0.5 ? phase * 2 : 2 - phase * 2
}
