/** The 3D keyboard shows C2..C7 (MIDI 36..96), like the server accepts. */
export const LOW = 36
export const HIGH = 96
const BLACK = new Set([1, 3, 6, 8, 10])
export const isBlack = (midi: number) => BLACK.has(midi % 12)

/** White keys (with their index) and black keys in the playable range. */
export function keyLayout(low = LOW, high = HIGH) {
  const whites: { midi: number; i: number }[] = []
  const blacks: { midi: number; after: number }[] = []
  for (let m = low; m <= high; m++) {
    if (isBlack(m)) blacks.push({ midi: m, after: whites.length - 1 })
    else whites.push({ midi: m, i: whites.length })
  }
  return { whites, blacks }
}

/** Computer keyboard → semitone offset within the chosen octave (two rows like a DAW). */
export const KEYMAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17, BracketRight: 18,
}
