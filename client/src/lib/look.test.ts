import { describe, expect, it } from 'vitest'
import { AVATARS, decodeLook, DEFAULT_LOOK, encodeLook, lookFor, randomLook } from './look'

describe('look', () => {
  it('round-trips through the wire format', () => {
    const look = { avatar: 'bf3', height: 1.04 }
    expect(encodeLook(look)).toBe('2|bf3|104')
    expect(decodeLook(encodeLook(look))).toEqual(look)
  })

  it('keeps the wire format server-safe', () => {
    for (const a of AVATARS) expect(encodeLook({ avatar: a.id, height: 1 })).toMatch(/^[0-9a-z|]+$/)
  })

  it('falls back on unknown people, old formats and garbage', () => {
    expect(decodeLook('2|nobody|100')).toEqual(DEFAULT_LOOK)
    expect(decodeLook('1|eec1a0|short|3b2619')).toEqual(DEFAULT_LOOK)
    expect(decodeLook(undefined)).toEqual(DEFAULT_LOOK)
    expect(decodeLook('2|am1|999').height).toBe(1.1)
    expect(decodeLook('2|am1|').height).toBe(DEFAULT_LOOK.height)
  })

  it('derives the same person from a player id on every client', () => {
    expect(lookFor('abc', null)).toEqual(lookFor('abc', 'garbage'))
    expect(AVATARS.some((a) => a.id === randomLook('abc').avatar)).toBe(true)
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => randomLook(s).avatar)).size).toBeGreaterThan(2)
  })
})
