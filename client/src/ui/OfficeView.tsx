import { useEffect } from 'react'
import { startSession, stopSession } from '../net/session'
import { NetSync } from '../scene/NetSync'
import { Nameplate } from '../scene/Nameplate'
import { RemotePlayers } from '../scene/RemotePlayers'
import { Scene } from '../scene/Scene'
import { usePlayers } from '../store/players'
import { useProfile } from '../store/profile'
import { HelpHint, TopBar } from './Hud'
import { MediaBanners, MediaControls, VideoTiles } from './MediaHud'
import { MediaSync } from '../scene/MediaSync'
import { navigate } from '../lib/route'
import { LeaveIcon } from './icons'

const JOIN_ERRORS: Record<string, string> = {
  full: 'В пространстве уже максимум участников (30).',
  bad_params: 'Некорректное имя или ссылка.',
  unauthorized: 'Нет доступа.',
}

export function OfficeView({ spaceId }: { spaceId: string }) {
  const name = useProfile((s) => s.name)
  const color = useProfile((s) => s.color)
  const selfId = usePlayers((s) => s.selfId)
  const joinError = usePlayers((s) => s.joinError)

  useEffect(() => {
    startSession(spaceId, { name, color })
    return () => stopSession()
  }, [spaceId, name, color])

  if (joinError) {
    return (
      <div className="screen-center">
        <div className="card">
          <h2>Не удалось войти</h2>
          <p>{JOIN_ERRORS[joinError] ?? joinError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="office">
      <Scene color={color} self={selfId ? <Nameplate id={selfId} /> : null}>
        <NetSync />
        <MediaSync />
        <RemotePlayers />
      </Scene>
      <TopBar spaceId={spaceId} />
      <VideoTiles />
      <MediaBanners />
      <MediaControls>
        <button className="ctl danger" onClick={() => navigate('/')} title="Выйти">
          <LeaveIcon />
        </button>
      </MediaControls>
      <HelpHint />
    </div>
  )
}
