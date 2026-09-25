import { Canvas } from '@react-three/fiber'

export function App() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [6, 6, 6], fov: 55 }}>
      <color attach="background" args={['#cfd8e3']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 30]} />
        <meshLambertMaterial color="#d9d4cb" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry />
        <meshLambertMaterial color="#5b7c99" />
      </mesh>
    </Canvas>
  )
}
