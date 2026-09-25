import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Level, LevelClock, LevelSign } from '../lib/level'

const ATLAS_WIDTH = 1024

/** All signs of the level baked into one texture atlas and one merged mesh: a single draw call. */
function Signs({ signs }: { signs: LevelSign[] }) {
  const { geometry, texture } = useMemo(() => {
    // Row height in pixels keeps each sign's aspect ratio.
    const rows = signs.map((s) => Math.round((ATLAS_WIDTH * s.size[1]) / s.size[0]))
    const height = THREE.MathUtils.ceilPowerOfTwo(rows.reduce((a, b) => a + b + 4, 0))
    const canvas = document.createElement('canvas')
    canvas.width = ATLAS_WIDTH
    canvas.height = height
    const g = canvas.getContext('2d')!
    const planes: THREE.BufferGeometry[] = []
    let y = 0
    signs.forEach((sign, i) => {
      const rh = rows[i]!
      g.fillStyle = sign.bg
      g.fillRect(0, y, ATLAS_WIDTH, rh)
      g.fillStyle = sign.fg
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const main = sign.sub ? rh * 0.42 : rh * 0.62
      g.font = `700 ${Math.round(main)}px Georgia, 'Times New Roman', serif`
      fitText(g, sign.text, ATLAS_WIDTH * 0.92, main, '700', 'Georgia, serif')
      g.fillText(sign.text, ATLAS_WIDTH / 2, y + (sign.sub ? rh * 0.38 : rh / 2))
      if (sign.sub) {
        fitText(g, sign.sub, ATLAS_WIDTH * 0.9, rh * 0.18, '400', 'system-ui, sans-serif')
        g.fillText(sign.sub, ATLAS_WIDTH / 2, y + rh * 0.77)
      }

      const plane = new THREE.PlaneGeometry(sign.size[0], sign.size[1])
      const uv = plane.getAttribute('uv') as THREE.BufferAttribute
      const v0 = 1 - (y + rh) / height
      const v1 = 1 - y / height
      for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 : v0)
      const [x, py, z] = sign.position
      plane.rotateY(sign.rotationY)
      plane.translate(x + Math.sin(sign.rotationY) * 0.012, py, z + Math.cos(sign.rotationY) * 0.012)
      planes.push(plane)
      y += rh + 4
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    const geometry = planes.length ? mergeGeometries(planes) : null
    planes.forEach((p) => p.dispose())
    return { geometry, texture }
  }, [signs])

  useEffect(
    () => () => {
      geometry?.dispose()
      texture.dispose()
    },
    [geometry, texture],
  )
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial map={texture} />
    </mesh>
  )
}

function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: string, family: string) {
  let px = size
  g.font = `${weight} ${Math.round(px)}px ${family}`
  while (px > 8 && g.measureText(text).width > maxWidth) {
    px *= 0.92
    g.font = `${weight} ${Math.round(px)}px ${family}`
  }
}

const handGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/** Wall clocks with real-time hands: 12 ticks + 3 hands per clock in one InstancedMesh. */
function Clocks({ clocks }: { clocks: LevelClock[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const perClock = 15
  const acc = useRef(1)
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), qz: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1) }),
    [],
  )

  const place = (mesh: THREE.InstancedMesh, i: number, clock: LevelClock, angle: number, length: number, width: number, depth: number, offset: number, color: string) => {
    const { m, q, qz, p, s, c, up, fwd } = tmp
    q.setFromAxisAngle(up, clock.rotationY)
    qz.setFromAxisAngle(fwd, -angle)
    q.multiply(qz)
    const [x, y, z] = clock.position
    p.set(x + Math.sin(clock.rotationY) * depth, y, z + Math.cos(clock.rotationY) * depth)
    // Ticks start at `offset` from the center along the hand direction.
    p.add(new THREE.Vector3(0, offset, 0).applyQuaternion(q))
    s.set(width, length, 0.008)
    m.compose(p, q, s)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, c.set(color))
  }

  useFrame((_, dt) => {
    const mesh = ref.current
    if (!mesh) return
    acc.current += dt
    if (acc.current < 0.25) return
    acc.current = 0
    const now = new Date()
    const sec = now.getSeconds() + now.getMilliseconds() / 1000
    const min = now.getMinutes() + sec / 60
    const hour = (now.getHours() % 12) + min / 60
    clocks.forEach((clock, k) => {
      const r = clock.radius
      const base = k * perClock
      for (let t = 0; t < 12; t++) place(mesh, base + t, clock, (t / 12) * Math.PI * 2, r * (t % 3 === 0 ? 0.18 : 0.1), r * 0.05, 0.043, r * 0.78, '#1d2026')
      place(mesh, base + 12, clock, (hour / 12) * Math.PI * 2, r * 0.5, r * 0.07, 0.046, 0, '#1d2026')
      place(mesh, base + 13, clock, (min / 60) * Math.PI * 2, r * 0.75, r * 0.05, 0.05, 0, '#1d2026')
      place(mesh, base + 14, clock, (sec / 60) * Math.PI * 2, r * 0.8, r * 0.02, 0.054, -r * 0.12, '#c8322f')
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), [])
  if (clocks.length === 0) return null
  return <instancedMesh ref={ref} args={[handGeometry, material, clocks.length * perClock]} frustumCulled={false} />
}

export function Decor({ level }: { level: Level }) {
  return (
    <>
      <Signs signs={level.signs ?? []} />
      <Clocks clocks={level.clocks ?? []} />
    </>
  )
}
