import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { notify } from '../store/game'
import { closeContextMenu, useContextMenu, type ContextInfo } from './contextMenu'
import { browserStream } from './stream'

interface Item {
  label: string
  run: () => void | Promise<void>
  disabled?: boolean
}

const short = (text: string, n = 24) => (text.length > n ? text.slice(0, n - 1) + '…' : text)

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    notify('Не удалось скопировать: браузер не дал доступ к буферу обмена')
  }
}

function items(screenId: string, info: ContextInfo): Item[][] {
  const stream = browserStream(screenId)
  const groups: Item[][] = [
    [
      { label: '← Назад', run: () => stream.send({ t: 'back' }), disabled: !info.canBack },
      { label: '→ Вперёд', run: () => stream.send({ t: 'forward' }), disabled: !info.canForward },
      { label: '⟳ Обновить', run: () => stream.send({ t: 'reload' }) },
    ],
  ]
  if (info.link) {
    const link = info.link
    groups.push([
      { label: 'Открыть ссылку в новой вкладке', run: () => stream.send({ t: 'tab_new', url: link }) },
      { label: 'Копировать адрес ссылки', run: () => copy(link) },
    ])
  }
  if (info.image) {
    const image = info.image
    groups.push([
      { label: 'Открыть картинку в новой вкладке', run: () => stream.send({ t: 'tab_new', url: image }) },
      { label: 'Копировать адрес картинки', run: () => copy(image) },
    ])
  }
  const edit: Item[] = []
  if (info.selection.trim()) {
    const selection = info.selection
    edit.push({ label: 'Копировать', run: () => copy(selection) })
    edit.push({
      label: `Найти «${short(selection.trim())}»`,
      run: () => stream.send({ t: 'tab_new', url: `https://duckduckgo.com/?q=${encodeURIComponent(selection.trim())}` }),
    })
  }
  if (info.editable) {
    edit.push({
      label: 'Вставить',
      run: async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (text) stream.send({ t: 'text', text })
        } catch {
          notify('Браузер не дал прочитать буфер обмена — вставьте через Ctrl+V')
        }
      },
    })
  }
  edit.push({ label: 'Выделить всё', run: () => stream.send({ t: 'select_all' }) })
  groups.push(edit)
  return groups
}

/**
 * The right-click menu of the shared browser, like a regular browser's:
 * navigation, links, images, copy / paste. Opens where the page's cursor is
 * (in the window, on the 3D screen or in the cinema view).
 */
export function BrowserContextMenu() {
  const { screenId, x, y, info } = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Keep it inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(x, innerWidth - width - 8)), top: Math.max(8, Math.min(y, innerHeight - height - 8)) })
  }, [x, y, info])

  useEffect(() => {
    if (!screenId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeContextMenu(false)
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeContextMenu(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [screenId])

  if (!screenId) return null
  return (
    <div ref={ref} className="ctx-menu" style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {!info && <div className="ctx-item muted">…</div>}
      {info &&
        items(screenId, info).map((group, g) => (
          <div key={g} className="ctx-group">
            {group.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="ctx-item"
                disabled={item.disabled}
                onClick={() => {
                  void item.run()
                  // A click is a user gesture: the in-game mode can take the mouse back.
                  closeContextMenu(true)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
    </div>
  )
}
