import { Html } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { useMedia } from '../store/media'
import { usePlayers } from '../store/players'

export const EMOJI = ['👍', '😂', '❤️', '👏', '✋'] as const
const REACTION_MS = 3500

/** Name, speaking ring, mute icon and the latest emoji reaction above a player's head. */
export function Nameplate({ id }: { id: string }) {
  const player = usePlayers((s) => s.players[id])
  const reaction = usePlayers((s) => s.reactions[id])
  const speaking = useMedia((s) => s.speaking[id] ?? false)
  const [, force] = useState(0)

  useEffect(() => {
    if (!reaction) return
    const left = reaction.at + REACTION_MS - Date.now()
    const timer = setTimeout(() => force((n) => n + 1), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [reaction])

  if (!player) return null
  const showReaction = reaction && Date.now() - reaction.at < REACTION_MS
  return (
    <Html position={[0, 2.05, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="nameplate">
        {showReaction && <div className="nameplate-reaction">{EMOJI[reaction.emoji - 1]}</div>}
        <div className={`nameplate-tag${speaking && !player.muted ? ' speaking' : ''}`}>
          <span className="nameplate-dot" style={{ background: player.color }} />
          <span className="nameplate-name">{player.name}</span>
          {player.muted && (
            <span className="nameplate-muted" title="Микрофон выключен">
              <MicOffIcon />
            </span>
          )}
        </div>
      </div>
    </Html>
  )
}

export function MicOffIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.7-1.3" />
      <path d="M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11.1 5.7M12 19v3M3 3l18 18" />
    </svg>
  )
}
