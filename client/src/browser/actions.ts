import { explain } from '../screens/actions'
import { media } from '../media/media'
import { getConnection } from '../net/session'
import { notify, useGame } from '../store/game'
import { useScreens } from '../store/screens'
import { toUrl } from './input'

/** Starts the shared browser on a screen (desk monitor or a room's big screen) and opens it. */
export async function openBrowser(screenId: string, input: string) {
  const conn = getConnection()
  const url = toUrl(input)
  if (!conn) return
  if (!url) return notify('Введите адрес сайта, например github.com')
  useGame.setState({ menuOpen: false })
  try {
    await conn.request('screen_claim', { screenId, mode: 'browser', url })
    if (media.sharingScreenId === screenId) media.stopScreenShare()
    useScreens.setState({ overlay: screenId })
  } catch (e) {
    notify(explain(e))
  }
}
