import { Environment } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import { Physics } from '@react-three/rapier'
import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { useBrowsers } from '../browser/stream'
import { useScreens } from '../store/screens'
import { level } from '../lib/level'
import { CameraRig } from './CameraRig'
import { GlbLevel } from './GlbLevel'
import { LocalPlayer } from './LocalPlayer'
import { ProceduralLevel } from './ProceduralLevel'
import { DebugStats } from './DebugStats'

/** Falls back to the procedural office if the GLB fails to load. */
class LevelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('GLB level failed, using procedural level', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function World() {
  const procedural = <ProceduralLevel level={level} />
  if (!level.glb) return procedural
  return (
    <LevelBoundary fallback={procedural}>
      <Suspense fallback={null}>
        <GlbLevel url={level.glb} />
      </Suspense>
    </LevelBoundary>
  )
}

/** `?lowgfx` in the URL: no shadows or ambient occlusion (weak GPUs, software rendering). */
const LOW_GFX = new URLSearchParams(location.search).has('lowgfx')

/**
 * Office lighting: the HDRI of a real lobby for reflections and soft fill,
 * a high "ceiling" key light for contact shadows under desks, chairs and
 * people, ACES tone mapping and screen-space ambient occlusion (N8AO) that
 * grounds furniture in corners and under tables.
 */
function Lighting() {
  const [x0, z0] = level.bounds.min
  const [x1, z1] = level.bounds.max
  const half = Math.max(x1 - x0, z1 - z0) / 2 + 2
  return (
    <>
      <Environment files="/office/env.hdr" environmentIntensity={0.55} />
      <hemisphereLight args={['#fffaf2', '#8f8574', 0.55]} />
      <directionalLight
        position={[(x0 + x1) / 2 + 6, 24, (z0 + z1) / 2 + 4]}
        intensity={1.6}
        color="#fff6e8"
        castShadow={!LOW_GFX}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={60}
      >
        <object3D attach="target" position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]} />
      </directionalLight>
    </>
  )
}

/**
 * Shadows are re-rendered ~12 times a second instead of every frame: the
 * furniture never moves and people's shadows don't need 60 Hz.
 */
function ShadowCadence() {
  const gl = useThree((s) => s.gl)
  const last = useRef(0)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => void (gl.shadowMap.autoUpdate = true)
  }, [gl])
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current > 0.08) {
      last.current = clock.elapsedTime
      gl.shadowMap.needsUpdate = true
    }
  })
  return null
}

/**
 * While a full-window view covers the office (the browser / PDF window, the
 * cinema view of a fullscreen video), the 3D scene behind it is drawn at 5 fps:
 * the GPU and main thread go to the page you're looking at.
 */
function BackgroundThrottle() {
  const overlay = useScreens((s) => !!s.overlay)
  const focus = useScreens((s) => s.focus)
  const cinema = useBrowsers((s) => (focus ? !!s[focus]?.fullscreen : false))
  const setFrameloop = useThree((s) => s.setFrameloop)
  const invalidate = useThree((s) => s.invalidate)
  const hidden = overlay || cinema
  useEffect(() => {
    if (!hidden) return
    setFrameloop('demand')
    const t = setInterval(() => invalidate(), 200)
    return () => {
      clearInterval(t)
      setFrameloop('always')
    }
  }, [hidden, setFrameloop, invalidate])
  return null
}

export function Scene({ self, children }: { self?: ReactNode; children?: ReactNode }) {
  const debug = new URLSearchParams(location.search).has('debug')
  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows={LOW_GFX ? false : 'soft'}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMappingExposure: 1.05 }}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 8, 12] }}
      tabIndex={0}
    >
      <color attach="background" args={['#cdd6e0']} />
      <fog attach="fog" args={['#cdd6e0', 45, 90]} />
      <Suspense fallback={null}>
        <Lighting />
      </Suspense>
      {!LOW_GFX && <ShadowCadence />}
      <BackgroundThrottle />
      {!LOW_GFX && (
        <EffectComposer multisampling={2} enableNormalPass={false}>
          <N8AO aoRadius={0.9} intensity={2.2} distanceFalloff={0.6} halfRes quality="performance" />
        </EffectComposer>
      )}
      <Physics timeStep="vary">
        <World />
        <LocalPlayer>{self}</LocalPlayer>
        <CameraRig />
        {children}
      </Physics>
      {debug && <DebugStats />}
    </Canvas>
  )
}
