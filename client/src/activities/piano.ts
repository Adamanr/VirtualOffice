import { burst } from '../fx/particles'
import { pianoNote } from '../fx/sfx'
import { getProp, propPoint } from '../lib/level'
import { remotes } from '../net/remotes'
import { local } from '../store/local'
import { usePlayers } from '../store/players'

export { HIGH, isBlack, KEYMAP, keyLayout, LOW } from './pianoLayout'

/** Keys currently held down on each piano: `${propId}:${midi}` → until (performance.now). */
export const pressed = new Map<string, number>()

/** Plays a note on a piano for everyone who hears it: sound, key press, a ♪ over the player. */
export function playNote(midi: number, propId: string, playerId: string | null) {
  const prop = getProp(propId)
  if (!prop) return
  pianoNote(midi, [prop.x, 1.2, prop.z])
  pressed.set(`${propId}:${midi}`, performance.now() + 220)
  const self = usePlayers.getState().selfId
  const who = playerId === self ? local.position : playerId ? remotes.get(playerId)?.pose : undefined
  const [px, , pz] = who ? [who.x, 0, who.z] : propPoint(prop, 0, 0, 0.8)
  burst('note', [px, 1.9, pz], 1, { colors: [NOTE_COLORS[midi % NOTE_COLORS.length]!] })
}

const NOTE_COLORS = ['#ffd84a', '#ff8fb1', '#8fd3ff', '#a0f0a0', '#ffffff', '#d7a8ff']
