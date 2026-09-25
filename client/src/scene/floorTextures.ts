import * as THREE from 'three'
import type { FloorPattern } from '../lib/level'

/** World size (m) one texture repeat covers. */
export const FLOOR_TILE_METERS: Record<FloorPattern, number> = { carpet: 1, tiles: 0.6, wood: 2.4 }

const cache = new Map<string, THREE.CanvasTexture>()

// Deterministic noise so every client draws the same floor.
function noise(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** Procedural floor textures: office carpet tiles, break-room linoleum, hall parquet. */
export function floorTexture(pattern: FloorPattern, color: string): THREE.CanvasTexture {
  const key = `${pattern}:${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const rnd = noise(42)
  g.fillStyle = color
  g.fillRect(0, 0, size, size)

  if (pattern === 'carpet') {
    // Speckled loop pile + a faint seam: 50 cm carpet tiles, alternating direction.
    for (let i = 0; i < 9000; i++) {
      const v = rnd()
      g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.05 + rnd() * 0.08})` : `rgba(255,255,255,${0.04 + rnd() * 0.06})`
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5)
    }
    g.fillStyle = 'rgba(0,0,0,0.018)'
    g.fillRect(0, 0, size / 2, size / 2)
    g.fillRect(size / 2, size / 2, size / 2, size / 2)
    g.strokeStyle = 'rgba(0,0,0,0.06)'
    g.lineWidth = 1
    g.strokeRect(0.5, 0.5, size / 2, size / 2)
    g.strokeRect(size / 2 + 0.5, size / 2 + 0.5, size / 2, size / 2)
  } else if (pattern === 'tiles') {
    // 30 cm linoleum checkerboard with flecks.
    g.fillStyle = 'rgba(0,0,0,0.10)'
    g.fillRect(0, 0, size / 2, size / 2)
    g.fillRect(size / 2, size / 2, size / 2, size / 2)
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`
      g.fillRect(rnd() * size, rnd() * size, 1.5, 1.5)
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)'
    g.strokeRect(0.5, 0.5, size - 1, size - 1)
    g.strokeRect(0.5, 0.5, size / 2, size / 2)
  } else {
    // Parquet planks with grain.
    const planks = 8
    const ph = size / planks
    for (let p = 0; p < planks; p++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rnd() * 0.08})`
      g.fillRect(0, p * ph, size, ph)
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(60,30,10,${0.05 + rnd() * 0.08})`
        g.beginPath()
        const y = p * ph + rnd() * ph
        g.moveTo(0, y)
        g.bezierCurveTo(size * 0.3, y + (rnd() - 0.5) * 4, size * 0.6, y + (rnd() - 0.5) * 4, size, y)
        g.stroke()
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(0, p * ph, size, 1)
      const cut = ((p * 37) % planks) * (size / planks)
      g.fillRect(cut, p * ph, 1, ph)
    }
  }

  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(key, t)
  return t
}
