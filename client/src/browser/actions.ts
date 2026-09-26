import { explain } from '../screens/actions'
import { media } from '../media/media'
import { getConnection } from '../net/session'
import { notify, useGame } from '../store/game'
import { setScreenState } from '../store/screens'
import { toUrl } from './input'
import { enterFocus } from './focus'

/** Starts the shared browser on a screen (desk monitor or a room's big screen) and opens it. */
export async function openBrowser(screenId: string, input: string) {
  const conn = getConnection()
  const url = toUrl(input)
  if (!conn) return
  if (!url) return notify('Введите адрес сайта, например github.com')
  useGame.setState({ menuOpen: false })
  try {
    const { screen } = await conn.request('screen_claim', { screenId, mode: 'browser', url })
    setScreenState(screen)
    if (media.sharingScreenId === screenId) media.stopScreenShare()
    // Straight into the screen: pointer locked, the page under your mouse.
    enterFocus(screenId)
  } catch (e) {
    notify(explain(e))
  }
}
