import { useEffect, useRef, useState } from 'react'
import { aim, aimCharge } from '../activities/aim'
import { onKey } from '../input/keyboard'
import { level } from '../lib/level'
import { clock } from '../net/remotes'
import { nearestBin, prank } from '../props/actions'
import { useActivity } from '../store/activity'
import { useGame } from '../store/game'
import { local } from '../store/local'
import { usePlayers } from '../store/players'

const PRANK_RANGE = 2.0

/** Desk whose stapler can be pranked from where we stand. */
function prankDesk(): string | null {
  let best: string | null = null
  let d = PRANK_RANGE
  for (const desk of level.desks) {
    const dd = Math.hypot(desk.position[0] - local.position.x, desk.position[1] - local.position.z)
    if (dd < d) {
      d = dd
      best = desk.id
    }
  }
  return best
}

/** J near a desk: stapler in jello (or rescue it). */
export function usePrankKey() {
  useEffect(
    () =>
      onKey('KeyJ', () => {
        const desk = prankDesk()
        if (desk) prank(desk)
      }),
    [],
  )
}

/** Fire-drill banner: countdown, who's out, your time. */
function DrillBanner() {
  const drill = useActivity((s) => s.drill)
  const online = usePlayers((s) => Object.keys(s.players).length)
  const selfId = usePlayers((s) => s.selfId)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!drill?.active) return
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [drill?.active])
  if (!drill?.active) return null
  const left = Math.max(0, Math.ceil((drill.endsAt - clock.toServer(performance.now())) / 1000))
  const mine = drill.evacuated.find((e) => e.id === selfId)
  return (
    <div className="drill-banner">
      <div className="drill-title">🔥 Учебная тревога{drill.byName ? ` — ${drill.byName} дёрнул(а) рычаг` : ''}</div>
      <div>
        {mine ? (
          <>✅ Вы в безопасности за {(mine.ms / 1000).toFixed(1)} с</>
        ) : (
          <>Бегом в актовый зал, к зелёному кругу (Shift — бег) · {left} с</>
        )}
      </div>
      <div className="muted small">
        Эвакуировались: {drill.evacuated.length}/{online}
        {drill.evacuated.length > 0 && ` · первый: ${drill.evacuated[0]!.name}`}
      </div>
    </div>
  )
}

/** Power meter while holding G. */
function ChargeMeter() {
  const bar = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (wrap.current) wrap.current.style.display = aim.active ? 'flex' : 'none'
      if (aim.active && bar.current) bar.current.style.width = `${Math.round(aimCharge() * 100)}%`
      if (aim.active && hint.current) {
        const bin = nearestBin(local.position.x, local.position.z)
        hint.current.textContent = bin ? `до урны ${bin.distance.toFixed(1)} м${bin.distance >= 6 ? ' · трёхочковый!' : ''}` : ''
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div ref={wrap} className="charge" style={{ display: 'none' }}>
      <div className="charge-label">🗞️ Сила броска — отпустите G</div>
      <div className="charge-track">
        <div ref={bar} className="charge-bar" />
      </div>
      <div ref={hint} className="muted small" />
    </div>
  )
}

/** Small hint when standing near a desk. */
function PrankHint() {
  const target = useGame((s) => s.target)
  const seat = useGame((s) => s.seat)
  const jellos = useActivity((s) => s.jellos)
  const [desk, setDesk] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setDesk(seat ? null : prankDesk()), 300)
    return () => clearInterval(t)
  }, [seat])
  if (!desk || (target && target.kind !== 'seat')) return null
  return (
    <div className="prank-hint panel">
      <kbd>J</kbd> {jellos[desk] ? 'достать степлер из желе' : 'спрятать степлер в желе 😈'}
    </div>
  )
}

export function ActivityHud() {
  usePrankKey()
  return (
    <>
      <DrillBanner />
      <ChargeMeter />
      <PrankHint />
    </>
  )
}
