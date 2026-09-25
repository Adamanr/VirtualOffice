import { lazy, Suspense, useEffect, useState } from 'react'
import { useRoute } from './lib/route'
import { Landing } from './ui/Landing'
import { Lobby } from './ui/Lobby'

// The 3D office (three.js, rapier WASM, drei) is the bulk of the bundle: load it
// while the user is still in the lobby.
const loadOffice = () => import('./ui/OfficeView')
const OfficeView = lazy(() => loadOffice().then((m) => ({ default: m.OfficeView })))

export function App() {
  const route = useRoute()
  const [entered, setEntered] = useState<string | null>(null)
  useEffect(() => {
    if (route.name === 'space') void loadOffice()
  }, [route.name])

  if (route.name === 'landing') return <Landing />
  if (entered !== route.spaceId) return <Lobby spaceId={route.spaceId} onEnter={() => setEntered(route.spaceId)} />
  return (
    <Suspense fallback={<div className="screen-center muted">Загрузка офиса…</div>}>
      <OfficeView spaceId={route.spaceId} />
    </Suspense>
  )
}
