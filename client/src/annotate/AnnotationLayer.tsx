import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LASER_MS, paintLayer } from './paint'
import { laserTouched, lasersOf, screenCtx, useAnnot } from './store'

const W = 1024
const H = 640
const plane = new THREE.PlaneGeometry(1, 1)

/**
 * Drawings over a screen, in 3D for everyone in the room. A child of the
 * screen picture (a unit plane scaled to the content), so it lines up with
 * whatever is shown.
 */
export function AnnotationLayer({ screenId }: { screenId: string }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return c
  }, [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [canvas])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }), [texture])
  const drawn = useRef({ version: -1, ctx: '', laser: false })

  useEffect(
    () => () => {
      texture.dispose()
      material.dispose()
    },
    [texture, material],
  )

  useFrame(() => {
    const { version, strokes, settings } = useAnnot.getState()
    const ctx = screenCtx(screenId)
    const now = performance.now()
    const laser = now - laserTouched.at < LASER_MS + 200
    const d = drawn.current
    // Redraw on changes, and every frame only while a laser pointer is moving.
    if (d.version === version && d.ctx === ctx && !laser && !d.laser) return
    d.version = version
    d.ctx = ctx
    d.laser = laser
    paintLayer(canvas.getContext('2d')!, W, H, strokes[screenId] ?? [], settings[screenId], lasersOf(screenId), ctx, now)
    texture.needsUpdate = true
  })

  return <mesh geometry={plane} material={material} position-z={0.001} renderOrder={1} />
}
