// Generates shared/level.json — the office layout read by both the client and the server.
// level.json stays the source of truth for the apps; this script just saves hand-editing
// ~2000 lines of coordinates. Edit here, then run:  node shared/tools/generate-level.mjs
//
// Conventions: meters, Y up, floor points are [x, z]. rotationY = facing direction,
// forward = (sin r, cos r). Wall-mounted items use `elevation` (center height) and face
// into the room.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PI = Math.PI
const r3 = (v) => Math.round(v * 1000) / 1000
const rot = (x, z, r) => [x * Math.cos(r) + z * Math.sin(r), -x * Math.sin(r) + z * Math.cos(r)]
const FACE_N = 0 // facing +Z
const FACE_S = r3(PI) // facing -Z
const FACE_E = r3(PI / 2) // facing +X
const FACE_W = r3(-PI / 2) // facing -X

// Deterministic pseudo-random so the layout is stable between runs.
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const desks = []
const screens = []
const furniture = []
const windows = []
const signs = []
const clocks = []
const add = (type, x, z, rotationY = 0, extra = {}) => furniture.push({ type, position: [r3(x), r3(z)], rotationY, ...extra })

// ── Open space: 6 cubicle clusters of 4 desks (Scranton bullpen) ───────────────────────────
let n = 0
for (const cz of [4.5, 10.5]) {
  for (const cx of [-15, -9, -3]) {
    add('cubicle', cx, cz, 0, { size: [2.8, 1.5] })
    for (const [dx, dz, r] of [[-0.7, 0.35, PI], [0.7, 0.35, PI], [-0.7, -0.35, 0], [0.7, -0.35, 0]]) {
      n++
      const id = `desk_${String(n).padStart(2, '0')}`
      const x = cx + dx
      const z = cz + dz
      desks.push({ id, position: [r3(x), r3(z)], rotationY: r3(r), screenId: `${id}_monitor` })
      const [mx, mz] = rot(0, 0.15, r)
      screens.push({
        id: `${id}_monitor`, kind: 'desk', zoneId: 'open_space', deskId: id,
        position: [r3(x + mx), 1.02, r3(z + mz)], rotationY: r3(r + PI), size: [0.6, 0.34], viewDistance: 6,
      })
    }
    add('trash_bin', cx + 1.6, cz - 1.0)
  }
}
for (const [x, z] of [[-0.6, 7.5], [-6, 7.5], [-12, 7.5], [-19.3, 14.3], [-19.3, -2.3], [3.55, 14.25]]) add('plant', x, z)

// Reception at the entrance.
add('reception_desk', -0.6, 12.2, FACE_E, { size: [2.4, 0.8] })
add('chair', -1.45, 12.2, FACE_E)
add('plant', -0.6, 14.3)
add('sofa', -19.1, 12.6, FACE_E, { size: [2.4, 0.9] })
add('coffee_table', -17.2, 12.6, 0, { size: [0.7, 1.4] })
add('bookshelf', -19.72, 0.6, FACE_E, { size: [0.9, 0.35] })
add('bookshelf', -19.72, 1.6, FACE_E, { size: [0.9, 0.35] })
add('filing_cabinet', -19.57, 2.5, FACE_E)
add('whiteboard', -19.88, 7.75, FACE_E, { elevation: 1.55, size: [2.2, 1.1] })

// Corridor between the conference rooms and the hall.
add('water_cooler', 3.55, -3.7, FACE_W)
add('copier', 3.45, -7.2, FACE_W)
add('filing_cabinet', 0.42, -12.8, FACE_E)
add('filing_cabinet', 0.42, -12.2, FACE_E)
add('filing_cabinet', 0.42, -11.6, FACE_E)
add('bulletin_board', 0.12, -8.5, FACE_E, { elevation: 1.6, size: [1.6, 1.0] })
add('trash_bin', 3.6, -8.4)
add('fire_alarm', 0.12, -4.4, FACE_E, { elevation: 1.35 })
add('plant', 3.4, -14.4)

// ── Conference room ─────────────────────────────────────────────────────────────────────────
add('meeting_table', -15, -9, 0, { size: [4.4, 1.6] })
for (const x of [-1.5, 0, 1.5]) {
  add('chair', -15 + x, -10.25, FACE_N)
  add('chair', -15 + x, -7.75, FACE_S)
}
add('chair', -17.75, -9, FACE_E)
add('conference_phone', -15, -9)
add('whiteboard', -19.88, -9, FACE_E, { elevation: 1.55, size: [2.4, 1.2] })
add('plant', -10.7, -3.7)
add('plant', -19.3, -14.3)
add('picture', -10.12, -6.5, FACE_W, { elevation: 1.7, size: [0.9, 0.7] })
add('picture', -10.12, -11.5, FACE_W, { elevation: 1.7, size: [0.9, 0.7] })
screens.push({ id: 'meeting_room_1_screen', kind: 'wall', zoneId: 'meeting_room_1', position: [-15, 1.6, -14.87], rotationY: 0, size: [3.6, 2.025] })
clocks.push({ position: [-10.12, 2.65, -9], rotationY: FACE_W, radius: 0.22 })

// ── Regional manager's office ───────────────────────────────────────────────────────────────
add('manager_desk', -5, -10.4, FACE_N, { size: [1.8, 0.85] })
add('chair', -5, -11.3, FACE_N)
add('chair', -5.6, -9.2, FACE_S)
add('chair', -4.4, -9.2, FACE_S)
add('sofa', -0.58, -6.2, FACE_W, { size: [2.4, 0.9] })
add('coffee_table', -2.5, -6.2, 0, { size: [0.7, 1.3] })
add('bookshelf', -9.72, -12.6, FACE_E, { size: [0.9, 0.35] })
add('filing_cabinet', -9.57, -11.7, FACE_E)
add('filing_cabinet', -9.57, -11.1, FACE_E)
add('plant', -9.3, -3.7)
add('picture', -9.88, -7.5, FACE_E, { elevation: 1.7, size: [1.2, 0.8] })
add('picture', -0.12, -10.5, FACE_W, { elevation: 1.7, size: [0.7, 0.9] })
screens.push({ id: 'meeting_room_2_screen', kind: 'wall', zoneId: 'meeting_room_2', position: [-5, 1.6, -14.87], rotationY: 0, size: [3.6, 2.025] })
clocks.push({ position: [-0.12, 2.65, -7.5], rotationY: FACE_W, radius: 0.2 })

// ── Hall ────────────────────────────────────────────────────────────────────────────────────
screens.push({ id: 'hall_screen', kind: 'wall', zoneId: 'hall', position: [19.87, 2.0, -5], rotationY: FACE_W, size: [5.6, 3.15] })
add('stage', 18.5, -5, 0, { size: [3, 9] })
add('podium', 17.7, -8.6, FACE_W, { base: 0.3 })
for (const x of [8, 9.4, 10.8, 12.2, 13.6]) {
  for (const z of [-10.4, -9.2, -8, -6.8, -3.2, -2, -0.8, 0.4]) add('chair', x, z, FACE_E)
}
for (const [x, z] of [[5, -14], [5, 4], [19.3, -14.3], [19.3, 4.3]]) add('plant', x, z)
// Games corner: ping-pong table, a dartboard with its throw line, and a piano on stage.
add('pingpong_table', 6, -5.5, 0, { size: [1.525, 2.74] })
add('dartboard', 4.12, -12, FACE_E, { elevation: 1.73 })
add('piano', 19.45, -1.35, FACE_W, { base: 0.3, size: [1.5, 0.6] })
clocks.push({ position: [4.12, 2.7, -8], rotationY: FACE_E, radius: 0.25 })

// ── Break room ──────────────────────────────────────────────────────────────────────────────
add('counter', 12, 14.45, 0, { size: [8, 0.7] })
add('microwave', 9, 14.45, FACE_S)
add('coffee_machine', 10.3, 14.5, FACE_S)
add('fridge', 17.2, 14.45, FACE_S)
add('vending_machine', 6.3, 5.5, FACE_N, { color: '#c8322f' })
add('vending_machine', 7.4, 5.5, FACE_N, { color: '#2f5fc8' })
add('water_cooler', 8.5, 5.4, FACE_N)
for (const tx of [9, 13]) {
  add('cafe_table', tx, 9.5, 0, { size: [1.2, 1.2] })
  add('chair', tx, 8.5, FACE_N)
  add('chair', tx, 10.5, FACE_S)
  add('chair', tx - 1, 9.5, FACE_E)
  add('chair', tx + 1, 9.5, FACE_W)
}
add('rug', 17.9, 10.25, 0, { size: [2.4, 5], color: '#8c6d5a' })
add('sofa', 19.1, 8.6, FACE_W, { size: [2.6, 0.9] })
add('sofa', 19.1, 11.9, FACE_W, { size: [2.6, 0.9] })
add('coffee_table', 16.9, 10.25, 0, { size: [0.9, 1.8] })
add('bulletin_board', 13, 5.12, FACE_N, { elevation: 1.6, size: [1.8, 1.1] })
add('fire_alarm', 14.6, 5.12, FACE_N, { elevation: 1.35 })
add('trash_bin', 15.6, 13.9)
add('trash_bin', 7.7, 13.9)
for (const [x, z] of [[19.3, 14.3], [5, 14.3], [19.3, 5.7]]) add('plant', x, z)
clocks.push({ position: [10.5, 2.6, 5.12], rotationY: FACE_N, radius: 0.22 })

// ── Windows with half-lowered blinds on the outer walls ─────────────────────────────────────
const winS = (x0, x1) => windows.push({ position: [r3((x0 + x1) / 2), 1.9, 14.89], rotationY: FACE_S, size: [x1 - x0, 1.5], blinds: r3(0.3 + rand() * 0.4) })
const winN = (x0, x1) => windows.push({ position: [r3((x0 + x1) / 2), 1.9, -14.89], rotationY: FACE_N, size: [x1 - x0, 1.5], blinds: r3(0.3 + rand() * 0.4) })
const winW = (z0, z1) => windows.push({ position: [-19.89, 1.9, r3((z0 + z1) / 2)], rotationY: FACE_E, size: [z1 - z0, 1.5], blinds: r3(0.3 + rand() * 0.4) })
const winE = (z0, z1) => windows.push({ position: [19.89, 1.9, r3((z0 + z1) / 2)], rotationY: FACE_W, size: [z1 - z0, 1.5], blinds: r3(0.3 + rand() * 0.4) })
for (const [a, b] of [[-17.5, -14.5], [-12, -9], [-6.5, -3.5], [6.8, 9.8], [12.2, 15.2]]) winS(a, b)
for (const [a, b] of [[4, 6.5], [9, 11.5]]) winW(a, b)
for (const [a, b] of [[-13.5, -10.5], [-7.5, -5]]) winW(a, b)
for (const [a, b] of [[-9.5, -7.5], [-2.5, -0.5], [6, 9], [10.5, 13.5]]) winN(a, b)
for (const [a, b] of [[6.5, 9.5], [11, 14]]) winE(a, b)

// ── Signs (rendered from one texture atlas) ─────────────────────────────────────────────────
const branding = { company: 'Дандер Миффлин', tagline: 'Бумажная компания · Отделение в Скрэнтоне' }
signs.push({ text: branding.company, sub: branding.tagline, position: [-0.6, 2.45, 14.88], rotationY: FACE_S, size: [3.6, 0.9], bg: '#1d3557', fg: '#ffffff' })
signs.push({ text: 'Переговорная', position: [-12, 2.6, -2.88], rotationY: FACE_N, size: [1.4, 0.28], bg: '#2b2d31', fg: '#f1eee8' })
signs.push({ text: 'Региональный управляющий', position: [-2, 2.6, -2.88], rotationY: FACE_N, size: [1.6, 0.28], bg: '#2b2d31', fg: '#f1eee8' })
signs.push({ text: 'Актовый зал', position: [3.88, 2.6, 2], rotationY: FACE_W, size: [1.6, 0.3], bg: '#2b2d31', fg: '#f1eee8' })
signs.push({ text: 'Комната отдыха', position: [3.88, 2.75, 10], rotationY: FACE_W, size: [1.8, 0.3], bg: '#2b2d31', fg: '#f1eee8' })
signs.push({ text: 'Лучший в мире босс', position: [-5, 3.0, -14.88], rotationY: FACE_N, size: [1.6, 0.3], bg: '#f1eee8', fg: '#1d3557' })

const level = {
  $comment:
    'GENERATED by shared/tools/generate-level.mjs — edit the script and re-run. Office layout in meters, Y up. Floor points are [x, z]. Zones are resolved in order: the first AABB that contains the point wins. Forward of an object is local +Z rotated by rotationY: (sin r, cos r). Screen planes face their normal (sin r, cos r). If glb is set, the client loads it instead of the procedural geometry (colliders from meshes named col_*); zones/screens/desks always come from this file.',
  version: 2,
  name: 'Офис',
  branding,
  glb: null,
  bounds: { min: [-20, -15], max: [20, 15] },
  spawn: { position: [2.5, 13.3], rotationY: FACE_S },
  wallHeight: 3.6,
  wallThickness: 0.2,
  floorPattern: 'carpet',
  palette: {
    floor: '#8d8f8c', wall: '#e3d9c6', glass: '#9fc6d8', wood: '#9b7048', desk: '#b99570', deskLeg: '#4a4e57',
    chair: '#2f3640', sofa: '#6b4f3f', counter: '#d8d2c4', plant: '#4f8a4b', pot: '#8a6a4f', monitor: '#1d2026',
    stage: '#5c4a3b', partition: '#7d8a99', trim: '#6e5a45', metal: '#bdb7a8', white: '#f2f0ea', paper: '#fbfaf5',
    window: '#cfe8f5', blinds: '#ede6d6', dark: '#2a2c30', book: '#ffffff', decor: '#ffffff', rug: '#ffffff', vending: '#ffffff',
  },
  zones: [
    { id: 'meeting_room_1', name: 'Переговорная', isolated: true, min: [-20, -15], max: [-10, -3], floorColor: '#6f7a86', floorPattern: 'carpet' },
    { id: 'meeting_room_2', name: 'Кабинет управляющего', isolated: true, min: [-10, -15], max: [0, -3], floorColor: '#7a6f66', floorPattern: 'carpet' },
    { id: 'hall', name: 'Актовый зал', isolated: true, min: [4, -15], max: [20, 5], floorColor: '#a88b6a', floorPattern: 'wood' },
    { id: 'kitchen', name: 'Комната отдыха', isolated: false, min: [4, 5], max: [20, 15], floorColor: '#d9d4c7', floorPattern: 'tiles' },
    { id: 'open_space', name: 'Open space', isolated: false, min: [-20, -15], max: [20, 15], floorColor: null },
  ],
  walls: [
    { from: [-20, -15], to: [20, -15] },
    { from: [-20, 15], to: [20, 15], doors: [{ at: 2.5, width: 1.8, closed: true }] },
    { from: [-20, -15], to: [-20, 15] },
    { from: [20, -15], to: [20, 15] },
    { from: [-20, -3], to: [0, -3], material: 'glass', blinds: [[-10, -2.9], [-1.1, 0]], doors: [{ at: -12, width: 1.6 }, { at: -2, width: 1.6 }] },
    { from: [-10, -15], to: [-10, -3] },
    { from: [0, -15], to: [0, -3] },
    { from: [4, -15], to: [4, 5], doors: [{ at: 2, width: 2.4 }] },
    { from: [4, 5], to: [20, 5], doors: [{ at: 16, width: 2 }] },
    { from: [4, 5], to: [4, 15], doors: [{ at: 10, width: 4 }] },
  ],
  // Office Olympics: paper-basketball / fire-drill scoreboard and the drill assembly point.
  activities: {
    scoreboard: { position: [4.12, 1.75, 13.3], rotationY: FACE_E, size: [2.0, 1.25] },
    assembly: { position: [11, -5], radius: 2 },
  },
  desks,
  screens,
  furniture,
  windows,
  signs,
  clocks,
}

const json = JSON.stringify(level, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)(,\n\s+(-?[\d.]+))?\n\s+\]/g, (m, a, b, c, d) =>
  d !== undefined ? `[${a}, ${b}, ${d}]` : `[${a}, ${b}]`,
)
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../level.json')
writeFileSync(out, json + '\n')
console.log(`wrote ${out}: ${desks.length} desks, ${screens.length} screens, ${furniture.length} furniture, ${windows.length} windows`)
