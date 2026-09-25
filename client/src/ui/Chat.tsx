import { useEffect, useRef, useState } from 'react'
import { onKey } from '../input/keyboard'
import { getZone } from '../lib/level'
import { ProtocolError } from '../net/connection'
import { getConnection } from '../net/session'
import { EMOJI } from '../scene/Nameplate'
import { useChat } from '../store/chat'
import { notify, useGame } from '../store/game'
import { usePlayers } from '../store/players'

export function sendReaction(emoji: number) {
  getConnection()?.send('react', { emoji })
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Global and zone-local text chat (Enter to focus, Esc to leave). */
export function ChatPanel() {
  const { messages, open, tab } = useChat()
  const zoneId = useGame((s) => s.zoneId)
  const selfId = usePlayers((s) => s.selfId)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const zone = getZone(zoneId)

  useEffect(
    () =>
      onKey('Enter', () => {
        useChat.setState({ open: true, unread: 0 })
        setTimeout(() => input.current?.focus(), 0)
      }),
    [],
  )

  const shown = messages.filter((m) => (tab === 'global' ? m.scope === 'global' : m.scope === 'zone' && m.zone === zoneId))
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [shown.length, open, tab])

  if (!open) return null

  const send = async () => {
    const value = text.trim()
    if (!value) return
    const conn = getConnection()
    if (!conn) return
    setText('')
    try {
      await conn.request('chat_send', { scope: tab, text: value })
    } catch (e) {
      notify(e instanceof ProtocolError && e.reason === 'rate_limited' ? 'Не так быстро' : 'Сообщение не отправлено')
    }
  }

  return (
    <div className="panel chat">
      <div className="chat-tabs">
        <button className={`chat-tab${tab === 'global' ? ' active' : ''}`} onClick={() => useChat.setState({ tab: 'global' })}>
          Все
        </button>
        <button className={`chat-tab${tab === 'zone' ? ' active' : ''}`} onClick={() => useChat.setState({ tab: 'zone' })} title="Видят только те, кто сейчас в этой зоне">
          {zone ? zone.name : 'Зона'}
        </button>
        <button className="btn ghost small" onClick={() => useChat.setState({ open: false })} title="Свернуть">
          ✕
        </button>
      </div>
      <div className="chat-list" ref={list}>
        {shown.length === 0 && <div className="muted small chat-empty">{tab === 'zone' ? 'Сообщения видят только те, кто в зоне сейчас' : 'Сообщений пока нет'}</div>}
        {shown.map((m) => (
          <div key={m.id} className={`chat-msg${m.from === selfId ? ' mine' : ''}`}>
            <div className="chat-meta">
              <strong>{m.name}</strong> <span className="muted">{time(m.ts)}</span>
            </div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          ref={input}
          className="input"
          maxLength={500}
          value={text}
          placeholder={tab === 'zone' ? `Написать в «${zone?.name ?? 'зону'}»` : 'Написать всем'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      </form>
    </div>
  )
}

export function ChatButton() {
  const unread = useChat((s) => s.unread)
  const open = useChat((s) => s.open)
  return (
    <button className={`ctl${open ? ' active' : ''}`} onClick={() => useChat.setState({ open: !open, unread: 0 })} title="Чат (Enter)">
      💬{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  )
}

export function ReactionButtons() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const offs = EMOJI.map((_, i) => onKey(`Digit${i + 1}`, () => sendReaction(i + 1)))
    return () => offs.forEach((off) => off())
  }, [])
  return (
    <div className="reactions">
      {open && (
        <div className="panel reactions-pop">
          {EMOJI.map((e, i) => (
            <button key={e} className="ctl" title={`${i + 1}`} onClick={() => sendReaction(i + 1)}>
              {e}
            </button>
          ))}
        </div>
      )}
      <button className="ctl" onClick={() => setOpen((v) => !v)} title="Реакции (1–5)">
        😊
      </button>
    </div>
  )
}
