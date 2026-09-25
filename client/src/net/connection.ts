import { Channel, Presence, Socket } from 'phoenix'
import type { ClientEvents, JoinParams, JoinReply, PresenceMeta, ServerEvents } from '@shared/protocol.gen'

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'error'

export interface PresenceEntry extends PresenceMeta {
  id: string
}

interface Handlers {
  onJoin: (reply: JoinReply, rejoin: boolean) => void
  onJoinError: (reason: string) => void
  onStatus: (status: ConnectionStatus) => void
  onPresence: (entries: PresenceEntry[]) => void
}

export class ProtocolError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

/**
 * Typed wrapper over a Phoenix socket + the `space:<id>` channel.
 * phoenix.js reconnects the socket and rejoins the channel on its own (with
 * the same params, so the same player id); `onJoin` fires again on every rejoin.
 */
export class SpaceConnection {
  readonly socket: Socket
  readonly channel: Channel
  private readonly presence: Presence
  private joinedOnce = false

  constructor(spaceId: string, params: JoinParams, handlers: Handlers) {
    this.socket = new Socket('/socket', {
      reconnectAfterMs: (tries) => [250, 500, 1000, 2000][tries - 1] ?? 4000,
      heartbeatIntervalMs: 15000,
    })
    this.socket.onError(() => handlers.onStatus('reconnecting'))
    this.socket.connect()

    this.channel = this.socket.channel(`space:${spaceId}`, params as unknown as object)
    this.channel.onError(() => handlers.onStatus('reconnecting'))

    this.presence = new Presence(this.channel)
    this.presence.onSync(() => {
      const entries = this.presence.list<PresenceEntry>((id, { metas }: { metas: PresenceMeta[] }) => ({
        id,
        ...metas[metas.length - 1]!,
      }))
      handlers.onPresence(entries)
    })

    handlers.onStatus('connecting')
    this.channel
      .join(10000)
      .receive('ok', (reply: JoinReply) => {
        handlers.onStatus('online')
        handlers.onJoin(reply, this.joinedOnce)
        this.joinedOnce = true
      })
      .receive('error', ({ reason }: { reason: string }) => {
        if (reason === 'bad_params' || reason === 'full' || reason === 'unauthorized') {
          handlers.onStatus('error')
          handlers.onJoinError(reason)
          this.close()
        }
      })
      .receive('timeout', () => handlers.onStatus('reconnecting'))
  }

  /** Fire-and-forget push (dropped silently while offline). */
  send<E extends keyof ClientEvents>(event: E, payload: ClientEvents[E]['payload']) {
    if (this.channel.state === 'joined') this.channel.push(event, payload as object)
  }

  /** Push that resolves with the typed reply or rejects with the server's error reason. */
  request<E extends keyof ClientEvents>(event: E, payload: ClientEvents[E]['payload']): Promise<ClientEvents[E]['reply']> {
    return new Promise((resolve, reject) => {
      this.channel
        .push(event, payload as object, 10000)
        .receive('ok', (reply) => resolve(reply as ClientEvents[E]['reply']))
        .receive('error', (e: { reason?: string }) => reject(new ProtocolError(e?.reason ?? 'error')))
        .receive('timeout', () => reject(new ProtocolError('timeout')))
    })
  }

  on<E extends keyof ServerEvents>(event: E, cb: (payload: ServerEvents[E]) => void) {
    this.channel.on(event, cb as (p: unknown) => void)
  }

  close() {
    this.channel.leave()
    this.socket.disconnect()
  }
}
