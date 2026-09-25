import { onKey } from '../input/keyboard'
import { getConnection } from '../net/session'
import { notify, useGame } from '../store/game'
import { media } from '../media/media'
import { usePlayers } from '../store/players'
import { useScreens } from '../store/screens'
import { explain } from './actions'
import { countPages, uploadPdf } from './pdfLazy'

export const pdfUpload = { busy: false }

/** Claims the screen for a PDF, uploads the file, and opens it for everyone in the zone. */
export async function presentPdf(screenId: string, file: File) {
  const conn = getConnection()
  if (!conn || pdfUpload.busy) return
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    notify('Нужен файл PDF')
    return
  }
  useGame.setState({ menuOpen: false })
  pdfUpload.busy = true
  notify(`Загрузка «${file.name}»…`)
  try {
    await conn.request('screen_claim', { screenId, mode: 'pdf' })
    if (media.sharingScreenId === screenId) media.stopScreenShare()
    const [url, pages] = await Promise.all([uploadPdf(file), countPages(file)])
    await conn.request('pdf_open', { screenId, url, name: file.name, pages })
    useGame.setState({ notice: null })
  } catch (e) {
    notify(explain(e))
    const owner = useScreens.getState().states[screenId]?.owner
    if (owner === usePlayers.getState().selfId && !useScreens.getState().states[screenId]?.pdf) {
      conn.send('screen_release', { screenId })
    }
  } finally {
    pdfUpload.busy = false
  }
}

export function pickPdf(screenId: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/pdf,.pdf'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void presentPdf(screenId, file)
  }
  input.click()
}

/** The screen whose slides the local player controls right now (overlay first, then the E-target). */
export function controlledPdfScreen(): string | null {
  const self = usePlayers.getState().selfId
  const { overlay, states } = useScreens.getState()
  const target = useGame.getState().target
  const candidates = [overlay, target?.kind === 'screen' ? target.screenId : null]
  for (const id of candidates) {
    const s = id ? states[id] : undefined
    if (s && s.owner === self && s.mode === 'pdf' && s.pdf) return s.id
  }
  // Fall back to any PDF we present.
  return Object.values(states).find((s) => s.owner === self && s.mode === 'pdf' && s.pdf)?.id ?? null
}

export function flipPage(delta: number) {
  const id = controlledPdfScreen()
  const pdf = id ? useScreens.getState().states[id]?.pdf : null
  if (!id || !pdf) return
  const page = Math.min(pdf.pages, Math.max(1, pdf.page + delta))
  if (page !== pdf.page) getConnection()?.send('pdf_page', { screenId: id, page })
}

onKey('ArrowRight', () => flipPage(1))
onKey('ArrowLeft', () => flipPage(-1))
onKey('PageDown', () => flipPage(1))
onKey('PageUp', () => flipPage(-1))
