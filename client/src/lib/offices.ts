import { useEffect, useState } from 'react'

/** A saved office (server: Office.Offices): its state survives between visits. */
export interface Office {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** People inside right now. */
  online: number
}

const ERRORS: Record<string, string> = {
  bad_name: 'Название — от 1 до 48 символов',
  limit: 'Слишком много офисов на сервере',
  not_empty: 'Внутри кто-то есть — удалить можно только пустой офис',
  not_found: 'Такого офиса нет',
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(ERRORS[body.error as string] ?? `Ошибка сервера (${res.status})`)
  return body as T
}

export const listOffices = () => request<{ offices: Office[] }>('/api/offices').then((r) => r.offices)

export const createOffice = (name: string) =>
  request<{ office: Office }>('/api/offices', { method: 'POST', body: JSON.stringify({ name }) }).then((r) => r.office)

export const renameOffice = (id: string, name: string) =>
  request<{ office: Office }>(`/api/offices/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }).then((r) => r.office)

export const deleteOffice = (id: string) => request<void>(`/api/offices/${id}`, { method: 'DELETE' })

const names = new Map<string, Office | null>()

/** The saved office behind a space id, or null for a throwaway room (undefined while loading). */
export function useOffice(spaceId: string): Office | null | undefined {
  const [office, setOffice] = useState(names.get(spaceId))
  useEffect(() => {
    let alive = true
    request<{ office: Office }>(`/api/offices/${spaceId}`)
      .then((r) => r.office)
      .catch(() => null)
      .then((o) => {
        names.set(spaceId, o)
        if (alive) setOffice(o)
      })
    return () => {
      alive = false
    }
  }, [spaceId])
  return office
}

/** "только что", "5 мин назад", "вчера"… */
export function ago(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d === 1) return 'вчера'
  if (d < 30) return `${d} дн назад`
  return new Date(ts).toLocaleDateString('ru-RU')
}
