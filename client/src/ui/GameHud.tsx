import { useEffect, useState } from 'react'
import { collectDarts, leaveActivity, sendNote } from '../activities/games'
import { isBlack, KEYMAP } from '../activities/pianoLayout'
import { useActivity } from '../store/activity'

const NAMES = ['До', 'До#', 'Ре', 'Ре#', 'Ми', 'Фа', 'Фа#', 'Соль', 'Соль#', 'Ля', 'Ля#', 'Си']
const LABEL_BY_OFFSET = Object.fromEntries(Object.entries(KEYMAP).map(([code, off]) => [off, code.replace('Key', '').replace('Semicolon', ';').replace('Quote', "'").replace('BracketRight', ']')]))

/** On-screen keyboard (2 octaves) + computer keys, for whoever sits at the piano. */
function PianoPanel({ propId }: { propId: string }) {
  const [octave, setOctave] = useState(4) // C4 = MIDI 60
  const [down, setDown] = useState<Set<number>>(new Set())
  const base = 12 * (octave + 1)

  useEffect(() => {
    const held = new Set<string>()
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Escape') return leaveActivity()
      if (e.code === 'KeyZ') return setOctave((o) => Math.max(2, o - 1))
      if (e.code === 'KeyX') return setOctave((o) => Math.min(6, o + 1))
      const off = KEYMAP[e.code]
      if (off === undefined || held.has(e.code)) return
      e.preventDefault()
      held.add(e.code)
      const midi = base + off
      if (midi > 96) return
      sendNote(propId, midi)
      setDown((s) => new Set(s).add(midi))
    }
    const ku = (e: KeyboardEvent) => {
      held.delete(e.code)
      const off = KEYMAP[e.code]
      if (off !== undefined)
        setDown((s) => {
          const n = new Set(s)
          n.delete(base + off)
          return n
        })
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [base, propId])

  const keys: { midi: number; off: number }[] = []
  for (let off = 0; off <= 24; off++) keys.push({ midi: base + off, off })
  const whites = keys.filter((k) => !isBlack(k.midi))
  const press = (midi: number) => midi <= 96 && sendNote(propId, midi)
  return (
    <div className="panel game-hud">
      <div className="row">
        🎹 <strong>Пианино</strong>
        <span className="muted">— все рядом слышат. Клавиши A…' (белые) и W E T Y U O P (чёрные), Z/X — октава ({octave})</span>
        <button className="btn small" onClick={leaveActivity}>
          Встать (Esc)
        </button>
      </div>
      <div className="piano-keys">
        {whites.map((k) => (
          <div key={k.midi} className={`piano-white${down.has(k.midi) ? ' down' : ''}`} onPointerDown={() => press(k.midi)} title={`${NAMES[k.midi % 12]}${Math.floor(k.midi / 12) - 1}`}>
            {LABEL_BY_OFFSET[k.off] ?? ''}
          </div>
        ))}
        {keys
          .filter((k) => isBlack(k.midi))
          .map((k) => {
            const leftWhites = whites.filter((w) => w.midi < k.midi).length
            return (
              <div
                key={k.midi}
                className={`piano-black${down.has(k.midi) ? ' down' : ''}`}
                style={{ left: leftWhites * 34 - 11 }}
                onPointerDown={() => press(k.midi)}
              >
                {LABEL_BY_OFFSET[k.off] ?? ''}
              </div>
            )
          })}
      </div>
    </div>
  )
}

/** Controls for the game the local player is in. */
export function GameHud() {
  const mode = useActivity((s) => s.mode)
  if (!mode) return null
  if (mode.kind === 'piano') return <PianoPanel propId={mode.propId} />
  if (mode.kind === 'pong')
    return (
      <div className="panel game-hud">
        <div>
          🏓 Двигайте ракетку <kbd>мышью</kbd> или <kbd>A</kbd>/<kbd>D</kbd> · до 11 очков
        </div>
        <button className="btn small" onClick={leaveActivity}>
          Отойти от стола (Esc)
        </button>
      </div>
    )
  return (
    <div className="panel game-hud">
      <div>
        🎯 Наведите прицел и <kbd>кликните</kbd> — дротик полетит. Руки дрожат — ловите момент!
      </div>
      <div className="row">
        <button className="btn small" onClick={() => collectDarts(mode.propId)}>
          Собрать дротики
        </button>
        <button className="btn small" onClick={leaveActivity}>
          Уйти (Esc)
        </button>
      </div>
    </div>
  )
}
