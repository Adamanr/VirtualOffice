import { create } from 'zustand'
import type { BoardStroke, PropState, Sticker } from '@shared/protocol.gen'

interface PropsStore {
  strokes: Record<string, BoardStroke[]>
  stickers: Record<string, Sticker[]>
  vending: Record<string, PropState>
}

export const useProps = create<PropsStore>(() => ({
  strokes: {},
  stickers: {},
  vending: {},
}))

export function hydrateProps(boards: BoardStroke[], stickers: Sticker[], props: PropState[]) {
  const strokes: Record<string, BoardStroke[]> = {}
  for (const s of boards) {
    ;(strokes[s.boardId] ??= []).push(s)
  }
  const stickerMap: Record<string, Sticker[]> = {}
  for (const s of stickers) {
    ;(stickerMap[s.boardId] ??= []).push(s)
  }
  const vending = Object.fromEntries(props.map((p) => [p.id, p]))
  useProps.setState({ strokes, stickers: stickerMap, vending })
}

export function applyStroke(stroke: BoardStroke) {
  useProps.setState((s) => {
    const list = [...(s.strokes[stroke.boardId] ?? []), stroke].slice(-400)
    return { strokes: { ...s.strokes, [stroke.boardId]: list } }
  })
}

export function clearBoardStrokes(boardId: string) {
  useProps.setState((s) => ({ strokes: { ...s.strokes, [boardId]: [] } }))
}

export function setBoardStickers(boardId: string, stickers: Sticker[]) {
  useProps.setState((s) => ({ stickers: { ...s.stickers, [boardId]: stickers } }))
}

export function applyPropEvent(prop: PropState) {
  useProps.setState((s) => ({ vending: { ...s.vending, [prop.id]: prop } }))
}

export function clearPropsStore() {
  useProps.setState({ strokes: {}, stickers: {}, vending: {} })
}
