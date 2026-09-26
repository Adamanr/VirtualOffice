import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useOffice } from '../lib/offices'
import { navigate } from '../lib/route'
import { media } from '../media/media'
import { AVATAR_COLORS, useProfile } from '../store/profile'
import { DeviceSelect, useDevices } from './DeviceSelect'

// three.js + R3F: loaded only when the editor opens (the office preloads them anyway).
const CharacterDialog = lazy(() => import('./CharacterEditor').then((m) => ({ default: m.CharacterDialog })))

/** Live mic level (0..1) of a stream, for the lobby meter. */
function useMicLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
      setLevel(Math.min(1, (peak / 128) * 2.5))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      void ctx.close()
      setLevel(0)
    }
  }, [stream])
  return level
}

/** Entry screen: name, avatar color, microphone/camera choice with a live preview. */
export function Lobby({ spaceId, onEnter }: { spaceId: string; onEnter: () => void }) {
  const profile = useProfile()
  const office = useOffice(spaceId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.name)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [granted, setGranted] = useState(0)
  const devices = useDevices(granted)
  const video = useRef<HTMLVideoElement>(null)
  const micLevel = useMicLevel(profile.micOn ? stream : null)
  const valid = name.trim().length >= 1 && name.trim().length <= 32
  const hasMedia = typeof navigator.mediaDevices?.getUserMedia === 'function'

  // Preview stream for the selected devices (also triggers the permission prompt).
  useEffect(() => {
    if (!hasMedia || (!profile.micOn && !profile.camOn)) {
      setStream(null)
      return
    }
    let cancelled = false
    let current: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({
        audio: profile.micOn ? { deviceId: profile.micId ? { ideal: profile.micId } : undefined } : false,
        video: profile.camOn ? { deviceId: profile.camId ? { ideal: profile.camId } : undefined, width: 640, height: 360 } : false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        current = s
        setStream(s)
        setMediaError(null)
        setGranted((n) => n + 1)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setStream(null)
        setMediaError(
          e.name === 'NotAllowedError'
            ? 'Доступ к камере/микрофону запрещён. Можно войти без них и включить позже.'
            : e.name === 'NotFoundError'
              ? 'Устройство не найдено. Можно войти без него.'
              : `Не удалось открыть устройство: ${e.message}`,
        )
      })
    return () => {
      cancelled = true
      current?.getTracks().forEach((t) => t.stop())
    }
  }, [hasMedia, profile.micOn, profile.camOn, profile.micId, profile.camId])

  useEffect(() => {
    if (video.current) video.current.srcObject = stream && stream.getVideoTracks().length ? stream : null
  }, [stream])

  const enter = () => {
    if (!valid) return
    stream?.getTracks().forEach((t) => t.stop())
    profile.update({ name: name.trim() })
    media.prepareAudio() // inside the click: unlocks audio playback
    onEnter()
  }

  return (
    <div className="screen-center">
      <form
        className="card lobby"
        onSubmit={(e) => {
          e.preventDefault()
          enter()
        }}
      >
        <button type="button" className="btn ghost small lobby-back" onClick={() => navigate('/')}>
          ← Все офисы
        </button>
        <h2>{office ? `Вход в офис «${office.name}»` : 'Вход в пространство'}</h2>
        {office === null && <p className="muted small">Быстрая комната: ничего не сохраняется, когда все выйдут. Сохраняемый офис создаётся в меню.</p>}
        <p className="muted small">
          Ссылка для коллег: <code>{location.origin}/s/{spaceId}</code>
        </p>
        <div className="lobby-grid">
          <div className="lobby-preview">
            <video ref={video} autoPlay muted playsInline className={profile.camOn && stream?.getVideoTracks().length ? '' : 'hidden'} />
            {!(profile.camOn && stream?.getVideoTracks().length) && (
              <div className="lobby-avatar" style={{ background: profile.color }}>
                {(name.trim()[0] ?? '?').toUpperCase()}
              </div>
            )}
            <div className="mic-meter">
              <div style={{ width: `${Math.round(micLevel * 100)}%` }} />
            </div>
          </div>
          <div className="lobby-fields">
            <label className="field">
              <span>Имя</span>
              <input className="input" autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас зовут?" />
            </label>
            <div className="field">
              <span>Персонаж</span>
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                🧍 Настроить внешность
              </button>
            </div>
            <div className="field">
              <span>Ваш цвет (подпись над головой, пометки)</span>
              <div className="swatches">
                {AVATAR_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`swatch${profile.color === c ? ' active' : ''}`}
                    style={{ background: c }}
                    onClick={() => profile.update({ color: c })}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {editing && (
          <Suspense fallback={null}>
            <CharacterDialog onClose={() => setEditing(false)} />
          </Suspense>
        )}
        {hasMedia ? (
          <>
            <div className="row wrap">
              <label className="check">
                <input type="checkbox" checked={profile.micOn} onChange={(e) => profile.update({ micOn: e.target.checked })} />
                Микрофон
              </label>
              <label className="check">
                <input type="checkbox" checked={profile.camOn} onChange={(e) => profile.update({ camOn: e.target.checked })} />
                Камера
              </label>
              <label className="check" title="Микрофон включается, пока зажат пробел">
                <input type="checkbox" checked={profile.pushToTalk} onChange={(e) => profile.update({ pushToTalk: e.target.checked })} />
                Push-to-talk (пробел)
              </label>
            </div>
            <div className="device-grid">
              <DeviceSelect kind="audioinput" devices={devices} value={profile.micId} onChange={(micId) => profile.update({ micId })} />
              <DeviceSelect kind="videoinput" devices={devices} value={profile.camId} onChange={(camId) => profile.update({ camId })} />
              <DeviceSelect kind="audiooutput" devices={devices} value={profile.speakerId} onChange={(speakerId) => profile.update({ speakerId })} />
            </div>
            {mediaError && <p className="notice">{mediaError}</p>}
          </>
        ) : (
          <p className="notice">Браузер не даёт доступ к медиа (нужен HTTPS). Можно войти и ходить без голоса.</p>
        )}
        <button className="btn primary wide" type="submit" disabled={!valid}>
          Войти
        </button>
      </form>
    </div>
  )
}
