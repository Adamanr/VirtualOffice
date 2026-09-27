import { create } from 'zustand'
import { browserStream } from './stream'
import { resumeFocus } from './focus'

/** What's under the cursor, as reported by the browser service. */
export interface ContextInfo {
  link: string | null
  image: string | null
  selection: string
  editable: boolean
  /** The page opened its own menu (it handled `contextmenu`): ours stays closed. */
  pageMenu: boolean
  canBack: boolean
  canForward: boolean
}

interface MenuState {
  screenId: string | null
  /** Where to show it (CSS pixels in the window). */
  x: number
  y: number
  info: ContextInfo | null
  /** Opened from the in-game screen mode: pointer lock is suspended meanwhile. */
  fromFocus: boolean
}

export const useContextMenu = create<MenuState>(() => ({ screenId: null, x: 0, y: 0, info: null, fromFocus: false }))

/** A right click on a shared browser page: the service clicks and tells us what's there. */
export function openContextMenu(screenId: string, clientX: number, clientY: number, page: { x: number; y: number }, fromFocus: boolean) {
  useContextMenu.setState({ screenId, x: clientX, y: clientY, info: null, fromFocus })
  browserStream(screenId).send({ t: 'context', x: Math.round(page.x), y: Math.round(page.y) })
}

export function receiveContext(screenId: string, info: ContextInfo) {
  if (useContextMenu.getState().screenId !== screenId) return
  if (info.pageMenu) closeContextMenu(true)
  else useContextMenu.setState({ info })
}

/** `resume`: go back to driving the page (a menu item was chosen); otherwise leave the screen. */
export function closeContextMenu(resume: boolean) {
  const { screenId, fromFocus } = useContextMenu.getState()
  if (!screenId) return
  useContextMenu.setState({ screenId: null, info: null })
  if (fromFocus) resumeFocus(resume)
}
