import raw from '@shared/level.json'

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export type FloorPattern = 'carpet' | 'tiles' | 'wood'

export interface LevelZone {
  id: string
  name: string
  isolated: boolean
  min: Vec2
  max: Vec2
  floorColor: string | null
  floorPattern?: FloorPattern
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
  /** Door openings; `closed` doors are drawn (and block) but look like doors. */
  doors?: { at: number; width: number; closed?: boolean }[]
  /** Ranges along the wall covered by blinds (glass walls). */
  blinds?: Vec2[]
}

export type FurnitureType =
  | 'chair'
  | 'meeting_table'
  | 'cafe_table'
  | 'coffee_table'
  | 'sofa'
  | 'counter'
  | 'plant'
  | 'stage'
  | 'cubicle'
  | 'reception_desk'
  | 'manager_desk'
  | 'conference_phone'
  | 'whiteboard'
  | 'bulletin_board'
  | 'picture'
  | 'bookshelf'
  | 'filing_cabinet'
  | 'water_cooler'
  | 'copier'
  | 'vending_machine'
  | 'fridge'
  | 'microwave'
  | 'coffee_machine'
  | 'trash_bin'
  | 'podium'
  | 'rug'
  | 'fire_alarm'

export interface LevelFurniture {
  type: FurnitureType
  position: Vec2
  rotationY?: number
  size?: Vec2
  /** Center height for wall-mounted items. */
  elevation?: number
  /** Floor offset (e.g. standing on the stage). */
  base?: number
  color?: string
}

export interface LevelWindow {
  /** Center of the pane on the inner face of the wall. */
  position: Vec3
  /** Facing into the room. */
  rotationY: number
  size: Vec2
  /** Fraction of the window covered by lowered blinds (0..1). */
  blinds: number
}

export interface LevelSign {
  text: string
  sub?: string
  position: Vec3
  rotationY: number
  size: Vec2
  bg: string
  fg: string
}

export interface LevelClock {
  position: Vec3
  rotationY: number
  radius: number
}

export interface Level {
  version: number
  name: string
  glb: string | null
  branding?: { company: string; tagline: string }
  bounds: { min: Vec2; max: Vec2 }
  floorPattern?: FloorPattern
  spawn: { position: Vec2; rotationY: number }
  wallHeight: number
  wallThickness: number
  palette: Record<string, string>
  zones: LevelZone[]
  walls: LevelWall[]
  desks: LevelDesk[]
  screens: LevelScreen[]
  furniture: LevelFurniture[]
  windows?: LevelWindow[]
  signs?: LevelSign[]
  clocks?: LevelClock[]
  activities?: {
    scoreboard?: { position: Vec3; rotationY: number; size: Vec2 }
    assembly?: { position: Vec2; radius: number }
  }
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

/** Human-readable screen name for menus and overlays. */
export function screenLabel(screen: LevelScreen): string {
  if (screen.kind === 'desk') return 'Монитор у стола'
  return `Экран: ${getZone(screen.zoneId)?.name ?? screen.zoneId}`
}

/** Where a player sits at a desk (feet position) and which way they face. */
export function deskSeat(desk: LevelDesk): { x: number; z: number; rotY: number } {
  const [dx, dz] = rotateXZ(0, -0.75, desk.rotationY)
  return { x: desk.position[0] + dx, z: desk.position[1] + dz, rotY: desk.rotationY }
}

/** Somewhere to sit: a desk chair, any chair, or a place on a sofa. */
export interface Seat {
  id: string
  kind: 'desk' | 'chair' | 'sofa'
  x: number
  z: number
  /** Facing direction while seated. */
  rotY: number
  zoneId: string | null
  /** For desk seats: the desk (its monitor is the seat's screen). */
  deskId?: string
  /** Screen to look at while seated: the desk monitor, or the room's wall screen. */
  screenId: string | null
  /** Where to stand up to (feet position). */
  exit: Vec2
}

/** Derives all seats from desks, chairs and sofas of a level. Pure, covered by tests. */
export function buildSeats(lvl: Level): Seat[] {
  const seats: Seat[] = []
  const wallScreenOf = (zoneId: string | null) => lvl.screens.find((s) => s.kind === 'wall' && s.zoneId === zoneId)?.id ?? null
  const back = (x: number, z: number, r: number, d: number): Vec2 => [x - Math.sin(r) * d, z - Math.cos(r) * d]
  for (const desk of lvl.desks) {
    const s = deskSeat(desk)
    seats.push({
      id: desk.id,
      kind: 'desk',
      ...s,
      zoneId: zoneAt(lvl, s.x, s.z)?.id ?? null,
      deskId: desk.id,
      screenId: desk.screenId,
      exit: back(s.x, s.z, s.rotY, 0.55),
    })
  }
  lvl.furniture.forEach((f, i) => {
    const [x, z] = f.position
    const r = f.rotationY ?? 0
    const zoneId = zoneAt(lvl, x, z)?.id ?? null
    if (f.type === 'chair') {
      seats.push({ id: `chair_${i}`, kind: 'chair', x, z, rotY: r, zoneId, screenId: wallScreenOf(zoneId), exit: back(x, z, r, 0.55) })
    } else if (f.type === 'sofa') {
      const [w] = f.size ?? [2, 0.9]
      const places = Math.max(1, Math.floor(w / 0.8))
      for (let k = 0; k < places; k++) {
        const lx = (k - (places - 1) / 2) * (w / places)
        // Sit toward the backrest so legs clear a coffee table in front.
        const [dx, dz] = rotateXZ(lx, -0.05, r)
        const sx = x + dx
        const sz = z + dz
        // Sofas are against walls: stand up forward into the gap before the table.
        seats.push({
          id: `sofa_${i}_${k}`,
          kind: 'sofa',
          x: sx,
          z: sz,
          rotY: r,
          zoneId,
          screenId: wallScreenOf(zoneId),
          exit: back(sx, sz, r, -1.05),
        })
      }
    }
  })
  return seats
}

export const seats = buildSeats(level)
const seatById = new Map(seats.map((s) => [s.id, s]))
export const getSeat = (id: string | null | undefined) => (id ? seatById.get(id) : undefined)

/** Furniture the player can use with E (kitchen chaos, boards, vending…). */
export type PropKind =
  | 'whiteboard'
  | 'bulletin_board'
  | 'vending_machine'
  | 'coffee_machine'
  | 'water_cooler'
  | 'microwave'
  | 'fridge'
  | 'copier'
  | 'fire_alarm'

const PROP_KINDS = new Set<FurnitureType>([
  'whiteboard',
  'bulletin_board',
  'vending_machine',
  'coffee_machine',
  'water_cooler',
  'microwave',
  'fridge',
  'copier',
  'fire_alarm',
])

export interface Prop {
  id: string
  kind: PropKind
  x: number
  z: number
  rotY: number
  zoneId: string | null
  /** Board face size [width, height] for wall-mounted props. */
  size: Vec2
  elevation: number
  range: number
  label: string
  prompt: string
}

const PROP_META: Record<PropKind, { label: string; prompt: string; range: number; defaultSize: Vec2; elevation: number }> = {
  whiteboard: { label: 'Доска', prompt: 'рисовать на доске', range: 1.6, defaultSize: [2.2, 1.1], elevation: 1.55 },
  bulletin_board: { label: 'Доска объявлений', prompt: 'прикрепить стикер', range: 1.5, defaultSize: [1.6, 1.0], elevation: 1.6 },
  vending_machine: { label: 'Автомат', prompt: 'купить что-нибудь', range: 1.4, defaultSize: [0.9, 1.9], elevation: 0.95 },
  coffee_machine: { label: 'Кофемашина', prompt: 'сварить кофе', range: 1.2, defaultSize: [0.3, 0.4], elevation: 1.15 },
  water_cooler: { label: 'Кулер', prompt: 'посплетничать', range: 1.3, defaultSize: [0.34, 1.4], elevation: 0.9 },
  microwave: { label: 'Микроволновка', prompt: 'разогреть', range: 1.2, defaultSize: [0.5, 0.3], elevation: 1.1 },
  fridge: { label: 'Холодильник', prompt: 'открыть холодильник', range: 1.3, defaultSize: [0.8, 1.9], elevation: 0.95 },
  copier: { label: 'Ксерокс', prompt: 'напечатать', range: 1.4, defaultSize: [1.0, 0.9], elevation: 0.45 },
  fire_alarm: { label: 'Пожарная тревога', prompt: 'пожарная тревога', range: 1.3, defaultSize: [0.18, 0.24], elevation: 1.35 },
}

/** Derives interactable props from furniture. Pure, covered by tests. */
export function buildProps(lvl: Level): Prop[] {
  const out: Prop[] = []
  lvl.furniture.forEach((f, i) => {
    if (!PROP_KINDS.has(f.type)) return
    const kind = f.type as PropKind
    const meta = PROP_META[kind]
    const [x, z] = f.position
    const size = f.size ?? meta.defaultSize
    out.push({
      id: `prop_${i}`,
      kind,
      x,
      z,
      rotY: f.rotationY ?? 0,
      zoneId: zoneAt(lvl, x, z)?.id ?? null,
      size,
      elevation: f.elevation ?? meta.elevation,
      range: meta.range,
      label: meta.label,
      prompt: meta.prompt,
    })
  })
  return out
}

export const props = buildProps(level)
const propById = new Map(props.map((p) => [p.id, p]))
export const getProp = (id: string | null | undefined) => (id ? propById.get(id) : undefined)

/** Trash bins: targets for paper basketball. Ids match the server (`bin_<furniture index>`). */
export const bins = level.furniture.flatMap((f, i) => (f.type === 'trash_bin' ? [{ id: `bin_${i}`, x: f.position[0], z: f.position[1] }] : []))

/** Point on a prop in world space, from a local offset (x right, y up, z forward). */
export function propPoint(p: Prop, lx: number, ly: number, lz: number): Vec3 {
  const [dx, dz] = rotateXZ(lx, lz, p.rotY)
  return [p.x + dx, ly, p.z + dz]
}
