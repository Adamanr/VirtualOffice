/**
 * What a character looks like: skin, hair, face, clothes, build. Travels as a
 * compact string (join params, Presence, `set_look`) so every client builds
 * the same figure: `1|skin|hair|hairColor|beard|glasses|top|topColor|
 * accentColor|bottom|bottomColor|shoes|build|height` (colors without '#').
 */

export const HAIR_STYLES = ['short', 'side', 'buzz', 'long', 'bun', 'ponytail', 'curly', 'bald'] as const
export const BEARDS = ['none', 'stubble', 'mustache', 'beard'] as const
export const GLASSES = ['none', 'round', 'square'] as const
export const TOPS = ['shirt', 'tie', 'blazer', 'sweater', 'tshirt', 'blouse'] as const
export const BOTTOMS = ['pants', 'skirt', 'shorts'] as const

export type HairStyle = (typeof HAIR_STYLES)[number]
export type Beard = (typeof BEARDS)[number]
export type Glasses = (typeof GLASSES)[number]
export type Top = (typeof TOPS)[number]
export type Bottom = (typeof BOTTOMS)[number]

export interface Look {
  skin: string
  hair: HairStyle
  hairColor: string
  beard: Beard
  glasses: Glasses
  top: Top
  topColor: string
  /** Tie, the shirt under a blazer, a sweater's collar. */
  accentColor: string
  bottom: Bottom
  bottomColor: string
  shoes: string
  /** Shoulder/waist width: 0.85 (slim) … 1.2 (stocky). */
  build: number
  /** 0.9 … 1.1 of the standard 1.75 m. */
  height: number
}

export const SKIN_TONES = ['#f7d7c4', '#eec1a0', '#d9a07a', '#b97a52', '#8d5a3b', '#5e3b26']
export const HAIR_COLORS = ['#1c1714', '#3b2619', '#6b4428', '#a8733f', '#d9b36c', '#b5471f', '#8b8b8b', '#e8e4dc']
export const CLOTH_COLORS = [
  '#ffffff', '#dfe7f2', '#9fb7d6', '#2f4a73', '#1f2a44', '#3a3f47', '#6d6f73', '#111317',
  '#6b8f5e', '#2f5d50', '#c9b18a', '#8a6a4a', '#7a2e2e', '#c0392b', '#e8a33d', '#8e4ec6',
]

export const HAIR_LABELS: Record<HairStyle, string> = {
  short: 'Короткая',
  side: 'Пробор',
  buzz: 'Ёжик',
  long: 'Длинные',
  bun: 'Пучок',
  ponytail: 'Хвост',
  curly: 'Кудри',
  bald: 'Лысина',
}
export const BEARD_LABELS: Record<Beard, string> = { none: 'Нет', stubble: 'Щетина', mustache: 'Усы', beard: 'Борода' }
export const GLASSES_LABELS: Record<Glasses, string> = { none: 'Нет', round: 'Круглые', square: 'Квадратные' }
export const TOP_LABELS: Record<Top, string> = {
  shirt: 'Рубашка',
  tie: 'Рубашка и галстук',
  blazer: 'Пиджак',
  sweater: 'Свитер',
  tshirt: 'Футболка',
  blouse: 'Блузка',
}
export const BOTTOM_LABELS: Record<Bottom, string> = { pants: 'Брюки', skirt: 'Юбка', shorts: 'Шорты' }

const HEX = /^#[0-9a-f]{6}$/

const color = (v: string | undefined, fallback: string) => {
  const c = v ? `#${v.toLowerCase()}` : ''
  return HEX.test(c) ? c : fallback
}
const pick = <T extends string>(list: readonly T[], v: string | undefined, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback
const range = (v: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(v) / 100
  return Number.isFinite(n) && v !== '' && v !== undefined ? Math.min(max, Math.max(min, n)) : fallback
}

export const DEFAULT_LOOK: Look = {
  skin: SKIN_TONES[1]!,
  hair: 'short',
  hairColor: HAIR_COLORS[1]!,
  beard: 'none',
  glasses: 'none',
  top: 'tie',
  topColor: '#ffffff',
  accentColor: '#2f4a73',
  bottom: 'pants',
  bottomColor: '#3a3f47',
  shoes: '#1c1714',
  build: 1,
  height: 1,
}

export function encodeLook(l: Look): string {
  const c = (hex: string) => hex.slice(1).toLowerCase()
  return [
    1,
    c(l.skin),
    l.hair,
    c(l.hairColor),
    l.beard,
    l.glasses,
    l.top,
    c(l.topColor),
    c(l.accentColor),
    l.bottom,
    c(l.bottomColor),
    c(l.shoes),
    Math.round(l.build * 100),
    Math.round(l.height * 100),
  ].join('|')
}

/** Never throws: unknown or damaged fields fall back to `base`. */
export function decodeLook(s: string | null | undefined, base: Look = DEFAULT_LOOK): Look {
  const f = (s ?? '').split('|')
  if (f[0] !== '1') return base
  return {
    skin: color(f[1], base.skin),
    hair: pick(HAIR_STYLES, f[2], base.hair),
    hairColor: color(f[3], base.hairColor),
    beard: pick(BEARDS, f[4], base.beard),
    glasses: pick(GLASSES, f[5], base.glasses),
    top: pick(TOPS, f[6], base.top),
    topColor: color(f[7], base.topColor),
    accentColor: color(f[8], base.accentColor),
    bottom: pick(BOTTOMS, f[9], base.bottom),
    bottomColor: color(f[10], base.bottomColor),
    shoes: color(f[11], base.shoes),
    build: range(f[12], 0.85, 1.2, base.build),
    height: range(f[13], 0.9, 1.1, base.height),
  }
}

/** Small deterministic PRNG, so a look made from a player id is the same on every client. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/** A plausible office worker. With a seed (player id) it's the same everywhere. */
export function randomLook(seed?: string, shirtColor?: string): Look {
  const r = seed ? rng(seed) : Math.random
  const one = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)]!
  const hair = one(HAIR_STYLES)
  const skirt = r() < 0.25
  const hairColor = r() < 0.08 ? HAIR_COLORS[6]! : one(HAIR_COLORS.slice(0, 6))
  return {
    skin: one(SKIN_TONES),
    hair,
    hairColor,
    beard: r() < 0.3 ? one(BEARDS.slice(1)) : 'none',
    glasses: r() < 0.3 ? one(GLASSES.slice(1)) : 'none',
    top: one(TOPS),
    topColor: shirtColor ?? one(CLOTH_COLORS),
    accentColor: one(CLOTH_COLORS),
    bottom: skirt ? 'skirt' : r() < 0.1 ? 'shorts' : 'pants',
    bottomColor: one(['#1f2a44', '#3a3f47', '#111317', '#6d6f73', '#c9b18a', '#8a6a4a', '#2f4a73']),
    shoes: one(['#1c1714', '#3b2619', '#111317', '#6b4428']),
    build: 0.9 + r() * 0.25,
    height: 0.93 + r() * 0.14,
  }
}

/** A player's figure: their saved look, or one derived from their id (old clients, quick rooms). */
export function lookFor(id: string, encoded: string | null | undefined, color: string): Look {
  return decodeLook(encoded, randomLook(id, color))
}
