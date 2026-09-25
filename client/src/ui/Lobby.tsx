import { useState } from 'react'
import { AVATAR_COLORS, useProfile } from '../store/profile'

/** Entry screen: name and avatar color (devices are added in the media section). */
export function Lobby({ spaceId, onEnter }: { spaceId: string; onEnter: () => void }) {
  const profile = useProfile()
  const [name, setName] = useState(profile.name)
  const valid = name.trim().length >= 1 && name.trim().length <= 32

  return (
    <div className="screen-center">
      <form
        className="card lobby"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          profile.update({ name: name.trim() })
          onEnter()
        }}
      >
        <h2>Вход в пространство</h2>
        <p className="muted small">
          Ссылка для коллег: <code>{location.origin}/s/{spaceId}</code>
        </p>
        <label className="field">
          <span>Имя</span>
          <input className="input" autoFocus maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас зовут?" />
        </label>
        <div className="field">
          <span>Цвет аватара</span>
          <div className="swatches">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${profile.color === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => profile.update({ color: c })}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <button className="btn primary wide" type="submit" disabled={!valid}>
          Войти
        </button>
      </form>
    </div>
  )
}
