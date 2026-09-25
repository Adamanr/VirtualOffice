import {
  ConnectionState,
  createLocalScreenTracks,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type LocalTrackPublication,
  type Participant,
} from 'livekit-client'
import { audibility, canSeeScreen, pickVideoTiles, type Listener } from '../lib/audio'
import { getScreen, getZone, level, zoneAt } from '../lib/level'
import type { SpaceConnection } from '../net/connection'
import { ProtocolError } from '../net/connection'
import { remotes } from '../net/remotes'
import { useMedia, type VideoTile } from '../store/media'
import { useProfile } from '../store/profile'
import { setScreenVideo, useScreens } from '../store/screens'

const MAX_TILES = 8
const SCREEN_TRACK_PREFIX = 'screen:'
const isIsolated = (zoneId: string | null) => getZone(zoneId)?.isolated ?? false

function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Нет разрешения на доступ к устройству'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Устройство не найдено'
  if (name === 'NotReadableError') return 'Устройство занято другим приложением'
  return e instanceof Error ? e.message : String(e)
}

/**
 * LiveKit side of the office: one room per space, manual subscriptions driven
 * by position (proximity and isolated rooms), per-track gain + stereo panning
 * through Web Audio, active speakers, camera tiles and screen shares.
 * Every failure degrades to "no media": walking and screens keep working.
 */
class MediaManager {
  room: Room | null = null
  private audioContext: AudioContext | null = null
  private panners = new Map<RemoteAudioTrack, StereoPannerNode>()
  private generation = 0
  private conn: SpaceConnection | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private screenShare: { screenId: string; track: LocalVideoTrack } | null = null
  onScreenShareEnded: ((screenId: string) => void) | null = null

  /** Must run inside a user gesture (e.g. the "Enter" click) to satisfy autoplay policies. */
  prepareAudio() {
    try {
      this.audioContext ??= new AudioContext({ latencyHint: 'interactive' })
      void this.audioContext.resume()
    } catch {
      this.audioContext = null
    }
  }

  async connect(conn: SpaceConnection) {
    const gen = ++this.generation
    this.conn = conn
    useMedia.setState({ status: 'connecting' })
    let reply
    try {
      reply = await conn.request('livekit_token', {})
    } catch (e) {
      if (gen !== this.generation) return
      const disabled = e instanceof ProtocolError && e.reason === 'livekit_disabled'
      useMedia.setState({ status: disabled ? 'unavailable' : 'error' })
      if (!disabled) this.scheduleReconnect()
      return
    }
    if (gen !== this.generation) return

    const profile = useProfile.getState()
    const url = reply.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/lk`
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      webAudioMix: this.audioContext ? { audioContext: this.audioContext } : true,
      audioCaptureDefaults: {
        deviceId: profile.micId ?? undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: { deviceId: profile.camId ?? undefined, resolution: VideoPresets.h360.resolution },
      audioOutput: profile.speakerId ? { deviceId: profile.speakerId } : undefined,
      publishDefaults: { simulcast: true, dtx: true, red: true, videoCodec: 'vp8' },
    })
    this.bind(room)
    this.room = room
    try {
      await room.connect(url, reply.token, { autoSubscribe: false })
    } catch (e) {
      console.warn('LiveKit connect failed', e)
      if (gen !== this.generation) return
      this.room = null
      useMedia.setState({ status: 'error' })
      this.scheduleReconnect()
      return
    }
    if (gen !== this.generation) {
      void room.disconnect()
      return
    }
    useMedia.setState({ status: 'connected', audioBlocked: !room.canPlaybackAudio })
    const media = useMedia.getState()
    const wantMic = this.room === room && (media.micOn || (profile.micOn && !profile.pushToTalk))
    if (wantMic) await this.setMic(true)
    if (profile.camOn || media.camOn) await this.setCam(true)
  }

  disconnect() {
    this.generation++
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopScreenShare()
    const room = this.room
    this.room = null
    this.conn = null
    this.panners.clear()
    void room?.disconnect()
    useMedia.setState({ status: 'idle', speaking: {}, tiles: [], micOn: false, camOn: false })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.conn) return
    const conn = this.conn
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.conn === conn && !this.room) void this.connect(conn)
    }, 5000)
  }

  private bind(room: Room) {
    room
      .on(RoomEvent.TrackSubscribed, (track, pub) => this.onSubscribed(track, pub))
      .on(RoomEvent.TrackUnsubscribed, (track, pub) => this.onUnsubscribed(track, pub))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        useMedia.setState({ speaking: Object.fromEntries(speakers.map((p) => [p.identity, true])) })
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => useMedia.setState({ audioBlocked: !room.canPlaybackAudio }))
      .on(RoomEvent.LocalTrackPublished, () => this.refreshLocal())
      .on(RoomEvent.LocalTrackUnpublished, () => this.refreshLocal())
      .on(RoomEvent.TrackMuted, () => this.refreshLocal())
      .on(RoomEvent.TrackUnmuted, () => this.refreshLocal())
      .on(RoomEvent.Reconnecting, () => useMedia.setState({ status: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => useMedia.setState({ status: 'connected' }))
      .on(RoomEvent.Disconnected, () => {
        if (this.room !== room) return
        this.room = null
        this.panners.clear()
        useMedia.setState({ status: 'error', speaking: {}, tiles: [] })
        this.scheduleReconnect()
      })
  }

  private onSubscribed(track: RemoteTrack, pub: RemoteTrackPublication) {
    if (track instanceof RemoteAudioTrack) {
      if (this.audioContext) {
        const panner = this.audioContext.createStereoPanner()
        this.panners.set(track, panner)
        track.setWebAudioPlugins([panner])
      }
      track.attach()
      track.setVolume(0)
    } else if (track instanceof RemoteVideoTrack && pub.source === Track.Source.ScreenShare) {
      const screenId = pub.trackName.startsWith(SCREEN_TRACK_PREFIX) ? pub.trackName.slice(SCREEN_TRACK_PREFIX.length) : null
      if (screenId) setScreenVideo(screenId, track)
    }
  }

  private onUnsubscribed(track: RemoteTrack, pub: RemoteTrackPublication) {
    if (track instanceof RemoteAudioTrack) {
      track.detach()
      this.panners.get(track)?.disconnect()
      this.panners.delete(track)
    } else if (pub.source === Track.Source.ScreenShare && pub.trackName.startsWith(SCREEN_TRACK_PREFIX)) {
      const screenId = pub.trackName.slice(SCREEN_TRACK_PREFIX.length)
      if (useScreens.getState().video[screenId] === track) setScreenVideo(screenId, null)
    }
  }

  private refreshLocal() {
    const lp = this.room?.localParticipant
    if (!lp) return
    const mic = lp.getTrackPublication(Track.Source.Microphone)
    const cam = lp.getTrackPublication(Track.Source.Camera)
    const micOn = !!mic && !mic.isMuted
    const camOn = !!cam && !cam.isMuted && !!cam.track
    const s = useMedia.getState()
    if (s.micOn !== micOn || s.camOn !== camOn) {
      useMedia.setState({ micOn, camOn })
      this.conn?.send('media_state', { muted: !micOn, cam: camOn })
    }
  }

  /** Publishes the current mic/cam state to presence (after a (re)join). */
  announce() {
    const { micOn, camOn } = useMedia.getState()
    this.conn?.send('media_state', { muted: !micOn, cam: camOn })
  }

  async setMic(on: boolean) {
    const room = this.room
    if (!room) {
      useMedia.setState({ micOn: false, notice: on ? 'Медиасервер недоступен' : null })
      return
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(on)
    } catch (e) {
      useMedia.setState({ notice: `Микрофон: ${describeError(e)}` })
    }
    this.refreshLocal()
  }

  async setCam(on: boolean) {
    const room = this.room
    if (!room) {
      useMedia.setState({ camOn: false, notice: on ? 'Медиасервер недоступен' : null })
      return
    }
    try {
      await room.localParticipant.setCameraEnabled(on)
    } catch (e) {
      useMedia.setState({ notice: `Камера: ${describeError(e)}` })
    }
    this.refreshLocal()
  }

  async switchDevice(kind: MediaDeviceKind, deviceId: string) {
    try {
      await this.room?.switchActiveDevice(kind, deviceId)
    } catch (e) {
      useMedia.setState({ notice: describeError(e) })
    }
  }

  async startAudio() {
    await this.audioContext?.resume()
    await this.room?.startAudio()
    useMedia.setState({ audioBlocked: !(this.room?.canPlaybackAudio ?? true) })
  }

  /** Publishes a screen capture as `screen:<screenId>`. Throws if the user cancels. */
  async startScreenShare(screenId: string) {
    const room = this.room
    if (!room) throw new Error('Медиасервер недоступен — демонстрация экрана не работает')
    this.stopScreenShare()
    const [track] = await createLocalScreenTracks({ audio: false, resolution: ScreenSharePresets.h1080fps15.resolution })
    const video = track as LocalVideoTrack
    await room.localParticipant.publishTrack(video, {
      name: SCREEN_TRACK_PREFIX + screenId,
      source: Track.Source.ScreenShare,
      simulcast: false,
      videoEncoding: ScreenSharePresets.h1080fps15.encoding,
    })
    this.screenShare = { screenId, track: video }
    setScreenVideo(screenId, video)
    // The browser's own "Stop sharing" button ends the track.
    video.mediaStreamTrack.addEventListener('ended', () => {
      if (this.screenShare?.track === video) {
        this.stopScreenShare()
        this.onScreenShareEnded?.(screenId)
      }
    })
  }

  stopScreenShare() {
    const share = this.screenShare
    if (!share) return
    this.screenShare = null
    setScreenVideo(share.screenId, null)
    void this.room?.localParticipant.unpublishTrack(share.track, true).catch(() => share.track.stop())
  }

  get sharingScreenId() {
    return this.screenShare?.screenId ?? null
  }

  /**
   * Called ~10x/s: recompute who is audible/visible from positions, adjust
   * subscriptions (to save bandwidth), per-track volume and panning, and the
   * camera tiles.
   */
  update(listener: Listener) {
    const room = this.room
    if (!room || room.state !== ConnectionState.Connected) return
    const overlay = useScreens.getState().overlay
    const now = this.audioContext?.currentTime ?? 0
    const camCandidates: { id: string; distance: number; audible: boolean }[] = []
    const camPubs = new Map<string, RemoteTrackPublication>()

    for (const p of room.remoteParticipants.values()) {
      const r = remotes.get(p.identity)
      const pose = r?.hasPose ? r.pose : null
      const source = pose ? { x: pose.x, z: pose.z, zoneId: zoneAt(level, pose.x, pose.z)?.id ?? null } : null

      for (const pub of p.trackPublications.values()) {
        if (pub.source === Track.Source.Microphone) {
          const a = source ? audibility(listener, source, isIsolated, pub.isDesired) : null
          const want = a?.subscribe ?? false
          if (pub.isDesired !== want) pub.setSubscribed(want)
          const track = pub.track
          if (track instanceof RemoteAudioTrack && a) {
            track.setVolume(a.volume)
            this.panners.get(track)?.pan.setTargetAtTime(a.pan, now, 0.1)
          }
        } else if (pub.source === Track.Source.Camera) {
          if (!source || pub.isMuted) {
            if (pub.isDesired) pub.setSubscribed(false)
            continue
          }
          const a = audibility(listener, source, isIsolated, pub.isDesired)
          camCandidates.push({ id: p.identity, distance: a.distance, audible: a.volume > 0.02 })
          camPubs.set(p.identity, pub)
        } else if (pub.source === Track.Source.ScreenShare) {
          const screenId = pub.trackName.startsWith(SCREEN_TRACK_PREFIX) ? pub.trackName.slice(SCREEN_TRACK_PREFIX.length) : null
          const screen = screenId ? getScreen(screenId) : undefined
          const state = screenId ? useScreens.getState().states[screenId] : undefined
          // Only the current owner's share counts (guards against stale publications).
          const want = !!screen && state?.owner === p.identity && (canSeeScreen(listener, screen) || overlay === screenId)
          if (pub.isDesired !== want) pub.setSubscribed(want)
        }
      }
    }

    const shownIds = pickVideoTiles(camCandidates, MAX_TILES - 1)
    const shown = new Set(shownIds)
    for (const [id, pub] of camPubs) if (pub.isDesired !== shown.has(id)) pub.setSubscribed(shown.has(id))

    const tiles: VideoTile[] = []
    const localCam = room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined
    if (localCam?.videoTrack && !localCam.isMuted) tiles.push({ id: room.localParticipant.identity, track: localCam.videoTrack })
    for (const id of shownIds) {
      const track = camPubs.get(id)?.track
      if (track instanceof RemoteVideoTrack) tiles.push({ id, track })
    }
    const prev = useMedia.getState().tiles
    if (prev.length !== tiles.length || prev.some((t, i) => t.id !== tiles[i]!.id || t.track !== tiles[i]!.track)) {
      useMedia.setState({ tiles })
    }
  }
}

export const media = new MediaManager()
