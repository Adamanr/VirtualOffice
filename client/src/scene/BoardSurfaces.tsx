import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { BoardStroke, Sticker } from '@shared/protocol.gen'
import { props, type Prop } from '../lib/level'
import { useProps } from '../store/props'

const plane = new THREE.PlaneGeometry(1, 1)
const EMPTY_STROKES: BoardStroke[] = []
const EMPTY_STICKERS: Sticker[] = []

/** Live whiteboard / bulletin content drawn in the 3D office. */
export function BoardSurfaces() {
  return (
    <>
      {props
        .filter((p) => p.kind === 'whiteboard' || p.kind === 'bulletin_board')
        .map((p) =>
          p.kind === 'whiteboard' ? <WhiteboardSurface key={p.id} prop={p} /> : <BulletinSurface key={p.id} prop={p} />,
        )}
    </>
  )
}

function WhiteboardSurface({ prop }: { prop: Prop }) {
  const strokes = useProps((s) => s.strokes[prop.id] ?? EMPTY_STROKES)
  const texture = useBoardTexture(prop, strokes)
  const [w, h] = prop.size
  const nx = Math.sin(prop.rotY) * 0.035
  const nz = Math.cos(prop.rotY) * 0.035
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }), [])
  useEffect(() => {
    material.map = texture
    material.needsUpdate = true
  }, [material, texture])
  useEffect(() => () => material.dispose(), [material])
  if (!texture) return null
  return (
    <mesh
      geometry={plane}
      material={material}
      position={[prop.x + nx, prop.elevation, prop.z + nz]}
      rotation-y={prop.rotY}
      scale={[w * 0.98, h * 0.98, 1]}
    />
  )
}

function useBoardTexture(prop: Prop, strokes: BoardStroke[]) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = Math.round(1024 * (prop.size[1] / prop.size[0]))
    canvas.current = c
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    setTex(t)
    return () => t.dispose()
  }, [prop.id, prop.size])

  useEffect(() => {
    const c = canvas.current
    const t = tex
    if (!c || !t) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    for (const s of strokes) {
      if (s.points.length < 4) continue
      g.strokeStyle = s.color
      g.lineWidth = Math.max(2, s.width * Math.min(c.width, c.height))
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath()
      g.moveTo(s.points[0]! * c.width, s.points[1]! * c.height)
      for (let i = 2; i < s.points.length; i += 2) g.lineTo(s.points[i]! * c.width, s.points[i + 1]! * c.height)
      g.stroke()
    }
    t.needsUpdate = true
  }, [strokes, tex])

  return tex
}

function BulletinSurface({ prop }: { prop: Prop }) {
  const stickers = useProps((s) => s.stickers[prop.id] ?? EMPTY_STICKERS)
  return (
    <>
      {stickers.map((s) => (
        <StickerPlane key={s.id} prop={prop} sticker={s} />
      ))}
    </>
  )
}

function StickerPlane({ prop, sticker }: { prop: Prop; sticker: Sticker }) {
  const [map, setMap] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    let alive = true
    loader.load(
      sticker.url,
      (t) => {
        if (!alive) {
          t.dispose()
          return
        }
        t.colorSpace = THREE.SRGBColorSpace
        setMap(t)
      },
      undefined,
      () => {},
    )
    return () => {
      alive = false
      setMap((m) => {
        m?.dispose()
        return null
      })
    }
  }, [sticker.url])

  const [w, h] = prop.size
  const lx = (sticker.x - 0.5) * w
  const ly = (0.5 - sticker.y) * h
  const nx = Math.sin(prop.rotY)
  const nz = Math.cos(prop.rotY)
  const ox = prop.x + nx * 0.04
  const oz = prop.z + nz * 0.04
  const wx = ox + Math.cos(prop.rotY) * lx
  const wz = oz - Math.sin(prop.rotY) * lx
  const wy = prop.elevation + ly

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, side: THREE.DoubleSide }),
    [],
  )
  useEffect(() => {
    material.map = map
    material.needsUpdate = true
  }, [material, map])
  useEffect(() => () => material.dispose(), [material])

  if (!map) return null
  return (
    <mesh
      geometry={plane}
      material={material}
      position={[wx, wy, wz]}
      rotation-y={prop.rotY}
      rotation-z={(sticker.rot * Math.PI) / 180}
      scale={[0.28, 0.28, 1]}
    />
  )
}
