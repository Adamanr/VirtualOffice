import { useState } from 'react'
import { browserStream, useBrowsers } from './stream'

/** Browser-like tab strip for the shared browser (owner switches; everyone sees). */
export function TabsBar({ screenId, control }: { screenId: string; control: boolean }) {
  const info = useBrowsers((s) => s[screenId])
  const stream = browserStream(screenId)
  if (!info) return null
  return (
    <div className="browser-tabs">
      {info.tabs.map((t) => (
        <div
          key={t.id}
          className={`browser-tab${t.id === info.activeTab ? ' active' : ''}`}
          title={t.url}
          onClick={() => control && stream.send({ t: 'tab_switch', id: t.id })}
        >
          <span className="browser-tab-title">{t.title || t.url.replace(/^https?:\/\//, '') || 'Новая вкладка'}</span>
          {control && (
            <button
              className="browser-tab-x"
              onClick={(e) => {
                e.stopPropagation()
                stream.send({ t: 'tab_close', id: t.id })
              }}
              title="Закрыть вкладку"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {control && (
        <button className="btn ghost small" title="Новая вкладка (Alt+T изнутри экрана)" onClick={() => stream.send({ t: 'tab_new' })}>
          ＋
        </button>
      )}
    </div>
  )
}

/** Office-wide extensions: install from the Chrome Web Store, open their menu or settings. */
export function ExtensionsPanel({ screenId, onClose }: { screenId: string; onClose: () => void }) {
  const info = useBrowsers((s) => s[screenId])
  const stream = browserStream(screenId)
  const [link, setLink] = useState('')
  return (
    <div className="panel browser-ext" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <strong className="grow">🧩 Расширения офиса</strong>
        <button className="btn ghost small" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="muted small">Ставятся из Chrome Web Store и работают во всех общих браузерах офиса. Меню расширения открывается отдельной вкладкой.</div>
      {(info?.extensions ?? []).map((e) => (
        <div key={e.id} className="row browser-ext-row">
          <span className="grow" title={e.id}>
            {e.name} <span className="muted small">{e.version}</span>
          </span>
          {e.popup && (
            <button className="btn small" onClick={() => stream.send({ t: 'ext_open', id: e.id, page: 'popup' })}>
              Меню
            </button>
          )}
          {e.options && (
            <button className="btn small" onClick={() => stream.send({ t: 'ext_open', id: e.id, page: 'options' })}>
              Настройки
            </button>
          )}
          <button className="btn small danger" onClick={() => stream.send({ t: 'ext_remove', id: e.id })} title="Удалить у всех">
            ✕
          </button>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!link.trim()) return
          stream.send({ t: 'ext_install', id: link.trim() })
          setLink('')
        }}
      >
        <input className="input" placeholder="Ссылка из Chrome Web Store или ID" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn" type="submit" disabled={!link.trim()}>
          Установить
        </button>
      </form>
    </div>
  )
}
