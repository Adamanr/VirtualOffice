import { describe, expect, it } from 'vitest'
import { hasLine, line, vendingColor } from './jokes'

// Mirrors @outcomes in server/lib/office/props.ex.
const SERVER_OUTCOMES: Record<string, string[]> = {
  coffee_machine: ['perfect', 'no_beans', 'scald', 'boiling'],
  water_cooler: ['gossip'],
  microwave: ['popcorn', 'fish', 'forever', 'soup'],
  fridge: ['dwight_lunch', 'yogurt', 'mold', 'cake'],
  copier: ['ok', 'twss', 'jam', 'avalanche'],
  vending_machine: ['drop', 'jam', 'poke', 'unjam', 'kick'],
}

describe('prop lines', () => {
  it('has a line for every outcome the server can produce', () => {
    for (const [kind, outcomes] of Object.entries(SERVER_OUTCOMES)) {
      for (const o of outcomes) expect(hasLine(`${kind}:${o}`), `${kind}:${o}`).toBe(true)
    }
  })

  it('is deterministic for a given variant (everyone sees the same joke)', () => {
    expect(line('water_cooler:gossip', 7)).toBe(line('water_cooler:gossip', 7))
    expect(line('nope:nope', 1)).toBeNull()
  })

  it('knows wrapper colors of vending items', () => {
    expect(vendingColor('воду за цену эспрессо')).toBe('#9fd2ff')
    expect(vendingColor(null)).toMatch(/^#/)
  })
})
