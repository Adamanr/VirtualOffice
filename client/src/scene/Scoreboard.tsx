import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { level } from '../lib/level'
import { useActivity } from '../store/activity'

const W = 1024

const fmt = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} с`)

/** "Office Olympics" board in the break room: paper-basketball points, bonks, drill times, yogurt-lid medals. */
export function Scoreboard() {
  const cfg = level.activities?.scoreboard
  const scores = useActivity((s) => s.scores)
  const drill = useActivity((s) => s.drill)
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [canvas])
  useEffect(() => () => texture.dispose(), [texture])

  useEffect(() => {
    if (!cfg) return
    const H = Math.round((W * cfg.size[1]) / cfg.size[0])
    canvas.width = W
    canvas.height = H
    const g = canvas.getContext('2d')!
    g.fillStyle = '#1f3d2b'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#c9a227'
    g.lineWidth = 10
    g.strokeRect(12, 12, W - 24, H - 24)
    g.fillStyle = '#f5e6b8'
    g.textAlign = 'center'
    g.font = '700 58px Georgia, serif'
    g.fillText('ОФИСНАЯ ОЛИМПИАДА', W / 2, 84)
    g.font = '400 26px system-ui, sans-serif'
    g.fillStyle = '#cfe3d4'
    g.fillText('G — бумажный баскетбол в урну · пожарная тревога — в коридоре и на кухне', W / 2, 124)

    if (drill?.active) {
      g.fillStyle = '#e5484d'
      g.fillRect(40, 146, W - 80, 54)
      g.fillStyle = '#ffffff'
      g.font = '700 34px system-ui, sans-serif'
      g.fillText(`🔥 ИДЁТ ЭВАКУАЦИЯ · в зале уже ${drill.evacuated.length}`, W / 2, 185)
    }

    const top = drill?.active ? 240 : 190
    g.textAlign = 'left'
    g.font = '600 26px system-ui, sans-serif'
    g.fillStyle = '#9dbfa7'
    const cols = [60, 520, 650, 780, 900]
    ;['Участник', 'Очки', 'Бонки', 'Эвакуация', 'Медали'].forEach((h, i) => {
      g.textAlign = i === 0 ? 'left' : 'center'
      g.fillText(h, cols[i]! + (i === 0 ? 0 : 20), top)
    })
    if (scores.length === 0) {
      g.textAlign = 'center'
      g.fillStyle = '#f5e6b8'
      g.font = 'italic 34px Georgia, serif'
      g.fillText('Пока пусто. Кто первый?', W / 2, top + 90)
    }
    scores.slice(0, 8).forEach((s, i) => {
      const y = top + 52 + i * 48
      g.fillStyle = i === 0 ? 'rgba(201,162,39,0.18)' : 'rgba(255,255,255,0.04)'
      g.fillRect(44, y - 34, W - 88, 44)
      g.textAlign = 'left'
      g.fillStyle = s.color
      g.beginPath()
      g.arc(cols[0]! + 12, y - 12, 10, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = '600 30px system-ui, sans-serif'
      g.fillText(`${i + 1}. ${s.name}`.slice(0, 26), cols[0]! + 34, y)
      g.textAlign = 'center'
      g.fillText(String(s.points), cols[1]! + 20, y)
      g.fillText(String(s.bonks), cols[2]! + 20, y)
      g.fillText(fmt(s.drillMs), cols[3]! + 20, y)
      // Medals are yogurt lids, as tradition demands.
      for (let m = 0; m < Math.min(s.medals, 5); m++) {
        g.fillStyle = '#e8e2d4'
        g.beginPath()
        g.arc(cols[4]! - 16 + m * 18, y - 12, 12, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#c9a227'
        g.beginPath()
        g.arc(cols[4]! - 16 + m * 18, y - 12, 6, 0, Math.PI * 2)
        g.fill()
      }
    })
    texture.needsUpdate = true
  }, [cfg, scores, drill, canvas, texture])

  if (!cfg) return null
  const [x, y, z] = cfg.position
  const nx = Math.sin(cfg.rotationY) * 0.03
  const nz = Math.cos(cfg.rotationY) * 0.03
  return (
    <group position={[x + nx, y, z + nz]} rotation-y={cfg.rotationY}>
      <mesh position-z={-0.015}>
        <boxGeometry args={[cfg.size[0] + 0.08, cfg.size[1] + 0.08, 0.03]} />
        <meshLambertMaterial color="#6e5a45" />
      </mesh>
      <mesh>
        <planeGeometry args={cfg.size} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}
