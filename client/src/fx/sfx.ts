import { local } from '../store/local'
import type { V3 } from './particles'

/**
 * Synthesized sound effects (no audio assets). Positional in the simplest way:
 * volume falls off with distance from the local player, silent beyond ~18 m.
 */
export type Sfx = 'ding' | 'swish' | 'bonk' | 'thud' | 'splat' | 'printer' | 'pop' | 'hiss' | 'clunk' | 'glug' | 'rim'

let ctx: AudioContext | null = null
let muted = false

function audio(): AudioContext | null {
  if (muted) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function setSfxMuted(value: boolean) {
  muted = value
  if (value) stopSiren()
}

function gainFor(at?: V3): number {
  if (!at) return 1
  const d = Math.hypot(at[0] - local.position.x, at[2] - local.position.z)
  return d > 18 ? 0 : Math.max(0.08, 1 - d / 18)
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(out)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

function noise(c: AudioContext, out: AudioNode, t0: number, dur: number, vol: number, freq = 1200, q = 0.8) {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(out)
  src.start(t0)
}

export function play(name: Sfx, at?: V3) {
  const c = audio()
  const vol = gainFor(at)
  if (!c || vol <= 0) return
  const out = c.createGain()
  out.gain.value = 0.35 * vol
  out.connect(c.destination)
  const t = c.currentTime
  switch (name) {
    case 'ding':
      tone(c, out, 'sine', 1760, 1760, t, 0.9, 0.5)
      tone(c, out, 'sine', 3520, 3520, t, 0.4, 0.15)
      break
    case 'swish':
      noise(c, out, t, 0.35, 0.6, 3000, 0.6)
      break
    case 'rim':
      tone(c, out, 'triangle', 420, 380, t, 0.25, 0.6)
      break
    case 'bonk':
      tone(c, out, 'sine', 600, 140, t, 0.25, 0.9)
      break
    case 'thud':
      tone(c, out, 'sine', 120, 45, t, 0.3, 1)
      noise(c, out, t, 0.15, 0.5, 300)
      break
    case 'clunk':
      tone(c, out, 'square', 180, 90, t, 0.12, 0.3)
      tone(c, out, 'sine', 90, 60, t + 0.1, 0.2, 0.6)
      break
    case 'splat':
      noise(c, out, t, 0.25, 0.9, 500, 1.5)
      tone(c, out, 'sine', 300, 80, t, 0.2, 0.5)
      break
    case 'printer':
      for (let i = 0; i < 6; i++) noise(c, out, t + i * 0.16, 0.12, 0.35, 900 + (i % 2) * 400, 2)
      break
    case 'pop':
      for (let i = 0; i < 14; i++) tone(c, out, 'square', 900 + Math.random() * 900, 200, t + Math.random() * 1.2, 0.04, 0.25)
      break
    case 'hiss':
      noise(c, out, t, 1.4, 0.35, 5000, 0.5)
      break
    case 'glug':
      for (let i = 0; i < 3; i++) tone(c, out, 'sine', 220 + i * 40, 160, t + i * 0.22, 0.18, 0.5)
      break
  }
}

// Fire alarm: a whooping siren until stopped.
let siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null

export function startSiren() {
  const c = audio()
  if (!c || siren) return
  const osc = c.createOscillator()
  const lfo = c.createOscillator()
  const lfoGain = c.createGain()
  const gain = c.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = 750
  lfo.frequency.value = 1.6
  lfoGain.gain.value = 220
  lfo.connect(lfoGain).connect(osc.frequency)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 1800
  gain.gain.value = 0.045
  osc.connect(f).connect(gain).connect(c.destination)
  osc.start()
  lfo.start()
  siren = { osc, lfo, gain }
}

export function stopSiren() {
  if (!siren) return
  siren.osc.stop()
  siren.lfo.stop()
  siren = null
}
