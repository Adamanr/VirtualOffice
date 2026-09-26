/**
 * Plays a shared browser tab's sound (s16le stereo PCM chunks from the
 * browser service) with a small jitter buffer, through a gain (distance ×
 * your volume) and a stereo panner (where the screen is relative to you).
 */
export const AUDIO_RATE = 24000
const LEAD = 0.12 // seconds of buffering
const MAX_BACKLOG = 0.6

let shared: AudioContext | null = null
function context(): AudioContext | null {
  try {
    shared ??= new AudioContext({ latencyHint: 'interactive' })
    if (shared.state === 'suspended') void shared.resume()
    return shared
  } catch {
    return null
  }
}

export class TabAudio {
  private gain: GainNode | null = null
  private pan: StereoPannerNode | null = null
  private next = 0
  private target = 0

  private ensure(ctx: AudioContext) {
    if (this.gain) return
    this.pan = ctx.createStereoPanner()
    this.gain = ctx.createGain()
    this.gain.gain.value = this.target
    this.gain.connect(this.pan).connect(ctx.destination)
  }

  /** Loudness 0..1 (proximity × personal volume) and pan -1..1. */
  set(volume: number, pan: number) {
    this.target = volume
    const ctx = shared
    if (!ctx || !this.gain || !this.pan) return
    this.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.08)
    this.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.08)
  }

  push(pcm: ArrayBuffer) {
    if (this.target <= 0.001) return // not audible: don't even decode
    const ctx = context()
    if (!ctx) return
    this.ensure(ctx)
    const samples = new Int16Array(pcm)
    const frames = samples.length / 2
    if (!frames) return
    const buf = ctx.createBuffer(2, frames, AUDIO_RATE)
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    for (let i = 0; i < frames; i++) {
      l[i] = samples[i * 2]! / 32768
      r[i] = samples[i * 2 + 1]! / 32768
    }
    const now = ctx.currentTime
    // Start (or restart after a gap / a too-long backlog) slightly ahead of now.
    if (this.next < now || this.next > now + MAX_BACKLOG) this.next = now + LEAD
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.gain!)
    src.start(this.next)
    this.next += buf.duration
  }

  dispose() {
    this.gain?.disconnect()
    this.pan?.disconnect()
    this.gain = this.pan = null
  }
}
