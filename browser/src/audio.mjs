import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Per-tab audio capture: every browser session plays into its own PulseAudio
 * (or PipeWire-pulse) null sink, and `parec` reads that sink's monitor as raw
 * PCM. Nothing reaches real speakers. Disabled gracefully if pactl/parec or a
 * sound server is missing.
 */
export const AUDIO_RATE = 24000
export const AUDIO_CHANNELS = 2

export async function createSink(name) {
  try {
    const { stdout } = await run('pactl', ['load-module', 'module-null-sink', `sink_name=${name}`, `sink_properties=device.description=Office-${name}`])
    return { name, module: stdout.trim() }
  } catch {
    return null
  }
}

export async function destroySink(sink) {
  if (!sink) return
  await run('pactl', ['unload-module', sink.module]).catch(() => {})
}

/** Streams the sink's audio as s16le stereo chunks (~40 ms each). Returns a stop function. */
export function capture(sink, onChunk) {
  const proc = spawn('parec', [
    `--device=${sink.name}.monitor`,
    '--raw',
    '--format=s16le',
    `--rate=${AUDIO_RATE}`,
    `--channels=${AUDIO_CHANNELS}`,
    '--latency-msec=40',
  ])
  proc.stdout.on('data', (buf) => {
    if (!isSilent(buf)) onChunk(buf)
  })
  proc.on('error', () => {})
  return () => proc.kill()
}

/** Skip silent chunks entirely: most pages are quiet most of the time. */
export function isSilent(buf, threshold = 24) {
  for (let i = 0; i + 1 < buf.length; i += 16) {
    const v = buf.readInt16LE(i)
    if (v > threshold || v < -threshold) return false
  }
  return true
}
