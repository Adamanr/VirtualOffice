import { useEffect, useState } from 'react'

export type DeviceLists = Record<'audioinput' | 'videoinput' | 'audiooutput', MediaDeviceInfo[]>

const empty: DeviceLists = { audioinput: [], videoinput: [], audiooutput: [] }

/** Available media devices; refreshes on plug/unplug. Labels appear only after a permission grant. */
export function useDevices(refreshKey = 0): DeviceLists {
  const [devices, setDevices] = useState<DeviceLists>(empty)
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    let alive = true
    const load = async () => {
      const list = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      if (!alive) return
      const next: DeviceLists = { audioinput: [], videoinput: [], audiooutput: [] }
      for (const d of list) if (d.deviceId && d.kind in next) next[d.kind].push(d)
      setDevices(next)
    }
    void load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => {
      alive = false
      navigator.mediaDevices.removeEventListener('devicechange', load)
    }
  }, [refreshKey])
  return devices
}

const LABELS = { audioinput: 'Микрофон', videoinput: 'Камера', audiooutput: 'Динамики' } as const

export function DeviceSelect({
  kind,
  devices,
  value,
  onChange,
}: {
  kind: keyof DeviceLists
  devices: DeviceLists
  value: string | null
  onChange: (id: string) => void
}) {
  const list = devices[kind]
  if (kind === 'audiooutput' && list.length === 0) return null
  return (
    <label className="field">
      <span>{LABELS[kind]}</span>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={list.length === 0}>
        {list.length === 0 && <option value="">Не найдено</option>}
        {list.length > 0 && !value && <option value="">По умолчанию</option>}
        {list.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${LABELS[kind]} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}
