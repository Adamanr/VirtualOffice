import { describe, expect, it } from 'vitest'
import { isBlack, keyLayout, KEYMAP } from './pianoLayout'

describe('piano layout', () => {
  it('knows black keys', () => {
    expect(isBlack(60)).toBe(false) // C4
    expect(isBlack(61)).toBe(true) // C#4
    expect(isBlack(64)).toBe(false) // E4
  })

  it('lays out C2..C7 as 36 white and 25 black keys', () => {
    const { whites, blacks } = keyLayout()
    expect(whites).toHaveLength(36)
    expect(blacks).toHaveLength(25)
    expect(blacks[0]).toEqual({ midi: 37, after: 0 })
  })

  it('maps the home row to a chromatic octave', () => {
    expect(KEYMAP.KeyA).toBe(0)
    expect(KEYMAP.KeyK).toBe(12)
    expect(new Set(Object.values(KEYMAP)).size).toBe(Object.keys(KEYMAP).length)
  })
})
