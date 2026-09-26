import { describe, expect, it } from 'vitest'
import { modifiers, toPage, toUrl } from './input'

describe('browser input helpers', () => {
  it('builds the CDP modifier bitmask', () => {
    expect(modifiers({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: true })).toBe(10)
    expect(modifiers({ altKey: true, ctrlKey: false, metaKey: true, shiftKey: false })).toBe(5)
  })

  it('maps a pointer over the displayed canvas to page pixels', () => {
    const el = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 640, height: 400 }) } as unknown as HTMLElement
    expect(toPage({ clientX: 420, clientY: 250 }, el)).toEqual({ x: 640, y: 400 })
    expect(toPage({ clientX: 100, clientY: 50 }, el)).toEqual({ x: 0, y: 0 })
  })

  it('turns typed addresses into URLs and words into a search', () => {
    expect(toUrl('github.com')).toBe('https://github.com')
    expect(toUrl('http://example.com/a')).toBe('http://example.com/a')
    expect(toUrl('как сварить кофе')).toMatch(/^https:\/\/duckduckgo\.com\/\?q=/)
    expect(toUrl('  ')).toBeNull()
  })
})
