import { useState } from 'react'
import { useRoute } from './lib/route'
import { Landing } from './ui/Landing'
import { Lobby } from './ui/Lobby'
import { OfficeView } from './ui/OfficeView'

export function App() {
  const route = useRoute()
  const [entered, setEntered] = useState<string | null>(null)
  if (route.name === 'landing') return <Landing />
  if (entered !== route.spaceId) return <Lobby spaceId={route.spaceId} onEnter={() => setEntered(route.spaceId)} />
  return <OfficeView spaceId={route.spaceId} />
}
