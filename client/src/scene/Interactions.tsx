import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { onKey } from '../input/keyboard'
import { canSeeScreen } from '../lib/audio'
import { deskSeat, getDesk, level, zoneAt } from '../lib/level'
import { openOverlay } from '../screens/actions'
import { sit, standUp } from '../screens/desks'
import { sameTarget, useGame, type Target } from '../store/game'
import { local } from '../store/local'
import { useScreens } from '../store/screens'

const DESK_RANGE = 1.3
const INTERVAL = 0.1

/** Finds what the player can interact with (E) and handles E / F / Esc. */
export function Interactions() {
  const acc = useRef(0)

  useEffect(() => {
    const offs = [
      onKey('KeyE', () => {
        const { target, menuOpen, seat } = useGame.getState()
        if (!target) return
        if (target.kind === 'desk' && !seat) sit(target.deskId)
        else useGame.setState({ menuOpen: !menuOpen })
      }),
      onKey('KeyF', () => {
        const { overlay, states } = useScreens.getState()
        if (overlay) return useScreens.setState({ overlay: null })
        const { target, seat } = useGame.getState()
        const id = target?.kind === 'screen' ? target.screenId : seat ? getDesk(seat)?.screenId : null
        if (id && states[id]) openOverlay(id)
      }),
      onKey('Escape', () => {
        if (useScreens.getState().overlay) useScreens.setState({ overlay: null })
        else if (useGame.getState().menuOpen) useGame.setState({ menuOpen: false })
        else if (useGame.getState().seat) standUp()
      }),
      // Walking away from a desk stands up.
      ...['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((code) =>
        onKey(code, () => {
          if (useGame.getState().seat && !useGame.getState().menuOpen) standUp()
        }),
      ),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < INTERVAL) return
    acc.current = 0
    const next = findTarget()
    const { target } = useGame.getState()
    if (!sameTarget(target, next)) useGame.setState({ target: next, menuOpen: false })
    updateVisibleScreens()
  })

  return null
}

function findTarget(): Target | null {
  const { x, z } = local.position
  const seat = useGame.getState().seat
  if (seat) return { kind: 'desk', deskId: seat }

  let best: Target | null = null
  let bestD = DESK_RANGE
  for (const desk of level.desks) {
    const s = deskSeat(desk)
    const d = Math.hypot(s.x - x, s.z - z)
    if (d < bestD) {
      bestD = d
      best = { kind: 'desk', deskId: desk.id }
    }
  }
  if (best) return best

  const zone = zoneAt(level, x, z)?.id
  let nearest = Infinity
  for (const screen of level.screens) {
    if (screen.kind !== 'wall' || screen.zoneId !== zone) continue
    const d = Math.hypot(screen.position[0] - x, screen.position[2] - z)
    if (d < nearest) {
      nearest = d
      best = { kind: 'screen', screenId: screen.id }
    }
  }
  return best
}

function updateVisibleScreens() {
  const { x, z } = local.position
  const me = { x, z, zoneId: zoneAt(level, x, z)?.id ?? null }
  const { states, visible } = useScreens.getState()
  const next: Record<string, boolean> = {}
  for (const id of Object.keys(states)) {
    const screen = level.screens.find((s) => s.id === id)
    if (screen && canSeeScreen(me, screen)) next[id] = true
  }
  const a = Object.keys(visible)
  const b = Object.keys(next)
  if (a.length !== b.length || b.some((id) => !visible[id])) useScreens.setState({ visible: next })
}
