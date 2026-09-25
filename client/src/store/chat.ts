import { create } from 'zustand'
import type { ChatMessage } from '@shared/protocol.gen'

const MAX = 200

interface ChatState {
  messages: ChatMessage[]
  open: boolean
  tab: 'global' | 'zone'
  unread: number
}

export const useChat = create<ChatState>(() => ({ messages: [], open: false, tab: 'global', unread: 0 }))

export function addMessage(msg: ChatMessage) {
  useChat.setState((s) => {
    if (s.messages.some((m) => m.id === msg.id)) return s
    return { messages: [...s.messages, msg].slice(-MAX), unread: s.open ? 0 : s.unread + 1 }
  })
}

/** Join/rejoin: server history (global) merged with local zone messages we already had. */
export function setHistory(history: ChatMessage[]) {
  useChat.setState((s) => {
    const byId = new Map<string, ChatMessage>()
    for (const m of [...s.messages, ...history]) byId.set(m.id, m)
    return { messages: [...byId.values()].sort((a, b) => a.ts - b.ts).slice(-MAX) }
  })
}
