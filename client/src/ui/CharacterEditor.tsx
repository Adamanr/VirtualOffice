import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { blockKeyboard } from '../input/keyboard'
import { AVATARS, avatarPortrait, decodeLook, encodeLook, randomLook, type Look } from '../lib/look'
import { sendLook } from '../net/session'
import { useProfile } from '../store/profile'
import { Avatar } from '../scene/Avatar'

type Drag = { x: number; rot: number } | null

function Turntable({ look, walking, drag, spin }: { look: Look; walking: boolean; drag: RefObject<Drag>; spin: RefObject<THREE.Group | null> }) {
  const idle = useRef(true)
  useFrame((_, dt) => {
    if (drag.current) idle.current = false
    if (spin.current && idle.current && !drag.current) spin.current.rotation.y += dt * 0.35
  })
  return (
    <group ref={spin} rotation-y={0.5}>
      <Suspense fallback={null}>
        <Avatar look={look} getAnim={() => (walking ? Anim.walk : Anim.idle)} />
      </Suspense>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
        <circleGeometry args={[0.55, 40]} />
        <meshLambertMaterial color="#2a3140" />
      </mesh>
    </group>
  )
}

/** The character on a turntable: drag to turn, it walks when asked to. */
function Preview({ look, walking }: { look: Look; walking: boolean }) {
  const spin = useRef<THREE.Group>(null)
  const drag = useRef<Drag>(null)
  return (
    <Canvas
      className="char-preview"
      dpr={[1, 2]}
      flat
      camera={{ fov: 30, position: [0, 1.05, 3.9] }}
      onCreated={({ camera }) => camera.lookAt(0, 0.92, 0)}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, rot: spin.current?.rotation.y ?? 0 }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (drag.current && spin.current) spin.current.rotation.y = drag.current.rot + (e.clientX - drag.current.x) * 0.012
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <hemisphereLight args={['#ffffff', '#8a7f70', 1.7]} />
      <directionalLight position={[2, 4, 3]} intensity={1.3} />
      <Turntable look={look} walking={walking} drag={drag} spin={spin} />
    </Canvas>
  )
}

/**
 * Character editor. Changes apply at once: saved in the profile and, inside
 * an office, shown to everyone (debounced `set_look`).
 */
export function CharacterDialog({ onClose }: { onClose: () => void }) {
  const encoded = useProfile((s) => s.look)
  const update = useProfile((s) => s.update)
  const look = useMemo(() => decodeLook(encoded), [encoded])
  const [walking, setWalking] = useState(false)

  // WASD, arrows on sliders etc. must not walk the character behind the dialog.
  useEffect(() => blockKeyboard(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Everyone else sees the change a moment later (sliders fire a lot).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const set = (patch: Partial<Look>) => {
    const next = encodeLook({ ...look, ...patch })
    update({ look: next })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => sendLook(next), 250)
  }
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        sendLook(useProfile.getState().look)
      }
    },
    [],
  )

  // A portal: the lobby is a <form>, and Enter on a slider mustn't submit it.
  return createPortal(
    <div className="char-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card char-dialog" role="dialog" aria-label="Персонаж">
        <div className="row">
          <h2 className="grow">Персонаж</h2>
          <button type="button" className="btn ghost small" onClick={onClose} title="Готово (Esc)">
            ✕
          </button>
        </div>
        <div className="char-layout">
          <div className="char-left">
            <Preview look={look} walking={walking} />
            <div className="row char-preview-tools">
              <button type="button" className={`btn small${walking ? ' primary' : ''}`} onClick={() => setWalking((w) => !w)}>
                {walking ? '⏸ Стоять' : '🚶 Походка'}
              </button>
              <button type="button" className="btn small" onClick={() => set(randomLook())} title="Случайная внешность">
                🎲 Случайно
              </button>
            </div>
          </div>
          <div className="char-right">
            <div className="field">
              <span>Кто вы в офисе</span>
              <div className="people">
                {AVATARS.map((a) => (
                  <button type="button" key={a.id} className={`person${a.id === look.avatar ? ' active' : ''}`} onClick={() => set({ avatar: a.id })} title={a.label}>
                    <img src={avatarPortrait(a.id)} alt="" loading="lazy" />
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Рост · {Math.round(100 * look.height)}% от обычного</span>
              <input type="range" min={0.9} max={1.1} step={0.01} value={look.height} onChange={(e) => set({ height: Number(e.target.value) })} />
            </label>
          </div>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>,
    document.body,
  )
}
