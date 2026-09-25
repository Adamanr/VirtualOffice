import type { DrillState, Toss } from '@shared/protocol.gen'
import { burst } from '../fx/particles'
import { play, startSiren, stopSiren } from '../fx/sfx'
import { bins, getDesk, getProp, level } from '../lib/level'
import { ProtocolError } from '../net/connection'
import { clock } from '../net/remotes'
import { getConnection, onSession, syncPosition } from '../net/session'
import { gesture, say, useActivity } from '../store/activity'
import { notify, openPropOverlay, useGame } from '../store/game'
import { usePlayers } from '../store/players'
import { applyPropEvent, applyStroke, clearBoardStrokes, setBoardStickers } from '../store/props'
import { playPropFx } from './fx'
import { line, pickVendingItem } from './jokes'

onSession((c) => {
  c.on('board_stroke', ({ stroke }) => applyStroke(stroke))
  c.on('board_clear', ({ boardId }) => clearBoardStrokes(boardId))
  c.on('sticker_update', ({ boardId, stickers }) => setBoardStickers(boardId, stickers))
  c.on('prop_event', ({ prop, fx }) => {
    if (prop) applyPropEvent(prop)
    playPropFx(fx)
  })
  c.on('toss', ({ toss }) => onToss(toss))
  c.on('scores', ({ scores }) => useActivity.setState({ scores }))
  c.on('drill', ({ drill }) => onDrill(drill))
  c.on('desk_update', ({ deskId, jello, by }) => onJello(deskId, jello, by))
})

// --- appliances & vending -----------------------------------------------------------------

async function request<T>(fn: () => Promise<T>, fallback = 'Не вышло'): Promise<T | null> {
  syncPosition()
  try {
    return await fn()
  } catch (e) {
    notify(e instanceof ProtocolError ? errLabel(e.reason) : fallback)
    return null
  }
}

/** Coffee machine, water cooler, microwave, fridge, copier: the server decides what happens. */
export async function operateProp(propId: string) {
  const conn = getConnection()
  if (!conn) return
  useGame.setState({ menuOpen: false })
  await request(() => conn.request('prop_use', { propId, action: 'use' }))
}

export async function buyVending(propId: string) {
  const conn = getConnection()
  if (!conn) return
  useGame.setState({ menuOpen: false })
  await request(() => conn.request('prop_use', { propId, action: 'buy', item: pickVendingItem() }), 'Автомат молчит')
}

export async function kickVending(propId: string) {
  const conn = getConnection()
  if (!conn) return
  useGame.setState({ menuOpen: false })
  await request(() => conn.request('prop_use', { propId, action: 'kick' }), 'Автомат молчит')
}

export function openWhiteboard(propId: string) {
  openPropOverlay('whiteboard', propId)
}

export function openBulletin(propId: string) {
  openPropOverlay('bulletin', propId)
}

// --- paper basketball ---------------------------------------------------------------------

export function throwPaper(origin: [number, number, number], vel: [number, number, number]) {
  syncPosition()
  getConnection()?.send('toss', { origin, vel })
}

const MAX_LITTER = 40
const LITTER_MS = 120_000

function onToss(toss: Toss) {
  const selfId = usePlayers.getState().selfId
  gesture(toss.by, 'throw', 0.5)
  useActivity.setState((s) => {
    const now = clock.toServer(performance.now())
    const kept = s.tosses.filter((t) => now - (t.t + t.flight * 1000) < LITTER_MS).slice(-MAX_LITTER)
    return { tosses: [...kept, toss] }
  })
  // Landing effects when the ball arrives (same moment for everyone).
  const delay = Math.max(0, toss.t + toss.flight * 1000 - clock.toServer(performance.now()))
  window.setTimeout(() => {
    const [x, y, z] = toss.land as [number, number, number]
    if (toss.hit === 'bin') {
      play('swish', [x, y, z])
      burst('confetti', [x, 0.5, z], toss.points === 3 ? 60 : 24, {
        colors: ['#4f8cff', '#e5484d', '#f5a524', '#30a46c', '#ffffff'],
      })
      const binId = toss.target
      if (binId) useActivity.setState((s) => ({ devices: { ...s.devices, [binId]: { state: 'shake', until: Date.now() + 500 } } }))
      const text = line(toss.points === 3 ? 'toss:three' : 'toss:bin', Number(toss.id) || 0)
      if (text) say(toss.by, `${text} +${toss.points}`)
    } else if (toss.hit === 'player' && toss.target) {
      play('bonk', [x, y, z])
      gesture(toss.target, 'bonk', 1.2)
      burst('star', [x, y + 0.3, z], 7, { spread: 0.9, up: 0.6, gravity: 0, life: 1.4 })
      const text = line('toss:bonk', Number(toss.id) || 0)
      if (text) say(toss.target, text, 3)
      if (toss.target === selfId) notify(`В вас попал бумажный комок 😵`)
    } else {
      play('rim', [x, y, z])
    }
  }, delay)
}

/** Nearest trash bin (for the aim hint). */
export function nearestBin(x: number, z: number) {
  let best: (typeof bins)[number] | null = null
  let d = Infinity
  for (const b of bins) {
    const bd = Math.hypot(b.x - x, b.z - z)
    if (bd < d) {
      d = bd
      best = b
    }
  }
  return best ? { ...best, distance: d } : null
}

// --- fire drill ---------------------------------------------------------------------------

export async function pullAlarm(propId: string) {
  const conn = getConnection()
  if (!conn) return
  useGame.setState({ menuOpen: false })
  await request(() => conn.request('alarm_pull', { propId }))
}

let drillEndTimer: number | null = null

function onDrill(drill: DrillState) {
  const prev = useActivity.getState().drill
  useActivity.setState({ drill })
  if (drill.active && !prev?.active) {
    startSiren()
    if (drill.by) {
      gesture(drill.by, 'use', 0.6)
      const text = line('drill:pull', drill.startedAt)
      if (text) say(drill.by, text, 6)
    }
    if (drillEndTimer) window.clearTimeout(drillEndTimer)
    // Safety net if the "finished" message is missed.
    drillEndTimer = window.setTimeout(stopSiren, Math.max(0, drill.endsAt - clock.toServer(performance.now())) + 3000)
  }
  if (!drill.active && prev?.active) {
    stopSiren()
    const a = level.activities?.assembly
    if (a) burst('confetti', [a.position[0], 0.3, a.position[1]], 80, { colors: ['#e5484d', '#f5a524', '#ffffff'] })
  }
}

// --- stapler in jello ---------------------------------------------------------------------

export function prank(deskId: string) {
  syncPosition()
  getConnection()?.send('prank', { deskId })
}

function onJello(deskId: string, jello: boolean, by: string | null) {
  useActivity.setState((s) => {
    const jellos = { ...s.jellos }
    if (jello && by) jellos[deskId] = by
    else delete jellos[deskId]
    return { jellos }
  })
  const desk = getDesk(deskId)
  if (!desk) return
  const at: [number, number, number] = [desk.position[0], 0.85, desk.position[1]]
  play('splat', at)
  burst('jelly', at, jello ? 10 : 26, { spread: jello ? 0.6 : 1.4, up: jello ? 1.2 : 2.2 })
  const self = usePlayers.getState().selfId
  const actor = jello ? by : self
  if (actor) {
    const text = line(jello ? 'jello:in' : 'jello:out')
    if (text) say(actor, text, 4)
  }
}

// --- boards & stickers --------------------------------------------------------------------

export async function sendStroke(boardId: string, points: number[], color: string, width: number) {
  const conn = getConnection()
  if (!conn || points.length < 4) return
  await request(() => conn.request('board_stroke', { boardId, points, color, width }))
}

export async function clearBoard(boardId: string) {
  const conn = getConnection()
  if (!conn) return
  await request(() => conn.request('board_clear', { boardId }))
}

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/uploads', { method: 'POST', body })
  if (!res.ok) throw new Error('upload_failed')
  const { url } = (await res.json()) as { url: string }
  return url
}

export async function addSticker(boardId: string, url: string, x: number, y: number, rot = 0) {
  const conn = getConnection()
  if (!conn) return
  await request(() => conn.request('sticker_add', { boardId, url, x, y, rot }), 'Не удалось прикрепить')
}

export async function removeSticker(boardId: string, stickerId: string) {
  const conn = getConnection()
  if (!conn) return
  await request(() => conn.request('sticker_remove', { boardId, stickerId }))
}

export function propLabel(propId: string) {
  return getProp(propId)?.label ?? ''
}

function errLabel(reason: string) {
  switch (reason) {
    case 'too_far':
      return 'Подойдите ближе'
    case 'rate_limited':
      return 'Не так быстро'
    case 'unknown_prop':
      return 'Объект недоступен'
    case 'busy':
      return 'Занято — кто-то уже пользуется'
    case 'cooldown':
      return 'Тревогу недавно уже включали — сигнализация перезаряжается'
    case 'bad_payload':
      return 'Некорректные данные'
    default:
      return 'Не вышло'
  }
}
