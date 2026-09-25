import { create } from 'zustand'

export const AVATAR_COLORS = ['#4f8cff', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#6e56cf'] as const

export interface Profile {
  name: string
  color: string
  micId: string | null
  camId: string | null
  speakerId: string | null
  /** Enter with the microphone on / camera on. */
  micOn: boolean
  camOn: boolean
  pushToTalk: boolean
}

const KEY = 'vo.profile'

function load(): Profile {
  const fallback: Profile = {
    name: '',
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!,
    micId: null,
    camId: null,
    speakerId: null,
    micOn: true,
    camOn: false,
    pushToTalk: false,
  }
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Profile>) }
  } catch {
    return fallback
  }
}

export const useProfile = create<Profile & { update: (p: Partial<Profile>) => void }>((set, get) => ({
  ...load(),
  update: (p) => {
    set(p)
    const { update: _update, ...rest } = { ...get(), ...p }
    try {
      localStorage.setItem(KEY, JSON.stringify(rest))
    } catch {
      /* storage unavailable: keep in memory */
    }
  },
}))
