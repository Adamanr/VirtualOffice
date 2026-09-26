import { propPoint, type Prop } from '../lib/level'

export const PONG_HALF_W = 0.7625
export const PONG_HALF_L = 1.37
export const TABLE_TOP = 0.76
export const DART_RADIUS = 0.2 // m, outer edge of the double ring on our board
export const OCHE = 2.37

/** Where a player stands/sits for a game and which way they face. */
export function activitySpot(prop: Prop, kind: 'pong' | 'darts' | 'piano', side: 'a' | 'b' = 'a') {
  switch (kind) {
    case 'pong': {
      const lz = side === 'a' ? -(PONG_HALF_L + 0.55) : PONG_HALF_L + 0.55
      const [x, , z] = propPoint(prop, 0, 0, lz)
      return { x, z, rotY: side === 'a' ? prop.rotY : prop.rotY + Math.PI }
    }
    case 'darts': {
      const [x, , z] = propPoint(prop, 0, 0, OCHE + 0.05)
      return { x, z, rotY: prop.rotY + Math.PI }
    }
    case 'piano': {
      const [x, , z] = propPoint(prop, 0, 0, 0.78)
      return { x, z, rotY: prop.rotY + Math.PI, y: 0.3 }
    }
  }
}

/** Ball position on the table (world) from table-local x/z. */
export function tablePoint(prop: Prop, lx: number, lz: number, y = TABLE_TOP): [number, number, number] {
  return propPoint(prop, lx, y, lz)
}
