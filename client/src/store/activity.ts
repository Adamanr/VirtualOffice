import { create } from 'zustand'
import type { DrillState, Score, Toss } from '@shared/protocol.gen'

/** Things a player can visibly hold for a while after an activity. */
export type HeldItem = 'coffee' | 'water' | 'snack' | 'paper' | 'popcorn' | 'yogurt' | 'cake' | 'lunch'

/** Visible state of an appliance (running microwave, open fridge, jammed copier…). */
export type DeviceState = 'running' | 'open' | 'jammed' | 'brewing' | 'glug' | 'printing' | 'shake'

interface ActivityState {
  scores: Score[]
  drill: DrillState | null
  /** deskId → who put the stapler in jello. */
  jellos: Record<string, string>
  held: Record<string, { item: HeldItem; until: number; color?: string }>
  /** Comic speech bubble over a player's head. */
  bubbles: Record<string, { text: string; until: number }>
  /** Paper balls: flying ones and the litter they leave behind. */
  tosses: Toss[]
  devices: Record<string, { state: DeviceState; until: number }>
  /** Paper avalanches left on the floor next to the copier. */
  piles: { id: string; x: number; z: number; until: number }[]
}

export const useActivity = create<ActivityState>(() => ({
  scores: [],
  drill: null,
  jellos: {},
  held: {},
  bubbles: {},
  tosses: [],
  devices: {},
  piles: [],
}))

export function resetActivity() {
  useActivity.setState({ scores: [], drill: null, jellos: {}, held: {}, bubbles: {}, tosses: [], devices: {}, piles: [] })
}

export function hold(playerId: string, item: HeldItem, seconds = 40, color?: string) {
  useActivity.setState((s) => ({ held: { ...s.held, [playerId]: { item, until: Date.now() + seconds * 1000, color } } }))
}

export function say(playerId: string, text: string, seconds = 5) {
  useActivity.setState((s) => ({ bubbles: { ...s.bubbles, [playerId]: { text, until: Date.now() + seconds * 1000 } } }))
}

export function setDevice(propId: string, state: DeviceState, seconds: number) {
  useActivity.setState((s) => ({ devices: { ...s.devices, [propId]: { state, until: Date.now() + seconds * 1000 } } }))
}

/** Gestures read every frame by avatars (outside React). */
export type Gesture = 'use' | 'kick' | 'hop' | 'throw' | 'bonk' | 'shiver'
export const gestures = new Map<string, { type: Gesture; start: number; duration: number }>()

export function gesture(playerId: string, type: Gesture, duration = 0.8) {
  gestures.set(playerId, { type, start: performance.now(), duration: duration * 1000 })
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __activity: typeof useActivity }).__activity = useActivity
}
