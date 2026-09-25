import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { PdfState } from '@shared/protocol.gen'
import { renderPage } from '../screens/pdfLazy'
import type { ScreenSource } from './Screens'

/** Renders the current PDF page into a CanvasTexture (only while `enabled`, i.e. visible to us). */
export function usePdfSource(pdf: PdfState | null | undefined, enabled: boolean, resolution: number): ScreenSource | null {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [canvas])
  const [ready, setReady] = useState<string | null>(null)

  useEffect(() => {
    if (!pdf || !enabled) return
    return renderPage(pdf.url, pdf.page, canvas, resolution, resolution, () => {
      texture.needsUpdate = true
      setReady(`${pdf.url}#${pdf.page}`)
    })
  }, [pdf, enabled, resolution, canvas, texture])

  useEffect(() => () => texture.dispose(), [texture])

  // Keep showing the previous page until the new one is drawn (no flash to black).
  if (!pdf || !enabled || !ready) return null
  return { texture, width: () => canvas.width, height: () => canvas.height }
}
