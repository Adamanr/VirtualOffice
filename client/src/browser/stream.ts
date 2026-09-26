import { create } from 'zustand'
import { getConnection } from '../net/session'

import { VIEWPORT } from './input'
import { TabAudio } from './audio'

export { VIEWPORT }

export interface BrowserInfo {
  url: string
  title: string
  loading: boolean
  /** The page itself is in fullscreen (e.g. a video's ⛶ button). */
  fullscreen: boolean
  control: boolean
  status: 'connecting' | 'live' | 'waiting' | 'unavailable'
  error: string | null
}

export const useBrowsers = create<Record<string, BrowserInfo>>(() => ({}))

type Listener = () => void

/**
 * One WebSocket per screen showing a shared browser, shared by the 3D monitor
 * texture and the 2D overlay (ref-counted). JPEG frames are decoded into
 * `canvas`, which both of them display.
 */
class BrowserStream {
  readonly canvas = document.createElement('canvas')
  private ws: WebSocket | null = null
  private refs = 0
  private retry: number | null = null
  private listeners = new Set<Listener>()
  private decoding = false
  private pending: Blob | null = null
  private closed = false
  readonly screenId: string
  readonly audio = new TabAudio()
  /** The presenter's cursor on the page (page pixels), for everyone. */
  readonly cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }
  private audioOn = true

  constructor(screenId: string) {
    this.screenId = screenId
    this.canvas.width = VIEWPORT.width
    this.canvas.height = VIEWPORT.height
  }

  acquire() {
    this.refs++
    if (this.refs === 1) {
      this.closed = false
      void this.connect()
    }
  }

  release() {
    this.refs = Math.max(0, this.refs - 1)
    if (this.refs === 0) this.shutdown()
  }

  onFrame(l: Listener) {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN && useBrowsers.getState()[this.screenId]?.control) this.ws.send(JSON.stringify(msg))
  }

  /** Turns this tab's sound on/off for us only (muted viewers get no audio at all). */
  setAudioEnabled(on: boolean) {
    if (on === this.audioOn) return
    this.audioOn = on
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'audio', on }))
  }

  private patch(p: Partial<BrowserInfo>) {
    useBrowsers.setState((s) => ({
      [this.screenId]: { url: '', title: '', loading: false, fullscreen: false, control: false, status: 'connecting', error: null, ...s[this.screenId], ...p },
    }))
  }

  private async connect() {
    if (this.closed) return
    const conn = getConnection()
    if (!conn) return this.later(2000)
    this.patch({ status: 'connecting' })
    let reply
    try {
      reply = await conn.request('browser_token', { screenId: this.screenId })
    } catch {
      this.patch({ status: 'waiting' })
      return this.later(3000)
    }
    if (this.closed) return
    this.patch({ control: reply.control })
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/browser/ws?token=${encodeURIComponent(reply.token)}`)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    ws.onopen = () => {
      if (!this.audioOn) ws.send(JSON.stringify({ t: 'audio', on: false }))
    }
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data) as { t: string; url?: string; title?: string; loading?: boolean; fullscreen?: boolean; message?: string; x?: number; y?: number }
          if (msg.t === 'cursor' && !useBrowsers.getState()[this.screenId]?.control) {
            this.cursor.x = msg.x ?? this.cursor.x
            this.cursor.y = msg.y ?? this.cursor.y
          }
          if (msg.t === 'info') this.patch({ url: msg.url ?? '', title: msg.title ?? '', loading: !!msg.loading, fullscreen: !!msg.fullscreen, status: 'live', error: null })
          if (msg.t === 'error') this.patch({ error: msg.message ?? 'Ошибка' })
        } catch {
          /* ignore */
        }
      } else {
        // Binary: first byte is the type — 1 = JPEG frame, 2 = PCM audio.
        const data = e.data as ArrayBuffer
        const type = new Uint8Array(data, 0, 1)[0]
        if (type === 1) this.frame(new Blob([data.slice(1)], { type: 'image/jpeg' }))
        else if (type === 2) this.audio.push(data.slice(1))
      }
    }
    ws.onclose = (e) => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.closed) return
      // 4004: the owner hasn't started it yet; 4003: service busy/unavailable.
      this.patch({ status: e.code === 4003 || e.code === 1006 ? 'unavailable' : 'waiting' })
      this.later(e.code === 4003 ? 8000 : 2500)
    }
  }

  private later(ms: number) {
    if (this.retry) window.clearTimeout(this.retry)
    this.retry = window.setTimeout(() => {
      this.retry = null
      void this.connect()
    }, ms)
  }

  // Decode the newest frame only; frames arriving mid-decode replace each other.
  private frame(blob: Blob) {
    if (this.decoding) {
      this.pending = blob
      return
    }
    this.decoding = true
    createImageBitmap(blob)
      .then((bmp) => {
        this.canvas.getContext('2d')!.drawImage(bmp, 0, 0, this.canvas.width, this.canvas.height)
        bmp.close()
        this.listeners.forEach((l) => l())
        this.patch({ status: 'live' })
      })
      .catch(() => {})
      .finally(() => {
        this.decoding = false
        const next = this.pending
        this.pending = null
        if (next) this.frame(next)
      })
  }

  /** New claim on the screen: drop the old tab's picture and reconnect with a fresh token. */
  restart() {
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.canvas.getContext('2d')!.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (this.refs > 0 && !this.closed) void this.connect()
  }

  private shutdown() {
    this.closed = true
    this.audio.set(0, 0)
    if (this.retry) window.clearTimeout(this.retry)
    this.retry = null
    this.ws?.close()
    this.ws = null
  }
}

const streams = new Map<string, BrowserStream>()

export function browserStream(screenId: string): BrowserStream {
  let s = streams.get(screenId)
  if (!s) streams.set(screenId, (s = new BrowserStream(screenId)))
  return s
}

/** The screen's browser ended or changed hands. */
export function resetBrowserStream(screenId: string) {
  streams.get(screenId)?.restart()
  useBrowsers.setState((st) => {
    const next = { ...st }
    delete next[screenId]
    return next
  }, true)
}

/** Streams currently created (for the spatial audio loop). */
export function allStreams(): BrowserStream[] {
  return [...streams.values()]
}
