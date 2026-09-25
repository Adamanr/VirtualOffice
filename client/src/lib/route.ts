import { useSyncExternalStore } from 'react'

/** Minimal router: "/" (landing) and "/s/<spaceId>". */
export type Route = { name: 'landing' } | { name: 'space'; spaceId: string }

export function parseRoute(pathname: string): Route {
  const m = /^\/s\/([A-Za-z0-9_-]{1,64})\/?$/.exec(pathname)
  return m ? { name: 'space', spaceId: m[1]! } : { name: 'landing' }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, () => location.pathname)
  return parseRoute(path)
}

export function navigate(path: string) {
  history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function randomSpaceId(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
