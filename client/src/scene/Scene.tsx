import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Component, Suspense, type ReactNode } from 'react'
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

export function Scene({ color, children }: { color: string; children?: ReactNode }) {
  const debug = new URLSearchParams(location.search).has('debug')
  return (
    <Canvas
      dpr={[1, 1.5]}
      flat
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 8, 12] }}
      tabIndex={0}
    >
      <color attach="background" args={['#cdd6e0']} />
      <fog attach="fog" args={['#cdd6e0', 45, 90]} />
      <hemisphereLight args={['#ffffff', '#b5a998', 1.6]} />
      <directionalLight position={[12, 20, 8]} intensity={1.4} />
      <Physics timeStep="vary">
        <World />
        <LocalPlayer color={color} />
        <CameraRig />
        {children}
      </Physics>
      {debug && <DebugStats />}
    </Canvas>
  )
}
