import { useEffect, useRef, useState } from 'react'
import { media } from '../media/media'
import { useGame } from '../store/game'
import { useMedia, type VideoTile } from '../store/media'
import { usePlayers } from '../store/players'
import { useProfile } from '../store/profile'
import { DeviceSelect, useDevices } from './DeviceSelect'
import { CamIcon, CamOff, GearIcon, MicIcon, MicOff } from './icons'

function Tile({ tile }: { tile: VideoTile }) {
  const ref = useRef<HTMLVideoElement>(null)
  const player = usePlayers((s) => s.players[tile.id])
  const speaking = useMedia((s) => s.speaking[tile.id] ?? false)
  const selfId = usePlayers((s) => s.selfId)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    tile.track.attach(el)
    return () => {
      tile.track.detach(el)
    }
  }, [tile.track])
  return (
    <div className={`tile${speaking ? ' speaking' : ''}${tile.id === selfId ? ' self' : ''}`}>
      <video ref={ref} autoPlay muted playsInline />
      <div className="tile-name">
        {player?.name ?? '…'}
        {player?.muted && <MicOff />}
      </div>
    </div>
  )
}

/** Camera tiles of the nearest people, Gather-style, along the top of the screen. */
export function VideoTiles() {
  const tiles = useMedia((s) => s.tiles)
  if (tiles.length === 0) return null
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <Tile key={`${t.id}:${t.track.sid ?? 'local'}`} tile={t} />
      ))}
    </div>
  )
}

function DevicesPopover({ onClose }: { onClose: () => void }) {
  const profile = useProfile()
  const devices = useDevices()
  return (
    <div className="panel popover" onMouseLeave={onClose}>
      <DeviceSelect
        kind="audioinput"
        devices={devices}
        value={profile.micId}
        onChange={(id) => {
          profile.update({ micId: id })
          void media.switchDevice('audioinput', id)
        }}
      />
      <DeviceSelect
        kind="videoinput"
        devices={devices}
        value={profile.camId}
        onChange={(id) => {
          profile.update({ camId: id })
          void media.switchDevice('videoinput', id)
        }}
      />
      <DeviceSelect
        kind="audiooutput"
        devices={devices}
        value={profile.speakerId}
        onChange={(id) => {
          profile.update({ speakerId: id })
          void media.switchDevice('audiooutput', id)
        }}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={profile.pushToTalk}
          onChange={(e) => {
            profile.update({ pushToTalk: e.target.checked })
            if (e.target.checked) void media.setMic(false)
          }}
        />
        Push-to-talk (зажать пробел)
      </label>
    </div>
  )
}

const STATUS_TEXT = {
  idle: '',
  connecting: 'Подключение медиа…',
  connected: '',
  reconnecting: 'Медиа: переподключение…',
  unavailable: 'Голос отключён на сервере',
  error: 'Медиасервер недоступен — без голоса и видео',
} as const

/** Mic / camera / device buttons; extra buttons (screen, chat, leave) come in as children. */
export function MediaControls({ children }: { children?: React.ReactNode }) {
  const { micOn, camOn, status, pttActive } = useMedia()
  const pushToTalk = useProfile((s) => s.pushToTalk)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const disabled = status !== 'connected'
  return (
    <div className="controls-wrap">
      {STATUS_TEXT[status] && <div className={`media-status ${status}`}>{STATUS_TEXT[status]}</div>}
      {devicesOpen && <DevicesPopover onClose={() => setDevicesOpen(false)} />}
      <div className="panel controls">
        <button
          className={`ctl${micOn ? '' : ' off'}${pttActive ? ' ptt' : ''}`}
          disabled={disabled}
          onClick={() => void media.setMic(!micOn)}
          title={pushToTalk ? 'Push-to-talk: зажмите пробел' : 'Микрофон (M)'}
        >
          {micOn ? <MicIcon /> : <MicOff />}
        </button>
        <button className={`ctl${camOn ? '' : ' off'}`} disabled={disabled} onClick={() => void media.setCam(!camOn)} title="Камера (V)">
          {camOn ? <CamIcon /> : <CamOff />}
        </button>
        <button className="ctl" onClick={() => setDevicesOpen((v) => !v)} title="Устройства">
          <GearIcon />
        </button>
        {children}
      </div>
    </div>
  )
}

export function MediaBanners() {
  const audioBlocked = useMedia((s) => s.audioBlocked)
  const notice = useGame((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => useGame.setState({ notice: null }), 5000)
    return () => clearTimeout(t)
  }, [notice])
  return (
    <div className="banners">
      {audioBlocked && (
        <button className="btn primary" onClick={() => void media.startAudio()}>
          🔊 Включить звук
        </button>
      )}
      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}
