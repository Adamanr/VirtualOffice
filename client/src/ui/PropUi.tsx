import { useEffect, useRef, useState } from 'react'
import { getProp, getSeat } from '../lib/level'
import {
  addSticker,
  buyVending,
  clearBoard,
  kickVending,
  openBulletin,
  openWhiteboard,
  pullAlarm,
  removeSticker,
  sendStroke,
  uploadImage,
  operateProp,
} from '../props/actions'
import { closePropOverlay, notify, openPropOverlay, useGame } from '../store/game'
import { usePlayers } from '../store/players'
import { useProps } from '../store/props'
import { useActivity } from '../store/activity'
import { collectDarts, enterDarts, joinPong, sitAtPiano } from '../activities/games'
import { useScreens } from '../store/screens'
import { clock } from '../net/remotes'
import type { BoardStroke, Sticker } from '@shared/protocol.gen'

const COLORS = ['#1d4ed8', '#c8322f', '#1d2026', '#15803d', '#a16207']
const EMPTY_STROKES: BoardStroke[] = []
const EMPTY_STICKERS: Sticker[] = []

export function PropPrompt() {
  const target = useGame((s) => s.target)
  const menuOpen = useGame((s) => s.menuOpen)
  const overlay = useGame((s) => s.overlay)
  if (!target || target.kind !== 'prop' || menuOpen || overlay) return null
  const prop = getProp(target.propId)
  if (!prop) return null
  return (
    <div className="prompt panel">
      <kbd>E</kbd> {prop.prompt}
    </div>
  )
}

export function PropMenu() {
  const menuOpen = useGame((s) => s.menuOpen)
  const target = useGame((s) => s.target)
  const vending = useProps((s) => s.vending)
  const drill = useActivity((s) => s.drill)
  if (!menuOpen || !target || target.kind !== 'prop') return null
  const prop = getProp(target.propId)
  if (!prop) return null
  const vend = vending[prop.id]

  return (
    <div className="menu panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="menu-title">{prop.label}</div>
      {prop.kind === 'whiteboard' && (
        <button className="btn" onClick={() => openWhiteboard(prop.id)}>
          ✏️ Рисовать
        </button>
      )}
      {prop.kind === 'bulletin_board' && (
        <button className="btn" onClick={() => openBulletin(prop.id)}>
          📌 Стикеры и картинки
        </button>
      )}
      {prop.kind === 'vending_machine' && (
        <>
          <button className="btn" onClick={() => void buyVending(prop.id)}>
            {vend?.jammed ? '👉 Потыкать в кнопку' : '🥤 Купить наугад'}
          </button>
          <button className="btn" onClick={() => void kickVending(prop.id)}>
            🦵 {vend?.jammed ? 'Пнуть — вдруг выпадет' : 'Пнуть автомат'}
          </button>
          {vend?.jammed && <div className="muted small">В автомате застрял «{vend.lastItem}». Кто пнёт — тот и заберёт.</div>}
        </>
      )}
      {(prop.kind === 'coffee_machine' ||
        prop.kind === 'water_cooler' ||
        prop.kind === 'microwave' ||
        prop.kind === 'fridge' ||
        prop.kind === 'copier') && (
        <button className="btn" onClick={() => void operateProp(prop.id)}>
          {prop.kind === 'coffee_machine' && '☕ Сварить кофе'}
          {prop.kind === 'water_cooler' && '💧 Налить воды и посплетничать'}
          {prop.kind === 'microwave' && '📡 Разогреть обед'}
          {prop.kind === 'fridge' && '🧊 Заглянуть в холодильник'}
          {prop.kind === 'copier' && '🖨️ Напечатать'}
        </button>
      )}
      {prop.kind === 'pingpong_table' && <PongItems tableId={prop.id} />}
      {prop.kind === 'dartboard' && (
        <>
          <button className="btn" onClick={() => enterDarts(prop.id)}>
            🎯 Встать к линии и бросать
          </button>
          <button className="btn" onClick={() => collectDarts(prop.id)}>
            🧺 Собрать дротики с мишени
          </button>
        </>
      )}
      {prop.kind === 'piano' && (
        <button className="btn" onClick={() => sitAtPiano(prop.id)}>
          🎹 Сесть за пианино
        </button>
      )}
      {prop.kind === 'fire_alarm' && <AlarmItems propId={prop.id} drillActive={!!drill?.active} cooldownUntil={drill?.cooldownUntil ?? 0} />}
      <button className="btn ghost small" onClick={() => useGame.setState({ menuOpen: false })}>
        Закрыть
      </button>
    </div>
  )
}

function PongItems({ tableId }: { tableId: string }) {
  const state = useActivity((s) => s.pongs[tableId])
  const players = usePlayers((s) => s.players)
  const humans = [state?.a, state?.b].filter((x) => x && x !== 'bot') as string[]
  return (
    <>
      <div className="muted small">
        {humans.length === 0
          ? 'Стол свободен. Один — сыграете с Дуайт-ботом, вдвоём — друг с другом.'
          : humans.length === 1
            ? `Играет ${players[humans[0]!]?.name ?? '…'} против бота — займите его место!`
            : 'Стол занят — можно смотреть'}
      </div>
      <button className="btn" disabled={humans.length >= 2} onClick={() => void joinPong(tableId)}>
        🏓 {humans.length === 1 ? 'Бросить вызов' : 'Играть'}
      </button>
    </>
  )
}

function AlarmItems({ propId, drillActive, cooldownUntil }: { propId: string; drillActive: boolean; cooldownUntil: number }) {
  const wait = Math.ceil((cooldownUntil - clock.toServer(performance.now())) / 1000)
  if (drillActive) return <div className="muted small">Учения уже идут — бегом в актовый зал!</div>
  if (wait > 0) return <div className="muted small">Сигнализация перезаряжается: {wait} с</div>
  return (
    <>
      <div className="muted small">Учебная эвакуация для всего офиса: красный свет, сирена и точка сбора в актовом зале. Кто быстрее?</div>
      <button className="btn danger" onClick={() => void pullAlarm(propId)}>
        🔥 Дёрнуть рычаг
      </button>
    </>
  )
}

export function PropOverlays() {
  const overlay = useGame((s) => s.overlay)
  if (!overlay) return null
  if (overlay.kind === 'whiteboard') return <WhiteboardOverlay boardId={overlay.id} />
  if (overlay.kind === 'bulletin') return <BulletinOverlay boardId={overlay.id} />
  if (overlay.kind === 'intranet') return <IntranetOverlay />
  return null
}

function WhiteboardOverlay({ boardId }: { boardId: string }) {
  const strokes = useProps((s) => s.strokes[boardId] ?? EMPTY_STROKES)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<{ points: number[]; color: string; width: number; flushed: number; at: number } | null>(null)
  const [color, setColor] = useState(COLORS[0]!)
  const [width, setWidth] = useState(0.012)
  const prop = getProp(boardId)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const g = c.getContext('2d')!
    const W = c.width
    const H = c.height
    g.fillStyle = '#f4f1ea'
    g.fillRect(0, 0, W, H)
    for (const s of strokes) paintStroke(g, W, H, s.points, s.color, s.width)
  }, [strokes])

  const toNorm = (e: React.PointerEvent) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const
  }

  return (
    <div className="overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div className="overlay-bar panel">
        <strong>{prop?.label ?? 'Доска'}</strong>
        <div className="overlay-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch${color === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
          <button className="btn small" onClick={() => setWidth(0.008)}>
            тонко
          </button>
          <button className="btn small" onClick={() => setWidth(0.02)}>
            жирно
          </button>
          <button className="btn small danger" onClick={() => void clearBoard(boardId)}>
            Стереть всё
          </button>
          <button className="btn ghost small" onClick={closePropOverlay}>
            Esc
          </button>
        </div>
      </div>
      <div className="overlay-body">
        <canvas
          ref={canvas}
          width={1280}
          height={720}
          className="board-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const [x, y] = toNorm(e)
            drawing.current = { points: [x, y], color, width, flushed: 0, at: performance.now() }
          }}
          onPointerMove={(e) => {
            const d = drawing.current
            if (!d) return
            const [x, y] = toNorm(e)
            d.points.push(x, y)
            const c = canvas.current!
            const g = c.getContext('2d')!
            paintStroke(g, c.width, c.height, d.points.slice(-4), d.color, d.width)
            // Stream the stroke in pieces so others see it being drawn live.
            if (performance.now() - d.at > 120 && d.points.length - d.flushed >= 6) {
              const piece = d.points.slice(Math.max(0, d.flushed - 2))
              d.flushed = d.points.length
              d.at = performance.now()
              void sendStroke(boardId, downsample(piece, 64), d.color, d.width)
            }
          }}
          onPointerUp={() => {
            const d = drawing.current
            drawing.current = null
            if (!d || d.points.length < 4) return
            // Send whatever was not streamed yet (≤64 points).
            const rest = d.points.slice(Math.max(0, d.flushed - 2))
            if (rest.length >= 4) void sendStroke(boardId, downsample(rest, 64), d.color, d.width)
          }}
        />
      </div>
    </div>
  )
}

function paintStroke(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  points: number[],
  color: string,
  width: number,
) {
  if (points.length < 4) return
  g.strokeStyle = color
  g.lineWidth = Math.max(2, width * Math.min(W, H))
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(points[0]! * W, points[1]! * H)
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i]! * W, points[i + 1]! * H)
  g.stroke()
}

function downsample(points: number[], maxPts: number) {
  const n = points.length / 2
  if (n <= maxPts) return points
  const out: number[] = []
  for (let i = 0; i < maxPts; i++) {
    const idx = Math.round((i / (maxPts - 1)) * (n - 1)) * 2
    out.push(points[idx]!, points[idx + 1]!)
  }
  return out
}

function BulletinOverlay({ boardId }: { boardId: string }) {
  const stickers = useProps((s) => s.stickers[boardId] ?? EMPTY_STICKERS)
  const selfId = usePlayers((s) => s.selfId)
  const prop = getProp(boardId)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const placeFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return notify('Нужна картинка (png/jpg/webp)')
    setBusy(true)
    try {
      const url = await uploadImage(file)
      await addSticker(boardId, url, 0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 20)
    } catch {
      notify('Не удалось загрузить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div className="overlay-bar panel">
        <strong>{prop?.label ?? 'Доска объявлений'}</strong>
        <div className="overlay-tools">
          <button className="btn small" disabled={busy} onClick={() => input.current?.click()}>
            📎 Прикрепить картинку
          </button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void placeFile(f)
            }}
          />
          <button className="btn ghost small" onClick={closePropOverlay}>
            Esc
          </button>
        </div>
      </div>
      <div className="overlay-body">
        <div
          className="bulletin-board"
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
            if (f) void placeFile(f)
          }}
        >
          {stickers.length === 0 && <div className="muted">Пока пусто. Прикрепите картинку или вставьте из буфера.</div>}
          {stickers.map((s) => (
            <div
              key={s.id}
              className="bulletin-sticker"
              style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: `translate(-50%, -50%) rotate(${s.rot}deg)` }}
            >
              <img src={s.url} alt="" draggable={false} />
              {s.from === selfId && (
                <button className="sticker-x" onClick={() => void removeSticker(boardId, s.id)} title="Снять">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const INTRANET_NEWS = [
  { title: 'TPS-отчёты: новый шаблон', body: 'Пожалуйста, заполняйте поля 1–47. Поле 48 — «зачем мы здесь».' },
  { title: 'Корпоративный портал недоступен', body: 'Error 418: I\'m a teapot. IT уже в курсе (нет).' },
  { title: 'Мем недели', body: 'Картинка с котом и подписью «deadline». HR просит не репостить.' },
  { title: 'Дандер Миффлин Intranet', body: 'Сегодня в меню столовой: сюрприз. Вчера тоже был сюрприз.' },
]

export function IntranetOverlay() {
  return (
    <div className="overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div className="overlay-bar panel">
        <strong>Dunder Mifflin Intranet</strong>
        <button className="btn ghost small" onClick={closePropOverlay}>
          Esc
        </button>
      </div>
      <div className="overlay-body">
        <div className="intranet">
          <div className="intranet-hero">
            <div className="intranet-logo">📄 Дандер Миффлин</div>
            <div className="muted">Корпоративный портал · Отделение в Скрэнтоне</div>
          </div>
          {INTRANET_NEWS.map((n) => (
            <article key={n.title} className="intranet-card">
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </article>
          ))}
          <button
            className="btn"
            onClick={() => {
              notify('Форма TPS отправлена в /dev/null')
              closePropOverlay()
            }}
          >
            Отправить TPS-отчёт
          </button>
        </div>
      </div>
    </div>
  )
}

/** Menu button for desk monitors. */
export function IntranetMenuItem() {
  const seat = useGame((s) => s.seat)
  const screenId = getSeat(seat)?.screenId
  const state = useScreens((s) => (screenId ? s.states[screenId] : undefined))
  const kind = getSeat(seat)?.kind
  if (kind !== 'desk' || state) return null
  return (
    <button className="btn" onClick={() => openPropOverlay('intranet', 'intranet')}>
      🌐 Открыть intranet
    </button>
  )
}
