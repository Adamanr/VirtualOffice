import { useState } from 'react'
import { navigate, parseRoute, randomSpaceId } from '../lib/route'

export function Landing() {
  const [link, setLink] = useState('')
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
      <div className="card">
        <h1>Виртуальный офис</h1>
        <p className="muted">3D-офис в браузере: ходите между столами и переговорками, говорите с теми, кто рядом, показывайте экран на больших экранах.</p>
        <button className="btn primary wide" onClick={() => navigate(`/s/${randomSpaceId()}`)}>
          Создать пространство
        </button>
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
      </div>
    </div>
  )
}
