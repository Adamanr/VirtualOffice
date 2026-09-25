import { useFrame } from '@react-three/fiber'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { level, type LevelScreen } from '../lib/level'
import { openOverlay } from '../screens/actions'
import { useScreens } from '../store/screens'
import { pointerDrag } from './CameraRig'

export interface ScreenSource {
  texture: THREE.Texture
  /** Current content size in pixels (0 until known). */
  width: () => number
  height: () => number
}

/** Plays a LiveKit video track into an off-DOM <video> feeding a VideoTexture. */
export function useVideoSource(track: RemoteVideoTrack | LocalVideoTrack | undefined): ScreenSource | null {
  const [source, setSource] = useState<ScreenSource | null>(null)
  useEffect(() => {
    if (!track) {
      setSource(null)
      return
    }
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    track.attach(video)
    void video.play().catch(() => {})
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    setSource({ texture, width: () => video.videoWidth, height: () => video.videoHeight })
    return () => {
      track.detach(video)
      video.srcObject = null
      texture.dispose()
    }
  }, [track])
  return source
}

let idleTexture: THREE.CanvasTexture | null = null
function getIdleTexture() {
  if (idleTexture) return idleTexture
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 576
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 1024, 576)
  grad.addColorStop(0, '#1b2433')
  grad.addColorStop(1, '#10151e')
  g.fillStyle = grad
  g.fillRect(0, 0, 1024, 576)
  g.fillStyle = '#8fa3c0'
  g.font = '600 44px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('Экран свободен', 512, 260)
  g.font = '32px system-ui, sans-serif'
  g.fillStyle = '#6b7c96'
  g.fillText('Подойдите и нажмите E, чтобы показать экран или PDF', 512, 330)
  idleTexture = new THREE.CanvasTexture(c)
  idleTexture.colorSpace = THREE.SRGBColorSpace
  return idleTexture
}

const planeGeometry = new THREE.PlaneGeometry(1, 1)

/** A screen's live picture: letterboxed into the screen's frame, 1 cm in front of it. */
export function ScreenPicture({ screen, source }: { screen: LevelScreen; source: ScreenSource | null }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  const [w, h] = screen.size
  const [x, y, z] = screen.position
  const nx = Math.sin(screen.rotationY) * 0.012
  const nz = Math.cos(screen.rotationY) * 0.012
  const isIdle = !source && screen.kind === 'wall'
  const active = useScreens((s) => !!s.states[screen.id])

  useEffect(() => {
    material.map = source?.texture ?? (isIdle ? getIdleTexture() : null)
    material.needsUpdate = true
  }, [material, source, isIdle])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const cw = source?.width() ?? 0
    const ch = source?.height() ?? 0
    if (!cw || !ch) {
      m.scale.set(w, h, 1)
      return
    }
    const aspect = cw / ch
    if (aspect > w / h) m.scale.set(w, w / aspect, 1)
    else m.scale.set(h * aspect, h, 1)
  })

  if (!source && !isIdle) return null
  return (
    <mesh
      ref={mesh}
      geometry={planeGeometry}
      material={material}
      position={[x + nx, y, z + nz]}
      rotation-y={screen.rotationY}
      onClick={(e) => {
        e.stopPropagation()
        if (!pointerDrag.moved && active) openOverlay(screen.id)
      }}
    />
  )
}

function ScreenSurface({ screen }: { screen: LevelScreen }) {
  const state = useScreens((s) => s.states[screen.id])
  const track = useScreens((s) => s.video[screen.id])
  const video = useVideoSource(state?.mode === 'share' ? track : undefined)
  return <ScreenPicture screen={screen} source={video} />
}

export function Screens() {
  return (
    <>
      {level.screens.map((s) => (
        <ScreenSurface key={s.id} screen={s} />
      ))}
    </>
  )
}
