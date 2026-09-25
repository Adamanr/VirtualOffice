import { useEffect } from 'react'
import { setKeyboardActive } from '../input/keyboard'
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
import { Interactions } from '../scene/Interactions'
import { Screens } from '../scene/Screens'
import { BoardSurfaces } from '../scene/BoardSurfaces'
import { FxLayer } from '../fx/FxLayer'
import { PropDevices } from '../scene/PropDevices'
import { Tosses } from '../scene/Tosses'
import { Jellos } from '../scene/Jellos'
import { Scoreboard } from '../scene/Scoreboard'
import { DrillFx } from '../scene/DrillFx'
import { ActivityHud } from './ActivityHud'
import { InteractionMenu, InteractionPrompt, ScreenOverlay } from './ScreenUi'
import { IntranetMenuItem, PropMenu, PropOverlays, PropPrompt } from './PropUi'
import '../screens/actions'
import '../screens/pdfActions'
import '../props/actions'
import { ChatButton, ChatPanel, ReactionButtons } from './Chat'
import { PdfDropZone, PdfHint, PdfMenuItems, PdfOverlay } from './PdfUi'
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
    setKeyboardActive(true)
    return () => {
      setKeyboardActive(false)
      stopSession()
    }
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
        <Interactions />
        <Screens />
        <BoardSurfaces />
        <PropDevices />
        <Jellos />
        <Scoreboard />
        <Tosses />
        <DrillFx />
        <FxLayer />
        <RemotePlayers />
      </Scene>
      <TopBar spaceId={spaceId} />
      <VideoTiles />
      <MediaBanners />
      <InteractionPrompt />
      <PropPrompt />
      <InteractionMenu
        extra={(id) => (
          <>
            <IntranetMenuItem />
            <PdfMenuItems screenId={id} />
          </>
        )}
      />
      <PropMenu />
      <ActivityHud />
      <PdfHint />
      <ScreenOverlay renderPdf={(id) => <PdfOverlay screenId={id} />} />
      <PropOverlays />
      <PdfDropZone />
      <ChatPanel />
      <MediaControls>
        <ReactionButtons />
        <ChatButton />
        <button className="ctl danger" onClick={() => navigate('/')} title="Выйти">
          <LeaveIcon />
        </button>
      </MediaControls>
      <HelpHint />
    </div>
  )
}
