import type { PropFx } from '@shared/protocol.gen'
import { burst, emit } from '../fx/particles'
import { play } from '../fx/sfx'
import { getProp, propPoint, type Prop } from '../lib/level'
import { gesture, hold, say, setDevice, useActivity } from '../store/activity'
import { line, vendingColor } from './jokes'

const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms)

/**
 * Plays a prop outcome the server broadcast to everyone: particles, sound,
 * device state, the actor's gesture, what they end up holding, and a
 * speech bubble. Identical on every client.
 */
export function playPropFx(fx: PropFx) {
  const prop = getProp(fx.propId)
  if (!prop) return
  const by = fx.by
  const bubble = (key: string, delay = 0) => {
    const text = line(key, fx.variant)
    if (text) later(delay, () => say(by, text))
  }
  const key = `${prop.kind}:${fx.outcome}`

  switch (prop.kind) {
    case 'coffee_machine': {
      gesture(by, 'use', 1.2)
      setDevice(prop.id, 'brewing', 2.5)
      const top = propPoint(prop, 0, 1.4, 0)
      emit('puff', top, 2.4, 6, { up: 0.5, size: 0.08 })
      play('hiss', top)
      later(2400, () => {
        if (fx.outcome === 'perfect') {
          burst('star', propPoint(prop, 0, 1.3, 0.3), 6, { spread: 0.8, up: 0.8, gravity: -1, size: 0.05 })
          hold(by, 'coffee')
        } else if (fx.outcome === 'boiling') {
          hold(by, 'coffee')
        } else if (fx.outcome === 'scald') {
          gesture(by, 'hop', 0.9)
          burst('spark', propPoint(prop, 0, 1.1, 0.3), 16, { colors: ['#ff5a3c'] })
          play('bonk', top)
        } else {
          burst('dust', propPoint(prop, 0, 1.1, 0.2), 10)
        }
        bubble(key)
      })
      break
    }
    case 'water_cooler': {
      gesture(by, 'use', 1)
      setDevice(prop.id, 'glug', 1.2)
      emit('bubble', propPoint(prop, 0, 1.05, 0), 1.2, 30)
      play('glug', propPoint(prop, 0, 1, 0))
      hold(by, 'water', 30)
      bubble(key, 400)
      break
    }
    case 'microwave': {
      gesture(by, 'use', 0.8)
      setDevice(prop.id, 'running', fx.outcome === 'forever' ? 6 : 3.4)
      const door = propPoint(prop, 0, 1.1, 0.25)
      later(3400, () => {
        play('ding', door)
        if (fx.outcome === 'popcorn') {
          burst('popcorn', door, 60, { dir: frontDir(prop, 1.5) })
          play('pop', door)
          hold(by, 'popcorn')
        } else if (fx.outcome === 'fish') {
          // A green cloud hangs over the kitchen for a while. Everyone knows.
          emit('stink', door, 12, 4, { jitter: 0.6 })
        } else if (fx.outcome === 'soup') {
          burst('puff', door, 14, { up: 1 })
        }
        bubble(key)
      })
      break
    }
    case 'fridge': {
      gesture(by, 'use', 1.5)
      setDevice(prop.id, 'open', 2.2)
      emit('puff', propPoint(prop, 0, 1.0, 0.45), 1.6, 10, { up: -0.1, spread: 0.4, size: 0.1 })
      later(900, () => {
        if (fx.outcome === 'mold') {
          burst('stink', propPoint(prop, 0, 1.2, 0.5), 8)
          gesture(by, 'shiver', 1)
        } else if (fx.outcome === 'cake') hold(by, 'cake')
        else if (fx.outcome === 'yogurt') hold(by, 'yogurt')
        else if (fx.outcome === 'dwight_lunch') hold(by, 'lunch', 20)
        bubble(key)
      })
      break
    }
    case 'copier': {
      gesture(by, 'use', 1)
      const out = propPoint(prop, -0.55, 0.75, 0)
      setDevice(prop.id, 'printing', 2)
      play('printer', out)
      if (fx.outcome === 'jam') {
        later(900, () => {
          setDevice(prop.id, 'jammed', 8)
          burst('puff', propPoint(prop, 0, 1.0, 0), 10, { colors: ['#555555'] })
          burst('paper', propPoint(prop, 0, 1.0, 0.3), 3, { spread: 0.3, up: 0.8 })
          bubble(key)
        })
      } else if (fx.outcome === 'avalanche') {
        later(600, () => {
          burst('paper', out, 70, { spread: 2.2, up: 3 })
          const [x, , z] = propPoint(prop, -0.9, 0, 0.9)
          useActivity.setState((s) => ({ piles: [...s.piles.slice(-5), { id: fx.id, x, z, until: Date.now() + 90_000 }] }))
          bubble(key)
        })
      } else {
        emit('paper', out, 1.5, fx.outcome === 'twss' ? 24 : 6, { spread: 0.4, up: 1.2, dir: frontDir(prop, 0.4) })
        later(1500, () => {
          hold(by, 'paper')
          bubble(key)
        })
      }
      break
    }
    case 'vending_machine':
      vendingFx(prop, fx, bubble, key)
      break
  }
}

function vendingFx(prop: Prop, fx: PropFx, bubble: (key: string, delay?: number) => void, key: string) {
  const tray = propPoint(prop, -0.08, 0.3, 0.45)
  const color = vendingColor(fx.item)
  switch (fx.outcome) {
    case 'drop':
      gesture(fx.by, 'use', 0.8)
      play('clunk', tray)
      later(700, () => hold(fx.by, 'snack', 40, color))
      bubble(key, 700)
      break
    case 'jam':
      gesture(fx.by, 'use', 0.8)
      play('clunk', tray)
      bubble(key, 600)
      break
    case 'poke':
      gesture(fx.by, 'use', 0.6)
      bubble(key)
      break
    case 'kick':
    case 'unjam':
      gesture(fx.by, 'kick', 0.7)
      setDevice(prop.id, 'shake', 0.6)
      play('thud', tray)
      burst('dust', propPoint(prop, 0, 0.3, 0.5), 12)
      if (fx.outcome === 'unjam') {
        later(400, () => play('clunk', tray))
        later(700, () => hold(fx.by, 'snack', 40, color))
      }
      bubble(key, 300)
      break
  }
}

/** Unit vector pointing out of a prop's front, scaled. */
function frontDir(prop: Prop, speed: number): [number, number, number] {
  return [Math.sin(prop.rotY) * speed, 0, Math.cos(prop.rotY) * speed]
}
