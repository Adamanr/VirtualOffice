import { describe, expect, it } from 'vitest'
import type { Annotation } from '@shared/protocol.gen'
import { paintLayer } from './paint'

/** A recording 2D context: enough to check what gets drawn. */
function recorder() {
  const calls: string[] = []
  const handler: ProxyHandler<object> = {
    get: (_t, prop) => (prop in state ? state[prop as string] : (...args: unknown[]) => calls.push(`${String(prop)}(${args.length})`)),
    set: (_t, prop, v) => {
      state[prop as string] = v
      return true
    },
  }
  const state: Record<string, unknown> = {}
  return { g: new Proxy({}, handler) as CanvasRenderingContext2D, calls }
}

const stroke = (ctx: string, tool: Annotation['tool'] = 'pen'): Annotation => ({
  id: '1', screenId: 's', by: 'p', ctx, tool, color: '#ff0000', width: 0.01, points: [0.1, 0.1, 0.5, 0.5],
})

describe('paintLayer', () => {
  it('only draws strokes made on the content currently shown', () => {
    const a = recorder()
    paintLayer(a.g, 100, 100, [stroke('p1')], undefined, [], 'p1', 0)
    expect(a.calls.filter((c) => c.startsWith('stroke(')).length).toBe(1)
    const b = recorder()
    paintLayer(b.g, 100, 100, [stroke('p2')], undefined, [], 'p1', 0)
    expect(b.calls.filter((c) => c.startsWith('stroke(')).length).toBe(0)
  })

  it('dims everything but the spotlight region', () => {
    const r = recorder()
    paintLayer(r.g, 100, 100, [], { screenId: 's', locked: false, spotlight: [0.2, 0.2, 0.6, 0.6], ctx: '' }, [], '', 0)
    expect(r.calls).toContain('fill(1)') // evenodd fill
  })

  it('fades laser trails after a moment', () => {
    const r = recorder()
    paintLayer(r.g, 100, 100, [], undefined, [{ color: '#f00', trail: [{ x: 0.5, y: 0.5, t: 0 }] }], '', 5000)
    expect(r.calls.filter((c) => c.startsWith('arc(')).length).toBe(0)
  })
})
