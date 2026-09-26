import { useState } from 'react'
import { getZone, level } from '../lib/level'
import { useOffice } from '../lib/offices'
import { useGame } from '../store/game'
import { usePlayers } from '../store/players'

function StatusPill() {
  const status = usePlayers((s) => s.status)
  if (status === 'online') return null
  const text = { connecting: 'Подключение…', reconnecting: 'Переподключение…', error: 'Ошибка подключения', online: '' }[status]
  return <div className={`status-pill ${status}`}>{text}</div>
}

function Roster() {
  const players = usePlayers((s) => s.players)
  const selfId = usePlayers((s) => s.selfId)
  const list = Object.values(players).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="panel roster">
      {list.map((p) => (
        <div key={p.id} className="roster-row">
          <span className="nameplate-dot" style={{ background: p.color }} />
          <span className="grow">
            {p.name}
            {p.id === selfId && <span className="muted"> (вы)</span>}
          </span>
          <span className="muted small">{getZone(p.zone)?.name ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

export function TopBar({ spaceId }: { spaceId: string }) {
  const zoneId = useGame((s) => s.zoneId)
  const online = usePlayers((s) => Object.keys(s.players).length)
  const [showRoster, setShowRoster] = useState(false)
  const zone = getZone(zoneId)
  const office = useOffice(spaceId)
  return (
    <div className="topbar">
      <div className="panel topbar-info">
        <strong title={office ? 'Сохраняемый офис: всё остаётся на месте' : undefined}>{office?.name ?? level.name}</strong>
        {office === null && (
          <span className="muted" title="Быстрая комната: ничего не сохраняется, когда все выйдут">
            · {spaceId}
          </span>
        )}
        {zone && (
          <span className={`zone-badge${zone.isolated ? ' isolated' : ''}`} title={zone.isolated ? 'Изолированная зона: слышно только тех, кто внутри' : 'Пространственный звук'}>
            {zone.name}
          </span>
        )}
        <button className="btn ghost small" onClick={() => setShowRoster((v) => !v)}>
          👥 {online}
        </button>
        <button
          className="btn ghost small"
          title="Скопировать ссылку"
          onClick={() => void navigator.clipboard?.writeText(`${location.origin}/s/${spaceId}`)}
        >
          🔗
        </button>
      </div>
      <StatusPill />
      {showRoster && <Roster />}
    </div>
  )
}

export function HelpHint() {
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <button className="btn ghost small help-toggle" onClick={() => setOpen(true)}>
        ?
      </button>
    )
  }
  return (
    <div className="panel help" onClick={() => setOpen(false)} title="Скрыть">
      <div><kbd>WASD</kbd> ходить, <kbd>Shift</kbd> бег</div>
      <div><kbd>мышь</kbd> камера, <kbd>колесо</kbd> зум, <kbd>Tab</kbd> вид сверху</div>
      <div><kbd>E</kbd> действие (мебель, доски, экраны), <kbd>F</kbd> экран крупно</div>
      <div><kbd>M</kbd> микрофон, <kbd>V</kbd> камера, <kbd>Enter</kbd> чат, <kbd>1–5</kbd> реакции</div>
      <div><kbd>G</kbd> (держать) бумажкой в урну, <kbd>J</kbd> у стола — степлер в желе</div>
    </div>
  )
}
