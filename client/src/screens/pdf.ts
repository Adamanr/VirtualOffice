import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

const MAX_CACHED = 4
type LoadingTask = ReturnType<typeof getDocument>
const docs = new Map<string, LoadingTask>()

/** Loads (and caches a few) PDF documents by URL. */
export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let task = docs.get(url)
  if (task) {
    docs.delete(url)
    docs.set(url, task) // LRU bump
    return task.promise
  }
  task = getDocument({ url })
  task.promise.catch(() => docs.delete(url))
  docs.set(url, task)
  while (docs.size > MAX_CACHED) {
    const [oldUrl, oldTask] = docs.entries().next().value!
    docs.delete(oldUrl)
    void oldTask.destroy()
  }
  return task.promise
}

export async function countPages(file: File): Promise<number> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const n = doc.numPages
  void task.destroy()
  return n
}

/**
 * Renders one page into `canvas`, fitting `maxWidth` x `maxHeight` pixels.
 * Returns a cancel function; a newer render into the same canvas should cancel the old one.
 */
export function renderPage(
  url: string,
  page: number,
  canvas: HTMLCanvasElement,
  maxWidth: number,
  maxHeight: number,
  onDone: () => void,
): () => void {
  let task: RenderTask | null = null
  let cancelled = false
  void (async () => {
    try {
      const doc = await loadPdf(url)
      if (cancelled) return
      const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages))
      if (cancelled) return
      const base = p.getViewport({ scale: 1 })
      const scale = Math.min(maxWidth / base.width, maxHeight / base.height)
      const viewport = p.getViewport({ scale })
      // Render offscreen, then copy: the visible canvas never shows a half-drawn page.
      const buffer = document.createElement('canvas')
      buffer.width = Math.floor(viewport.width)
      buffer.height = Math.floor(viewport.height)
      task = p.render({ canvas: buffer, viewport, background: '#ffffff' })
      await task.promise
      if (cancelled) return
      canvas.width = buffer.width
      canvas.height = buffer.height
      canvas.getContext('2d')!.drawImage(buffer, 0, 0)
      onDone()
    } catch (e) {
      if (!cancelled && (e as { name?: string })?.name !== 'RenderingCancelledException') console.warn('PDF render failed', e)
    }
  })()
  return () => {
    cancelled = true
    task?.cancel()
  }
}

export async function uploadPdf(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/uploads', { method: 'POST', body })
  if (!res.ok) throw new Error(res.status === 413 ? 'Файл слишком большой (макс. 50 МБ)' : 'Не удалось загрузить PDF')
  const { url } = (await res.json()) as { url: string }
  return url
}
