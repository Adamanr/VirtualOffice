// Load test: N bots join a space and wander around the open space at 15 Hz.
// Usage: node scripts/bots.mjs [socketUrl] [spaceId] [count]
//   node scripts/bots.mjs ws://localhost:4000/socket demo 20
import { Socket } from 'phoenix'

const [url = 'ws://localhost:4000/socket', space = 'demo', countArg = '20'] = process.argv.slice(2)
const count = Number(countArg)
const colors = ['#4f8cff', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#6e56cf']
const AREA = { x0: -19, x1: 3, z0: 0.5, z1: 14.5 }
const rand = (a, b) => a + Math.random() * (b - a)

let moves = 0
let batches = 0
for (let i = 0; i < count; i++) {
  const socket = new Socket(url, { transport: WebSocket })
  socket.connect()
  const id = `bot-${i}-${Math.random().toString(36).slice(2, 10)}`
  const channel = socket.channel(`space:${space}`, { playerId: id, name: `Бот ${i + 1}`, color: colors[i % colors.length] })
  channel.on('batch', () => batches++)
  let pos = { x: rand(AREA.x0, AREA.x1), z: rand(AREA.z0, AREA.z1) }
  let goal = { ...pos }
  let rot = 0
  let pause = 0
  channel
    .join()
    .receive('ok', () => {
      const dt = 1 / 15
      setInterval(() => {
        const dx = goal.x - pos.x
        const dz = goal.z - pos.z
        const d = Math.hypot(dx, dz)
        let anim = 0
        if (pause > 0) {
          pause -= dt
        } else if (d < 0.2) {
          goal = { x: rand(AREA.x0, AREA.x1), z: rand(AREA.z0, AREA.z1) }
          pause = rand(0, 3)
        } else {
          const step = Math.min(d, 3 * dt)
          pos = { x: pos.x + (dx / d) * step, z: pos.z + (dz / d) * step }
          rot = Math.atan2(dx, dz)
          anim = 1
        }
        if (anim || pause > 0) {
          channel.push('move', { s: [+pos.x.toFixed(3), 0, +pos.z.toFixed(3), +rot.toFixed(3), anim] })
          moves++
        }
        if (Math.random() < 0.002) channel.push('react', { emoji: 1 + Math.floor(Math.random() * 5) })
      }, dt * 1000)
    })
    .receive('error', (e) => console.error(`bot ${i} join error`, e))
}

setInterval(() => {
  console.log(`${count} bots · sent ${moves} moves/5s · received ${batches} batches/5s (all bots)`)
  moves = 0
  batches = 0
}, 5000)
