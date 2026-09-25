/**
 * pdf.js is large (~1 MB with its worker): load it only when a PDF is shown.
 * Same API as ./pdf, but asynchronous.
 */
type PdfModule = typeof import('./pdf')
let mod: Promise<PdfModule> | null = null
const load = () => (mod ??= import('./pdf'))

export function renderPage(...args: Parameters<PdfModule['renderPage']>): () => void {
  let cancelled = false
  let cancel: (() => void) | null = null
  void load().then((m) => {
    if (!cancelled) cancel = m.renderPage(...args)
  })
  return () => {
    cancelled = true
    cancel?.()
  }
}

export const countPages = async (file: File) => (await load()).countPages(file)

export async function uploadPdf(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/uploads', { method: 'POST', body })
  if (!res.ok) throw new Error(res.status === 413 ? 'Файл слишком большой (макс. 50 МБ)' : 'Не удалось загрузить PDF')
  const { url } = (await res.json()) as { url: string }
  return url
}
