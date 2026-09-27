/**
 * Who a player looks like: one of the office people (realistic rigged models
 * from Microsoft Rocketbox, see shared/tools/rocketbox) and their height.
 * Travels as a compact string (join params, Presence, `set_look`):
 * `2|<avatar>|<height×100>`.
 */

export type Gender = 'm' | 'f'

export interface AvatarInfo {
  id: string
  gender: Gender
  label: string
}

/** The models in client/public/avatars (<id>.glb, <id>.webp portrait). */
export const AVATARS: readonly AvatarInfo[] = [
  { id: 'bm1', gender: 'm', label: 'Чёрный костюм, красный галстук' },
  { id: 'bm2', gender: 'm', label: 'Тёмно-синий костюм' },
  { id: 'bm3', gender: 'm', label: 'Костюм, мятный галстук' },
  { id: 'bm4', gender: 'm', label: 'Жилет, рубашка' },
  { id: 'am1', gender: 'm', label: 'Поло в полоску' },
  { id: 'am2', gender: 'm', label: 'Твидовый пиджак' },
  { id: 'bf1', gender: 'f', label: 'Чёрный жакет' },
  { id: 'bf2', gender: 'f', label: 'Бордовый жакет, очки' },
  { id: 'bf3', gender: 'f', label: 'Бежевый жакет' },
  { id: 'bf4', gender: 'f', label: 'Жакет в полоску' },
  { id: 'af1', gender: 'f', label: 'Розовая рубашка' },
  { id: 'af2', gender: 'f', label: 'Сиреневый сарафан' },
]

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]))

export const avatarInfo = (id: string): AvatarInfo => BY_ID.get(id) ?? AVATARS[0]!
export const avatarUrl = (id: string) => `/avatars/${avatarInfo(id).id}.glb`
export const avatarPortrait = (id: string) => `/avatars/${avatarInfo(id).id}.webp`
export const animsUrl = (gender: Gender) => `/avatars/anims_${gender}.glb`

export interface Look {
  avatar: string
  /** 0.9 … 1.1 of the model's own height. */
  height: number
}

export const DEFAULT_LOOK: Look = { avatar: 'bm1', height: 1 }

export function encodeLook(l: Look): string {
  return `2|${avatarInfo(l.avatar).id}|${Math.round(l.height * 100)}`
}

/** Never throws: an unknown or old-format look falls back to `base`. */
export function decodeLook(s: string | null | undefined, base: Look = DEFAULT_LOOK): Look {
  const f = (s ?? '').split('|')
  if (f[0] !== '2' || !BY_ID.has(f[1] ?? '')) return base
  const h = Number(f[2]) / 100
  return { avatar: f[1]!, height: Number.isFinite(h) && f[2] ? Math.min(1.1, Math.max(0.9, h)) : base.height }
}

/** Small string hash, so a look derived from a player id is the same on every client. */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Someone at random (a new profile), or derived from a seed (a player id). */
export function randomLook(seed?: string): Look {
  const n = seed ? hash(seed) : Math.floor(Math.random() * 2 ** 32)
  return { avatar: AVATARS[n % AVATARS.length]!.id, height: 0.96 + ((n >>> 8) % 9) / 100 }
}

/** A player's figure: their chosen look, or one derived from their id (old clients, old profiles). */
export function lookFor(id: string, encoded: string | null | undefined): Look {
  return decodeLook(encoded, randomLook(id))
}
