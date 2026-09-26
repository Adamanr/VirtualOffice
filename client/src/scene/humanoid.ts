import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { encodeLook, type Look } from '../lib/look'

/**
 * A low-poly office worker built from primitives. Each body segment that moves
 * on its own (torso, head, upper/lower arms and legs) is merged into one
 * vertex-colored geometry, so a whole character is 10 draw calls with one
 * shared material. Geometries are cached per look.
 *
 * Proportions for a 1.75 m person (`look.height` scales the whole figure).
 * Local axes: +Y up, +Z forward (the face).
 */
export const SKELETON = {
  hipY: 0.9,
  thigh: 0.43,
  shin: 0.42,
  /** Torso-relative (the torso pivots at the hips). */
  shoulderY: 0.47,
  neckY: 0.61,
  upperArm: 0.28,
  forearm: 0.26,
}

export const hipX = (l: Look) => 0.085 * l.build
export const shoulderX = (l: Look) => 0.185 * l.build

export type Part = 'torso' | 'head' | 'upperArmL' | 'upperArmR' | 'forearmL' | 'forearmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR'
export type Body = Record<Part, THREE.BufferGeometry>

export const avatarMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })

const sphere = new THREE.SphereGeometry(1, 18, 12)
const box = new THREE.BoxGeometry(1, 1, 1)
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 14)
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 12)

type V3 = [number, number, number]

class Builder {
  private parts: THREE.BufferGeometry[] = []
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private c = new THREE.Color()

  add(geo: THREE.BufferGeometry, color: string, pos: V3, scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]))
    g.applyMatrix4(this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale)))
    this.c.set(color)
    const n = g.attributes.position!.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors.set([this.c.r, this.c.g, this.c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.parts.push(g)
    return this
  }

  build() {
    const merged = mergeGeometries(this.parts)!
    this.parts.forEach((p) => p.dispose())
    merged.computeBoundingSphere()
    return merged
  }
}

/** Mixes two colors (k = share of `b`). */
function mix(a: string, b: string, k: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()
}
const darker = (c: string, k = 0.25) => mix(c, '#000000', k)

const LONG_SLEEVES = new Set(['shirt', 'tie', 'blazer', 'sweater', 'blouse'])

/** A body of revolution from (radius, y) pairs, closed at both ends. */
function lathe(profile: [number, number][]) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    18,
  )
}

// Waist → chest → sloping shoulders → base of the neck.
const PELVIS = lathe([[0, -0.03], [0.1, -0.025], [0.14, 0.02], [0.146, 0.08], [0.14, 0.15], [0, 0.15]])
const CHEST = lathe([[0, 0.12], [0.138, 0.12], [0.142, 0.2], [0.157, 0.29], [0.162, 0.37], [0.15, 0.43], [0.11, 0.49], [0.06, 0.53], [0, 0.545]])

function torso(l: Look) {
  const b = new Builder()
  const w = l.build
  const top = l.topColor
  const depth = 0.66
  // Hips: trousers or a skirt.
  b.add(PELVIS, l.bottomColor, [0, 0, 0], [1.1 * w, 1, depth + 0.06])
  if (l.bottom === 'skirt') {
    const skirt = new THREE.CylinderGeometry(0.15, 0.22, 0.36, 18, 1, true)
    b.add(skirt, l.bottomColor, [0, -0.11, 0], [1.1 * w, 1, 0.8])
    skirt.dispose()
  } else {
    b.add(cylinder, darker(l.bottomColor, 0.55), [0, 0.13, 0], [0.147 * 1.1 * w, 0.03, 0.147 * (depth + 0.06)])
  }
  b.add(CHEST, top, [0, 0, 0], [1.15 * w, 1, depth])
  // Shoulder caps
  for (const s of [-1, 1]) b.add(sphere, top, [s * shoulderX(l) * 0.96, SKELETON.shoulderY - 0.005, 0], [0.05, 0.046, 0.052])
  // Neck
  b.add(cylinder, l.skin, [0, 0.6, 0], [0.047, 0.12, 0.047])
  const front = 0.108 // chest surface (z) at the front
  const collar = (c: string) => {
    for (const s of [-1, 1]) b.add(box, c, [s * 0.03, 0.535, 0.045], [0.06, 0.03, 0.02], [0.4, s * 0.5, s * -0.5])
  }
  switch (l.top) {
    case 'tie':
      collar(mix(top, '#ffffff', 0.3))
      b.add(box, l.accentColor, [0, 0.5, 0.078], [0.034, 0.03, 0.02], [0.5, 0, 0])
      b.add(box, l.accentColor, [0, 0.36, front + 0.006], [0.045, 0.25, 0.01], [-0.06, 0, 0])
      b.add(box, darker(top, 0.12), [0.02, 0.24, front + 0.002], [0.006, 0.2, 0.006])
      break
    case 'shirt':
      collar(mix(top, '#ffffff', 0.3))
      b.add(box, darker(top, 0.15), [0, 0.32, front + 0.002], [0.007, 0.34, 0.006])
      for (const y of [0.2, 0.28, 0.36, 0.44]) b.add(sphere, darker(top, 0.3), [0.012, y, front + 0.004 - (y > 0.4 ? 0.01 : 0)], [0.007, 0.007, 0.004])
      break
    case 'blazer':
      // Open jacket: the shirt and tie show in a V.
      b.add(box, l.accentColor, [0, 0.42, front - 0.004], [0.09, 0.2, 0.012], [-0.15, 0, 0])
      b.add(box, darker(l.accentColor, 0.6), [0, 0.4, front + 0.004], [0.032, 0.17, 0.008], [-0.15, 0, 0])
      for (const s of [-1, 1]) b.add(box, darker(top, 0.12), [s * 0.052, 0.42, front + 0.006], [0.036, 0.21, 0.01], [-0.15, 0, s * 0.35])
      b.add(sphere, darker(top, 0.4), [0, 0.27, front + 0.006], [0.01, 0.01, 0.005])
      break
    case 'sweater':
      b.add(new THREE.TorusGeometry(0.052, 0.016, 6, 16), l.accentColor, [0, 0.54, 0.0], [1, 1, 0.9], [Math.PI / 2, 0, 0])
      b.add(cylinder, darker(top, 0.12), [0, 0.15, 0], [0.142 * 1.15 * w, 0.05, 0.142 * depth + 0.004])
      break
    case 'tshirt':
      b.add(new THREE.TorusGeometry(0.05, 0.01, 6, 16), darker(top, 0.15), [0, 0.545, 0.0], [1, 1, 0.9], [Math.PI / 2, 0, 0])
      break
    case 'blouse':
      b.add(box, l.skin, [0, 0.5, 0.07], [0.06, 0.06, 0.02], [0.6, 0, Math.PI / 4])
      b.add(new THREE.TorusGeometry(0.056, 0.012, 6, 16), l.accentColor, [0, 0.54, 0.005], [1, 1, 0.9], [Math.PI / 2 + 0.2, 0, 0])
      break
  }
  return b.build()
}

function head(l: Look) {
  const b = new Builder()
  const cy = 0.13 // skull center above the neck pivot
  const skull: V3 = [0.113, 0.132, 0.122]
  b.add(sphere, l.skin, [0, cy, 0], skull)
  // Jaw / chin
  b.add(sphere, l.skin, [0, cy - 0.06, 0.02], [0.085, 0.07, 0.09])
  for (const s of [-1, 1]) {
    b.add(sphere, darker(l.skin, 0.06), [s * 0.11, cy, -0.005], [0.018, 0.034, 0.026]) // ears
    b.add(sphere, '#ffffff', [s * 0.041, cy + 0.015, 0.104], [0.021, 0.015, 0.012]) // eye whites
    b.add(sphere, '#2a1c14', [s * 0.041, cy + 0.015, 0.113], [0.0105, 0.0105, 0.006]) // pupils
    b.add(box, darker(l.hairColor, 0.1), [s * 0.043, cy + 0.045, 0.11], [0.048, 0.011, 0.012], [0, 0, s * -0.08]) // brows
  }
  b.add(box, darker(l.skin, 0.1), [0, cy - 0.008, 0.123], [0.026, 0.045, 0.03], [-0.25, 0, 0]) // nose
  b.add(box, '#9c4f47', [0, cy - 0.058, 0.109], [0.046, 0.009, 0.012]) // mouth
  hair(b, l, cy, skull)
  beard(b, l, cy)
  glasses(b, l, cy)
  return b.build()
}

function cap(r: V3, thetaLength: number, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0) {
  const g = new THREE.SphereGeometry(1, 20, 12, phiStart, phiLength, thetaStart, thetaLength)
  g.scale(...r)
  return g
}

function hair(b: Builder, l: Look, cy: number, skull: V3) {
  const c = l.hairColor
  const grow = (k: number): V3 => [skull[0] * k, skull[1] * k, skull[2] * k]
  const addCap = (k: number, theta: number, tilt: number, dy = 0) => {
    const g = cap(grow(k), theta)
    b.add(g, c, [0, cy + dy, -0.004], [1, 1, 1], [tilt, 0, 0])
    g.dispose()
  }
  switch (l.hair) {
    case 'short':
      addCap(1.07, Math.PI * 0.52, -0.45)
      b.add(sphere, c, [0, cy + 0.085, 0.07], [0.09, 0.03, 0.05], [0.4, 0, 0])
      break
    case 'side':
      addCap(1.07, Math.PI * 0.52, -0.45)
      b.add(sphere, c, [0.03, cy + 0.1, 0.05], [0.1, 0.045, 0.085], [0.3, 0, -0.25])
      break
    case 'buzz':
      addCap(1.025, Math.PI * 0.5, -0.4)
      break
    case 'long':
      addCap(1.08, Math.PI * 0.55, -0.35)
      b.add(box, c, [0, cy - 0.06, -0.075], [0.23, 0.3, 0.07])
      for (const s of [-1, 1]) b.add(box, c, [s * 0.108, cy - 0.04, 0.0], [0.035, 0.26, 0.13])
      b.add(box, c, [0, cy + 0.1, 0.08], [0.2, 0.05, 0.04], [0.6, 0, 0])
      break
    case 'bun':
      addCap(1.06, Math.PI * 0.55, -0.4)
      b.add(sphere, c, [0, cy + 0.1, -0.1], [0.05, 0.05, 0.05])
      break
    case 'ponytail':
      addCap(1.06, Math.PI * 0.55, -0.4)
      b.add(capsule(0.035, 0.16), c, [0, cy - 0.06, -0.14], [1, 1, 1], [0.35, 0, 0])
      b.add(sphere, darker(c, 0.3), [0, cy + 0.03, -0.122], [0.03, 0.02, 0.02])
      break
    case 'curly':
      addCap(1.28, Math.PI * 0.6, -0.3, 0.015)
      for (const [x, y, z] of [[0.09, 0.08, 0.06], [-0.09, 0.08, 0.06], [0, 0.14, 0.05], [0.12, 0.0, -0.04], [-0.12, 0.0, -0.04]] as V3[])
        b.add(sphere, c, [x, cy + y, z], [0.05, 0.05, 0.05])
      break
    case 'bald':
      // A fringe over the ears, like half the Scranton branch.
      for (const s of [-1, 1]) b.add(box, c, [s * 0.1, cy + 0.01, -0.03], [0.03, 0.05, 0.12])
      b.add(box, c, [0, cy + 0.01, -0.11], [0.18, 0.05, 0.03])
      break
  }
}

function beard(b: Builder, l: Look, cy: number) {
  const c = l.hairColor
  const front = (k: number, theta0: number, theta: number) => {
    const g = cap([0.113 * k, 0.132 * k, 0.122 * k], theta, Math.PI / 2 - 1.25, 2.5, theta0)
    b.add(g, l.beard === 'stubble' ? mix(l.skin, c, 0.45) : c, [0, cy, 0])
    g.dispose()
  }
  switch (l.beard) {
    case 'stubble':
      front(1.012, Math.PI * 0.6, Math.PI * 0.32)
      break
    case 'mustache':
      b.add(box, c, [0, cy - 0.038, 0.117], [0.07, 0.018, 0.02])
      break
    case 'beard':
      front(1.06, Math.PI * 0.58, Math.PI * 0.36)
      b.add(box, c, [0, cy - 0.038, 0.12], [0.075, 0.02, 0.02])
      break
  }
}

function glasses(b: Builder, l: Look, cy: number) {
  if (l.glasses === 'none') return
  const frame = '#1b1b1f'
  const y = cy + 0.015
  const ring = l.glasses === 'round' ? new THREE.TorusGeometry(0.03, 0.005, 6, 18) : new THREE.TorusGeometry(0.038, 0.006, 4, 4)
  for (const s of [-1, 1]) {
    b.add(ring, frame, [s * 0.043, y, 0.125], [1, l.glasses === 'round' ? 1 : 0.78, 1], [0, 0, l.glasses === 'round' ? 0 : Math.PI / 4])
    b.add(box, frame, [s * 0.108, y + 0.005, 0.065], [0.006, 0.006, 0.12])
    b.add(box, frame, [s * 0.092, y + 0.005, 0.122], [0.036, 0.006, 0.006]) // hinge to the temple
  }
  b.add(box, frame, [0, y + 0.004, 0.126], [0.03, 0.006, 0.006])
  ring.dispose()
}

function upperArm(l: Look) {
  const b = new Builder()
  const sleeve = LONG_SLEEVES.has(l.top) || l.top === 'tshirt'
  b.add(capsule(0.044, 0.2), LONG_SLEEVES.has(l.top) ? l.topColor : l.skin, [0, -0.14, 0])
  if (sleeve && l.top === 'tshirt') b.add(capsule(0.054, 0.07), l.topColor, [0, -0.06, 0])
  return b.build()
}

function forearm(l: Look) {
  const b = new Builder()
  const long = LONG_SLEEVES.has(l.top)
  b.add(capsule(0.039, 0.18), long ? l.topColor : l.skin, [0, -0.11, 0])
  if (long) b.add(cylinder, l.top === 'blazer' ? l.accentColor : darker(l.topColor, 0.08), [0, -0.21, 0], [0.041, 0.03, 0.041])
  b.add(sphere, l.skin, [0, -0.27, 0.005], [0.036, 0.052, 0.026])
  b.add(sphere, l.skin, [0.03, -0.25, 0.02], [0.015, 0.03, 0.015]) // thumb (mirrored for the left hand)
  return b.build()
}

function thigh(l: Look) {
  const b = new Builder()
  const covered = l.bottom === 'pants'
  b.add(capsule(0.07, 0.3), covered ? l.bottomColor : l.skin, [0, -0.21, 0])
  if (l.bottom === 'shorts') b.add(capsule(0.083, 0.14), l.bottomColor, [0, -0.1, 0])
  return b.build()
}

function shin(l: Look) {
  const b = new Builder()
  b.add(capsule(0.052, 0.3), l.bottom === 'pants' ? l.bottomColor : l.skin, [0, -0.2, 0])
  if (l.bottom === 'pants') b.add(cylinder, darker(l.bottomColor, 0.1), [0, -0.37, 0], [0.058, 0.04, 0.058])
  b.add(box, l.shoes, [0, -0.41, 0.035], [0.1, 0.065, 0.24])
  b.add(box, darker(l.shoes, 0.4), [0, -0.44, 0.035], [0.104, 0.012, 0.245])
  return b.build()
}

const mirror = (g: THREE.BufferGeometry) => {
  const m = g.clone()
  m.scale(-1, 1, 1)
  // Mirroring flips the winding: swap two vertices of every triangle.
  const pos = m.attributes.position!
  const nor = m.attributes.normal!
  const col = m.attributes.color!
  for (let i = 0; i < pos.count; i += 3)
    for (const a of [pos, nor, col]) {
      const x = a.getX(i + 1)
      const y = a.getY(i + 1)
      const z = a.getZ(i + 1)
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2))
      a.setXYZ(i + 2, x, y, z)
    }
  return m
}

const cache = new Map<string, { body: Body; refs: number; timer: ReturnType<typeof setTimeout> | null }>()

function build(l: Look): Body {
  const armU = upperArm(l)
  const armF = forearm(l)
  const legU = thigh(l)
  const legL = shin(l)
  return {
    torso: torso(l),
    head: head(l),
    upperArmR: armU,
    upperArmL: mirror(armU),
    forearmR: armF,
    forearmL: mirror(armF),
    thighR: legU,
    thighL: legU,
    shinR: legL,
    shinL: legL,
  }
}

/**
 * Geometries for a look, shared by everyone who looks the same. Pair with
 * `releaseBody`; unused ones are freed a little later (the editor flips
 * back and forth between looks).
 */
export function acquireBody(l: Look): { key: string; body: Body } {
  const key = encodeLook(l)
  let entry = cache.get(key)
  if (!entry) cache.set(key, (entry = { body: build(l), refs: 0, timer: null }))
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  entry.refs++
  return { key, body: entry.body }
}

export function releaseBody(key: string) {
  const entry = cache.get(key)
  if (!entry || --entry.refs > 0) return
  entry.timer = setTimeout(() => {
    if (entry.refs > 0) return
    cache.delete(key)
    new Set(Object.values(entry.body)).forEach((g) => g.dispose())
  }, 20_000)
}
