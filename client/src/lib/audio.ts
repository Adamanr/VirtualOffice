/**
 * Who hears whom, how loud, and from which side. Pure functions shared by
 * the media loop and the tests.
 *
 * - Open (non-isolated) zones: proximity audio. Full volume up to HEAR_FULL
 *   meters, fading to silence at HEAR_MAX.
 * - Isolated zones (meeting rooms, hall): everyone inside hears each other at
 *   full volume; nobody hears across the boundary in either direction.
 */

export const HEAR_FULL = 2
export const HEAR_MAX = 10
/** Subscribe a bit before a voice becomes audible, unsubscribe a bit after (hysteresis). */
export const SUBSCRIBE_RADIUS = 11
export const UNSUBSCRIBE_RADIUS = 13
/** Pan strength: 1 = hard left/right. */
const PAN_AMOUNT = 0.7

export interface Point {
  x: number
  z: number
  zoneId: string | null
}

export interface Listener extends Point {
  /** Camera yaw (0 = looking toward -Z); sounds are panned relative to the view. */
  yaw: number
}

export interface Audibility {
  volume: number
  pan: number
  /** Whether the track should be subscribed (with hysteresis from `subscribed`). */
  subscribe: boolean
  distance: number
}

export function volumeAtDistance(d: number): number {
  if (d <= HEAR_FULL) return 1
  if (d >= HEAR_MAX) return 0
  const t = (d - HEAR_FULL) / (HEAR_MAX - HEAR_FULL)
  return (1 - t) * (1 - t)
}

export function panFor(listener: Listener, source: Point, distance: number): number {
  if (distance < 0.5) return 0
  // Camera right vector for yaw: (cos yaw, -sin yaw).
  const dx = (source.x - listener.x) / distance
  const dz = (source.z - listener.z) / distance
  const right = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)
  return Math.max(-1, Math.min(1, right * PAN_AMOUNT))
}

export function audibility(
  listener: Listener,
  source: Point,
  isIsolated: (zoneId: string | null) => boolean,
  subscribed = false,
): Audibility {
  const distance = Math.hypot(source.x - listener.x, source.z - listener.z)
  const pan = panFor(listener, source, distance)
  if (isIsolated(listener.zoneId) || isIsolated(source.zoneId)) {
    const same = listener.zoneId === source.zoneId
    return { volume: same ? 1 : 0, pan, subscribe: same, distance }
  }
  const radius = subscribed ? UNSUBSCRIBE_RADIUS : SUBSCRIBE_RADIUS
  return { volume: volumeAtDistance(distance), pan, subscribe: distance < radius, distance }
}

/** Whether a screen is visible to the listener: same zone, and close enough for desk monitors. */
export function canSeeScreen(
  listener: Point,
  screen: { zoneId: string; position: [number, number, number]; viewDistance?: number },
): boolean {
  if (listener.zoneId !== screen.zoneId) return false
  if (screen.viewDistance === undefined) return true
  return Math.hypot(screen.position[0] - listener.x, screen.position[2] - listener.z) <= screen.viewDistance
}

/**
 * Picks whose cameras to show: audible people with a camera on, nearest first.
 * Returns ids in display order.
 */
export function pickVideoTiles(
  candidates: { id: string; distance: number; audible: boolean }[],
  max: number,
): string[] {
  return candidates
    .filter((c) => c.audible)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max)
    .map((c) => c.id)
}
