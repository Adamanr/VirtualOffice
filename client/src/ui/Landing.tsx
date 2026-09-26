import { useCallback, useEffect, useState } from 'react'
import { ago, createOffice, deleteOffice, listOffices, renameOffice, type Office } from '../lib/offices'
import { navigate, parseRoute, randomSpaceId } from '../lib/route'

/** Start menu: your saved offices (they keep their state), a new one, or a link. */
export function Landing() {
  const [offices, setOffices] = useState<Office[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    listOffices()
      .then((list) => {
        setOffices(list)
        setError(null)
      })
      .catch(() => setError('Не удалось загрузить список офисов'))
  }, [])

  // Who's inside changes: keep the counts fresh while the menu is open.
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 10_000)
    return () => clearInterval(timer)
  }, [refresh])

  const create = async () => {
    setBusy(true)
    try {
      const office = await createOffice(name)
      navigate(`/s/${office.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const join = () => {
    const value = link.trim()
    let path = value
    try {
      path = new URL(value, location.origin).pathname
    } catch {
      /* plain id */
    }
    const route = parseRoute(path)
    navigate(route.name === 'space' ? `/s/${route.spaceId}` : `/s/${encodeURIComponent(value)}`)
  }

  return (
    <div className="screen-center">
      <div className="card offices-card">
        <h1>Виртуальный офис</h1>
        <p className="muted">3D-офис в браузере: ходите между столами и переговорками, говорите с теми, кто рядом, показывайте экран на больших экранах.</p>

        <h2 className="offices-title">Офисы</h2>
        {error && <div className="offices-error">{error}</div>}
        {offices === null && !error && <div className="muted small">Загрузка…</div>}
        {offices?.length === 0 && <div className="muted small">Пока ни одного — создайте первый. Всё, что в нём останется (доски, стикеры, рекорды, чат), будет ждать вас в следующий раз.</div>}
        {offices && offices.length > 0 && (
          <ul className="offices-list">
            {offices.map((o) => (
              <OfficeRow key={o.id} office={o} onChange={refresh} onError={setError} />
            ))}
          </ul>
        )}

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && !busy) void create()
          }}
        >
          <input className="input" placeholder="Название нового офиса, например «Скрэнтон»" maxLength={48} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={!name.trim() || busy}>
            Создать офис
          </button>
        </form>

        <div className="divider">или</div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (link.trim()) join()
          }}
        >
          <input className="input" placeholder="Ссылка или id пространства" value={link} onChange={(e) => setLink(e.target.value)} />
          <button className="btn" type="submit" disabled={!link.trim()}>
            Войти
          </button>
        </form>
        <button className="btn ghost small" onClick={() => navigate(`/s/${randomSpaceId()}`)} title="Комната живёт, пока в ней кто-то есть">
          ⚡ Быстрая комната без сохранения
        </button>
      </div>
    </div>
  )
}

function OfficeRow({ office, onChange, onError }: { office: Office; onChange: () => void; onError: (e: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(office.name)

  const rename = async () => {
    setEditing(false)
    if (name.trim() === office.name) return
    try {
      await renameOffice(office.id, name)
      onChange()
    } catch (e) {
      setName(office.name)
      onError((e as Error).message)
    }
  }

  const remove = async () => {
    if (!confirm(`Удалить офис «${office.name}» вместе со всем, что в нём сохранено? Это необратимо.`)) return
    try {
      await deleteOffice(office.id)
      onChange()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <li className="office-row">
      {editing ? (
        <form
          className="office-rename"
          onSubmit={(e) => {
            e.preventDefault()
            void rename()
          }}
        >
          <input className="input" autoFocus maxLength={48} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => e.key === 'Escape' && (setName(office.name), setEditing(false))} />
        </form>
      ) : (
        <button className="office-open" onClick={() => navigate(`/s/${office.id}`)}>
          <span className="office-name">{office.name}</span>
          <span className="muted small">
            {office.online > 0 ? <span className="office-online">● {office.online} внутри</span> : `был активен ${ago(office.updatedAt)}`}
          </span>
        </button>
      )}
      <button className="btn ghost small" title="Переименовать" onClick={() => setEditing(true)}>
        ✏️
      </button>
      <button className="btn ghost small" title={office.online > 0 ? 'Внутри кто-то есть' : 'Удалить'} disabled={office.online > 0} onClick={() => void remove()}>
        🗑
      </button>
    </li>
  )
}
