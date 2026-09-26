import { lookup } from 'node:dns/promises'
import net from 'node:net'

/**
 * SSRF guard: the shared browser may only reach the public internet.
 * Private, loopback, link-local (cloud metadata!), CGNAT, multicast and
 * reserved ranges are refused, for IPv4 and IPv6 (incl. IPv4-mapped).
 */
const V4_BLOCKED = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const v4num = (ip) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)

function blockedV4(ip) {
  const n = v4num(ip)
  return V4_BLOCKED.some(([base, bits]) => {
    const size = 2 ** (32 - bits)
    const b = v4num(base)
    return n >= b && n < b + size
  })
}

function blockedV6(ip) {
  const lower = ip.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped) return blockedV4(mapped[1])
  if (lower === '::' || lower === '::1') return true
  const first = parseInt(lower.split(':')[0] || '0', 16)
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 || // multicast
    lower.startsWith('64:ff9b:') || // NAT64 could reach internal v4
    lower.startsWith('2001:db8:')
  )
}

export function isBlockedIp(ip) {
  const kind = net.isIP(ip)
  if (kind === 4) return blockedV4(ip)
  if (kind === 6) return blockedV6(ip)
  return true
}

/**
 * Resolves `host` and returns an address the browser may connect to, or null.
 * If any resolved address is internal the host is refused outright.
 */
export async function resolvePublic(host, { allowPrivate = false } = {}) {
  const h = host.replace(/^\[|\]$/g, '')
  if (net.isIP(h)) return allowPrivate || !isBlockedIp(h) ? h : null
  if (!allowPrivate && (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local'))) return null
  let addrs
  try {
    addrs = await lookup(h, { all: true, verbatim: true })
  } catch {
    return null
  }
  if (addrs.length === 0) return null
  if (!allowPrivate && addrs.some((a) => isBlockedIp(a.address))) return null
  // Prefer IPv4: many hosts (and containers) have no working IPv6 route, and a
  // dead AAAA first would make streaming sites fail with "something went wrong".
  return (addrs.find((a) => a.family === 4) ?? addrs[0]).address
}

/** Only web pages: http(s). No file:, chrome:, javascript:, data: navigations. */
export function normalizeUrl(input) {
  let text = String(input ?? '').trim()
  if (!text || text.length > 2048) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    // "example.com" or a search query
    text = /^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(text) ? `https://${text}` : `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
  }
  let url
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  return url.toString()
}
