import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { ScreenSource } from '../scene/Screens'
import { browserStream } from './stream'

/** Live texture of the shared browser on a screen (while it's visible to us). */
export function useBrowserSource(screenId: string, enabled: boolean): ScreenSource | null {
  const stream = useMemo(() => browserStream(screenId), [screenId])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(stream.canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    t.generateMipmaps = false
    t.anisotropy = 4
    return t
  }, [stream])
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!enabled) return
    stream.acquire()
    let size = stream.resized
    const off = stream.onFrame(() => {
      // A new frame size needs a new GPU texture (three.js allocates it immutably).
      if (stream.resized !== size) {
        size = stream.resized
        texture.dispose()
      }
      texture.needsUpdate = true
      setLive(true)
    })
    return () => {
      off()
      stream.release()
    }
  }, [enabled, stream, texture])

  useEffect(() => () => texture.dispose(), [texture])
  if (!enabled || !live) return null
  return { texture, width: () => stream.canvas.width, height: () => stream.canvas.height }
}
