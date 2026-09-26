import { describe, expect, it } from 'vitest'
import { decodeLook, DEFAULT_LOOK, encodeLook, lookFor, randomLook } from './look'

describe('look', () => {
  it('round-trips through the wire format', () => {
    const look = randomLook('player-1')
    expect(decodeLook(encodeLook(look))).toEqual({ ...look, build: Math.round(look.build * 100) / 100, height: Math.round(look.height * 100) / 100 })
  })

  it('keeps the wire format short and server-safe', () => {
    const s = encodeLook(randomLook('x'))
    expect(s.length).toBeLessThan(120)
    expect(s).toMatch(/^[0-9a-z|]+$/)
  })

  it('falls back field by field on damaged input', () => {
    const s = encodeLook(DEFAULT_LOOK).split('|')
    s[2] = 'mullet'
    s[3] = 'zzzzzz'
    s[12] = '999'
    const look = decodeLook(s.join('|'))
    expect(look.hair).toBe(DEFAULT_LOOK.hair)
    expect(look.hairColor).toBe(DEFAULT_LOOK.hairColor)
    expect(look.build).toBe(1.2)
    expect(decodeLook('garbage')).toEqual(DEFAULT_LOOK)
    expect(decodeLook(undefined)).toEqual(DEFAULT_LOOK)
  })

  it('derives the same figure from a player id on every client', () => {
    expect(lookFor('abc', null, '#4f8cff')).toEqual(lookFor('abc', undefined, '#4f8cff'))
    expect(lookFor('abc', null, '#4f8cff').topColor).toBe('#4f8cff')
    expect(randomLook('abc')).not.toEqual(randomLook('abd'))
  })
})
