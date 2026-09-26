import * as THREE from 'three'

/**
 * Tiny particle system for prop effects (steam, paper, popcorn, stink…).
 * Plain mutable arrays stepped once per frame by <FxLayer/>; every kind is a
 * single InstancedMesh, and nothing is drawn when a kind has no live particles.
 */
export type ParticleKind = 'puff' | 'paper' | 'popcorn' | 'jelly' | 'spark' | 'star' | 'stink' | 'confetti' | 'bubble' | 'dust' | 'note'
export type V3 = [number, number, number]

export interface Particle {
  kind: ParticleKind
  p: THREE.Vector3
  v: THREE.Vector3
  life: number
  maxLife: number
  size: number
  grow: number
  rot: THREE.Euler
  spin: THREE.Vector3
  gravity: number
  drag: number
  color: THREE.Color | null
}

export interface BurstOptions {
  /** Horizontal speed spread (m/s). */
  spread?: number
  /** Upward speed (m/s), randomized ±30%. */
  up?: number
  /** Direction bias (added to velocity). */
  dir?: V3
  life?: number
  size?: number
  grow?: number
  gravity?: number
  drag?: number
  /** Random position jitter (m). */
  jitter?: number
  colors?: string[]
}

const DEFAULTS: Record<ParticleKind, Required<Omit<BurstOptions, 'dir' | 'colors'>>> = {
  puff: { spread: 0.25, up: 0.6, life: 1.6, size: 0.1, grow: 0.12, gravity: 0, drag: 1.5, jitter: 0.05 },
  paper: { spread: 1.6, up: 2.2, life: 3.5, size: 0.24, grow: 0, gravity: -3.2, drag: 1.2, jitter: 0.05 },
  popcorn: { spread: 1.8, up: 2.5, life: 2.2, size: 0.05, grow: 0, gravity: -9.8, drag: 0.4, jitter: 0.05 },
  jelly: { spread: 1.8, up: 2.2, life: 1.4, size: 0.07, grow: 0, gravity: -9.8, drag: 0.3, jitter: 0.05 },
  spark: { spread: 1.5, up: 1.5, life: 0.6, size: 0.04, grow: -0.05, gravity: -4, drag: 1, jitter: 0.03 },
  star: { spread: 0, up: 0, life: 1.5, size: 0.1, grow: 0, gravity: 0, drag: 0, jitter: 0 },
  stink: { spread: 0.3, up: 0.25, life: 5, size: 0.25, grow: 0.2, gravity: 0, drag: 0.8, jitter: 0.2 },
  confetti: { spread: 2.2, up: 3.2, life: 3, size: 0.06, grow: 0, gravity: -5, drag: 1.4, jitter: 0.1 },
  bubble: { spread: 0.03, up: 0.5, life: 0.9, size: 0.035, grow: 0.02, gravity: 0.4, drag: 0, jitter: 0.08 },
  dust: { spread: 1.2, up: 0.6, life: 1.2, size: 0.12, grow: 0.3, gravity: -0.5, drag: 2, jitter: 0.25 },
  note: { spread: 0.25, up: 0.7, life: 2.2, size: 0.22, grow: 0, gravity: 0.1, drag: 0.4, jitter: 0.15 },
}

const MAX = 900
export const particles: Particle[] = []
const color = new THREE.Color()

interface Emitter {
  kind: ParticleKind
  at: V3
  until: number
  rate: number
  acc: number
  opts: BurstOptions
}
const emitters: Emitter[] = []

const rnd = (a: number) => (Math.random() * 2 - 1) * a

export function burst(kind: ParticleKind, at: V3, count: number, opts: BurstOptions = {}) {
  const d = { ...DEFAULTS[kind], ...opts }
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX) particles.shift()
    const up = d.up * (0.7 + Math.random() * 0.6)
    const colors = opts.colors
    particles.push({
      kind,
      p: new THREE.Vector3(at[0] + rnd(d.jitter), at[1] + rnd(d.jitter), at[2] + rnd(d.jitter)),
      v: new THREE.Vector3(rnd(d.spread) + (opts.dir?.[0] ?? 0), up + (opts.dir?.[1] ?? 0), rnd(d.spread) + (opts.dir?.[2] ?? 0)),
      life: 0,
      maxLife: d.life * (0.75 + Math.random() * 0.5),
      size: d.size * (0.8 + Math.random() * 0.4),
      grow: d.grow,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3(rnd(6), rnd(6), rnd(6)),
      gravity: d.gravity,
      drag: d.drag,
      color: colors?.length ? color.set(colors[Math.floor(Math.random() * colors.length)]!).clone() : null,
    })
  }
}

/** Keeps emitting `rate` particles/s at a point for `seconds`. */
export function emit(kind: ParticleKind, at: V3, seconds: number, rate: number, opts: BurstOptions = {}) {
  emitters.push({ kind, at, until: performance.now() + seconds * 1000, rate, acc: 0, opts })
}

export function stepParticles(dt: number) {
  const now = performance.now()
  for (let i = emitters.length - 1; i >= 0; i--) {
    const e = emitters[i]!
    if (now > e.until) {
      emitters.splice(i, 1)
      continue
    }
    e.acc += e.rate * dt
    const n = Math.floor(e.acc)
    if (n > 0) {
      e.acc -= n
      burst(e.kind, e.at, n, e.opts)
    }
  }
  let w = 0
  for (const q of particles) {
    q.life += dt
    if (q.life >= q.maxLife) continue
    q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt))
    q.v.y += q.gravity * dt
    q.p.addScaledVector(q.v, dt)
    if (q.p.y < 0.02 && q.gravity < 0) {
      // Land and stay put (paper on the floor, popcorn everywhere).
      q.p.y = 0.02
      q.v.set(0, 0, 0)
      q.spin.set(0, 0, 0)
      q.rot.x = Math.PI / 2
    }
    q.rot.x += q.spin.x * dt
    q.rot.y += q.spin.y * dt
    q.rot.z += q.spin.z * dt
    q.size = Math.max(0.005, q.size + q.grow * dt)
    particles[w++] = q
  }
  particles.length = w
}
