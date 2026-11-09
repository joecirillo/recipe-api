import { ImportError } from './import-error'

// Initial supported-source policy. Workers cannot pin the TCP connection to a validated
// address (no dns.lookup, no custom connect), so arbitrary-domain fetching cannot be made
// rebinding-proof. We narrow to named publishers instead; see README "Recipe import".
export const DEFAULT_ALLOWED_HOSTS = [
  'foodnetwork.com',
  'seriouseats.com',
  'simplehomeedit.com',
  'allrecipes.com',
]

export function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_ALLOWED_HOSTS
  const hosts = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return hosts.length ? hosts : DEFAULT_ALLOWED_HOSTS
}

function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const octets = m.slice(1).map(Number)
  return octets.every((o) => o <= 255) ? octets : null
}

export function isPublicIPv4(o: number[]): boolean {
  const [a, b, c] = o as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function expandIPv6(input: string): number[] | null {
  let addr = input.toLowerCase()
  const zone = addr.indexOf('%')
  if (zone !== -1) addr = addr.slice(0, zone)
  const v4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr)
  if (v4Tail) {
    const o = parseIPv4(v4Tail[1]!)
    if (!o) return null
    addr =
      addr.slice(0, -v4Tail[1]!.length) +
      ((o[0]! << 8) | o[1]!).toString(16) +
      ':' +
      ((o[2]! << 8) | o[3]!).toString(16)
  }
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

export function isPublicIPv6(addr: string): boolean {
  const g = expandIPv6(addr)
  if (!g) return false
  // IPv4-mapped (::ffff:a.b.c.d) and deprecated IPv4-compatible (::a.b.c.d): judge the v4.
  const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255]
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPublicIPv4(embeddedV4(g[6]!, g[7]!))
  }
  // Conservative: only global unicast 2000::/3 is considered public. That already excludes
  // ::, ::1, fc00::/7, fe80::/10, ff00::/8 and NAT64 64:ff9b::/96.
  if ((g[0]! & 0xe000) !== 0x2000) return false
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false // documentation, Teredo
  if (g[0] === 0x2002) return false // 6to4 embeds arbitrary v4
  return true
}

export function isPublicIp(address: string): boolean {
  const v4 = parseIPv4(address)
  if (v4) return isPublicIPv4(v4)
  return isPublicIPv6(address.replace(/^\[|\]$/g, ''))
}

export function hostMatchesAllowlist(hostname: string, allowed: string[]): boolean {
  return allowed.some((a) => hostname === a || hostname.endsWith(`.${a}`))
}

/**
 * Validates a user-supplied or redirect-supplied URL against the import policy.
 * Throws INVALID_URL for malformed input and SOURCE_NOT_ALLOWED (generic message) for
 * policy violations.
 */
export function validateImportUrl(raw: string, allowedHosts: string[]): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ImportError('INVALID_URL', 'URL must be an absolute HTTPS URL.')
  }
  if (url.protocol !== 'https:') {
    throw new ImportError('INVALID_URL', 'URL must be an absolute HTTPS URL.')
  }
  if (url.username || url.password) {
    throw new ImportError('INVALID_URL', 'URL must not contain credentials.')
  }
  const notAllowed = new ImportError('SOURCE_NOT_ALLOWED', 'This source is not supported.')
  if (url.port !== '' && url.port !== '443') throw notAllowed

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const isIpLiteral = hostname.startsWith('[') || parseIPv4(hostname) !== null
  if (isIpLiteral) throw notAllowed // literal IPs are never an allowed source
  if (!hostname.includes('.') || hostname === 'localhost') throw notAllowed
  if (!hostMatchesAllowlist(hostname, allowedHosts)) throw notAllowed
  return url
}
