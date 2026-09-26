/** The shared browser's page size (matches browser/src/input.mjs). */
export const VIEWPORT = { width: 1280, height: 800 }

/** Maps a pointer position over the displayed canvas to page coordinates. */
export function toPage(e: { clientX: number; clientY: number }, el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(((e.clientX - r.left) / r.width) * VIEWPORT.width),
    y: Math.round(((e.clientY - r.top) / r.height) * VIEWPORT.height),
  }
}

/** CDP modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8. */
export function modifiers(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
}

/** "github.com" → https://github.com/; plain words → a web search. */
export function toUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  if (/^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(text)) return `https://${text}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
}
