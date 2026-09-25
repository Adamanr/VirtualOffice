import { useEffect, useRef, useState } from 'react'
import { getDesk } from '../lib/level'
import { flipPage, pickPdf, presentPdf } from '../screens/pdfActions'
import { renderPage } from '../screens/pdfLazy'
import { notify, useGame } from '../store/game'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'

/** Crisp full-window page for the overlay, re-rendered at the overlay's pixel size. */
export function PdfOverlay({ screenId }: { screenId: string }) {
  const state = useScreens((s) => s.states[screenId])
  const selfId = usePlayers((s) => s.selfId)
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const pdf = state?.pdf

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf || !canvas.current || !size.w) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    return renderPage(pdf.url, pdf.page, canvas.current, size.w * dpr, size.h * dpr, () => {})
  }, [pdf, size])

  if (!pdf) return <div className="overlay-empty">Докладчик выбирает файл…</div>
  const mine = state.owner === selfId
  return (
    <div className="pdf-overlay">
      <div ref={box} className="pdf-canvas-box">
        <canvas ref={canvas} className="overlay-media pdf-canvas" />
      </div>
      <div className="pdf-controls">
        {mine && (
          <button className="btn" disabled={pdf.page <= 1} onClick={() => flipPage(-1)}>
            ←
          </button>
        )}
        <span>
          {pdf.page} / {pdf.pages}
        </span>
        {mine && (
          <button className="btn" disabled={pdf.page >= pdf.pages} onClick={() => flipPage(1)}>
            →
          </button>
        )}
        {!mine && <span className="muted small">листает докладчик</span>}
      </div>
    </div>
  )
}

/** Extra entries of the E-menu for PDFs. */
export function PdfMenuItems({ screenId }: { screenId: string }) {
  const state = useScreens((s) => s.states[screenId])
  return (
    <>
      <button className="btn" onClick={() => pickPdf(screenId)}>
        📄 {state?.mode === 'share' ? 'Показать PDF вместо экрана' : 'Показать PDF…'}
      </button>
      <div className="muted small">Или перетащите PDF в окно</div>
    </>
  )
}

export function PdfHint() {
  const selfId = usePlayers((s) => s.selfId)
  const presenting = useScreens((s) => Object.values(s.states).find((x) => x.owner === selfId && x.mode === 'pdf' && x.pdf))
  if (!presenting?.pdf) return null
  return (
    <div className="panel pdf-hint">
      📄 {presenting.pdf.name}: слайд {presenting.pdf.page}/{presenting.pdf.pages} · <kbd>←</kbd> <kbd>→</kbd> листать
    </div>
  )
}

/** Screen the player may drop a PDF onto: the E-target (wall screen or own desk monitor), if free or ours. */
function dropTarget(): string | null {
  const { target, seat } = useGame.getState()
  const id =
    target?.kind === 'screen' ? target.screenId : target?.kind === 'desk' && seat === target.deskId ? getDesk(seat)?.screenId : null
  if (!id) return null
  const owner = useScreens.getState().states[id]?.owner
  return !owner || owner === usePlayers.getState().selfId ? id : null
}

/** Drag & drop a PDF anywhere on the window while standing at a screen. */
export function PdfDropZone() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const overH = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const file = e.dataTransfer?.files[0]
      if (!file) return
      const screenId = dropTarget()
      if (!screenId) return notify('Подойдите к свободному экрану (или сядьте за стол), чтобы показать PDF')
      void presentPdf(screenId, file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overH)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overH)
      window.removeEventListener('drop', drop)
    }
  }, [])
  if (!over) return null
  return <div className="dropzone">{dropTarget() ? 'Отпустите, чтобы показать PDF на экране' : 'Подойдите к свободному экрану, чтобы показать PDF'}</div>
}
