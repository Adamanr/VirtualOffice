import raw from '@shared/level.json'

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export interface LevelZone {
  id: string
  name: string
  isolated: boolean
  min: Vec2
  max: Vec2
  floorColor: string | null
}

export interface LevelScreen {
  id: string
  kind: 'wall' | 'desk'
  zoneId: string
  deskId?: string
  position: Vec3
  rotationY: number
  size: Vec2
  viewDistance?: number
}

export interface LevelDesk {
  id: string
  position: Vec2
  rotationY: number
  screenId: string
}

export interface LevelWall {
  from: Vec2
  to: Vec2
  material?: 'wall' | 'glass'
  doors?: { at: number; width: number }[]
}

export interface LevelFurniture {
  type: 'chair' | 'meeting_table' | 'cafe_table' | 'coffee_table' | 'sofa' | 'counter' | 'plant' | 'stage'
  position: Vec2
  rotationY?: number
  size?: Vec2
}

export interface Level {
  version: number
  name: string
  glb: string | null
  bounds: { min: Vec2; max: Vec2 }
  spawn: { position: Vec2; rotationY: number }
  wallHeight: number
  wallThickness: number
  palette: Record<string, string>
  zones: LevelZone[]
  walls: LevelWall[]
  desks: LevelDesk[]
  screens: LevelScreen[]
  furniture: LevelFurniture[]
}

export const level = raw as unknown as Level

/** First zone (in file order) whose AABB contains the point; mirrors Office.Level.zone_at/3. */
export function zoneAt(lvl: Level, x: number, z: number): LevelZone | null {
  for (const zone of lvl.zones) {
    if (x >= zone.min[0] && x <= zone.max[0] && z >= zone.min[1] && z <= zone.max[1]) return zone
  }
  return null
}

const zoneById = new Map(level.zones.map((z) => [z.id, z]))
const screenById = new Map(level.screens.map((s) => [s.id, s]))
const deskById = new Map(level.desks.map((d) => [d.id, d]))

export const getZone = (id: string | null | undefined) => (id ? zoneById.get(id) : undefined)
export const getScreen = (id: string) => screenById.get(id)
export const getDesk = (id: string) => deskById.get(id)

/** Local (x, z) offset rotated by rotY about +Y, same convention as three.js rotation.y. */
export function rotateXZ(lx: number, lz: number, rotY: number): Vec2 {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  return [lx * c + lz * s, -lx * s + lz * c]
}
