import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

/** ?debug overlay: FPS and draw calls, to keep an eye on the 60 FPS / <200 calls budget. */
export function DebugStats() {
  const gl = useThree((s) => s.gl)
  const ref = useRef<HTMLDivElement>(null)
  const acc = useRef({ frames: 0, time: 0 })
  useFrame((_, dt) => {
    acc.current.frames++
    acc.current.time += dt
    if (acc.current.time >= 0.5 && ref.current) {
      const fps = Math.round(acc.current.frames / acc.current.time)
      const { calls, triangles } = gl.info.render
      ref.current.textContent = `${fps} fps · ${calls} draw calls · ${(triangles / 1000).toFixed(1)}k tris`
      acc.current = { frames: 0, time: 0 }
    }
  })
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div
        ref={ref}
        style={{ position: 'absolute', left: 8, bottom: 8, font: '12px monospace', background: '#000a', color: '#0f0', padding: '4px 6px' }}
      />
    </Html>
  )
}
