import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { Anim } from '@shared/protocol.gen'
import { blockKeyboard } from '../input/keyboard'
import {
  BEARD_LABELS,
  BEARDS,
  BOTTOM_LABELS,
  BOTTOMS,
  CLOTH_COLORS,
  decodeLook,
  encodeLook,
  GLASSES,
  GLASSES_LABELS,
  HAIR_COLORS,
  HAIR_LABELS,
  HAIR_STYLES,
  randomLook,
  SKIN_TONES,
  TOP_LABELS,
  TOPS,
  type Look,
} from '../lib/look'
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
      <Avatar look={look} getAnim={() => (walking ? Anim.walk : Anim.idle)} />
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
      camera={{ fov: 28, position: [0, 1.15, 3.3] }}
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

function Swatches({ colors, value, onChange, custom = true }: { colors: readonly string[]; value: string; onChange: (c: string) => void; custom?: boolean }) {
  return (
    <div className="swatches small">
      {colors.map((c) => (
        <button type="button" key={c} className={`swatch${value === c ? ' active' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
      {custom && (
        <label className={`swatch custom${colors.includes(value) ? '' : ' active'}`} title="Свой цвет" style={colors.includes(value) ? undefined : { background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      )}
    </div>
  )
}

function Choice<T extends string>({ options, labels, value, onChange }: { options: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className={`chip${o === value ? ' active' : ''}`} onClick={() => onChange(o)}>
          {labels[o]}
        </button>
      ))}
    </div>
  )
}

type Tab = 'face' | 'clothes' | 'body'

/**
 * Character editor. Changes apply at once: saved in the profile and, inside
 * an office, shown to everyone (debounced `set_look`).
 */
export function CharacterDialog({ onClose }: { onClose: () => void }) {
  const encoded = useProfile((s) => s.look)
  const update = useProfile((s) => s.update)
  const look = useMemo(() => decodeLook(encoded), [encoded])
  const [tab, setTab] = useState<Tab>('face')
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
              <button type="button" className="btn small" onClick={() => set(randomLook(undefined, look.topColor))} title="Случайная внешность">
                🎲 Случайно
              </button>
            </div>
          </div>
          <div className="char-right">
            <div className="tabs">
              {(
                [
                  ['face', 'Лицо и волосы'],
                  ['clothes', 'Одежда'],
                  ['body', 'Фигура'],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button type="button" key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'face' && (
              <>
                <div className="field">
                  <span>Кожа</span>
                  <Swatches colors={SKIN_TONES} value={look.skin} onChange={(skin) => set({ skin })} />
                </div>
                <div className="field">
                  <span>Причёска</span>
                  <Choice options={HAIR_STYLES} labels={HAIR_LABELS} value={look.hair} onChange={(hair) => set({ hair })} />
                </div>
                <div className="field">
                  <span>Цвет волос</span>
                  <Swatches colors={HAIR_COLORS} value={look.hairColor} onChange={(hairColor) => set({ hairColor })} />
                </div>
                <div className="field">
                  <span>Борода</span>
                  <Choice options={BEARDS} labels={BEARD_LABELS} value={look.beard} onChange={(beard) => set({ beard })} />
                </div>
                <div className="field">
                  <span>Очки</span>
                  <Choice options={GLASSES} labels={GLASSES_LABELS} value={look.glasses} onChange={(glasses) => set({ glasses })} />
                </div>
              </>
            )}
            {tab === 'clothes' && (
              <>
                <div className="field">
                  <span>Верх</span>
                  <Choice options={TOPS} labels={TOP_LABELS} value={look.top} onChange={(top) => set({ top })} />
                </div>
                <div className="field">
                  <span>{look.top === 'blazer' ? 'Пиджак' : 'Цвет'}</span>
                  <Swatches colors={CLOTH_COLORS} value={look.topColor} onChange={(topColor) => set({ topColor })} />
                </div>
                {look.top !== 'shirt' && look.top !== 'tshirt' && (
                  <div className="field">
                    <span>{{ tie: 'Галстук', blazer: 'Рубашка', sweater: 'Воротник', blouse: 'Отделка' }[look.top as 'tie']}</span>
                    <Swatches colors={CLOTH_COLORS} value={look.accentColor} onChange={(accentColor) => set({ accentColor })} />
                  </div>
                )}
                <div className="field">
                  <span>Низ</span>
                  <Choice options={BOTTOMS} labels={BOTTOM_LABELS} value={look.bottom} onChange={(bottom) => set({ bottom })} />
                  <Swatches colors={CLOTH_COLORS} value={look.bottomColor} onChange={(bottomColor) => set({ bottomColor })} />
                </div>
                <div className="field">
                  <span>Обувь</span>
                  <Swatches colors={['#1c1714', '#3b2619', '#6b4428', '#111317', '#ffffff', '#7a2e2e']} value={look.shoes} onChange={(shoes) => set({ shoes })} />
                </div>
              </>
            )}
            {tab === 'body' && (
              <>
                <label className="field">
                  <span>Рост · {Math.round(175 * look.height)} см</span>
                  <input type="range" min={0.9} max={1.1} step={0.01} value={look.height} onChange={(e) => set({ height: Number(e.target.value) })} />
                </label>
                <label className="field">
                  <span>Телосложение</span>
                  <input type="range" min={0.85} max={1.2} step={0.01} value={look.build} onChange={(e) => set({ build: Number(e.target.value) })} />
                </label>
              </>
            )}
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
