import { describe, expect, it } from 'vitest'
import { ImportError } from './import-error'
import {
  DEFAULT_ALLOWED_HOSTS,
  isPublicIp,
  parseAllowedHosts,
  validateImportUrl,
} from './validate-import-url'

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof ImportError) return e.code
    throw e
  }
  return null
}
const check = (u: string) => code(() => validateImportUrl(u, DEFAULT_ALLOWED_HOSTS))

describe('validateImportUrl', () => {
  it('accepts allowlisted https URLs, with subdomains and explicit 443', () => {
    expect(check('https://www.allrecipes.com/recipe/1/x/')).toBeNull()
    expect(check('https://seriouseats.com:443/x')).toBeNull()
  })

  it.each(['not a url', '/relative', 'http://allrecipes.com/x', 'ftp://allrecipes.com/x'])(
    'rejects malformed or non-https: %s',
    (u) => expect(check(u)).toBe('INVALID_URL'),
  )

  it('rejects embedded credentials', () => {
    expect(check('https://user:pw@allrecipes.com/x')).toBe('INVALID_URL')
  })

  it.each([
    'https://allrecipes.com:8443/x',
    'https://evil.com/x',
    'https://allrecipes.com.evil.com/x',
    'https://notallrecipes.com/x',
    'https://localhost/x',
    'https://intranet/x',
    'https://127.0.0.1/x',
    'https://2130706433/x',
    'https://0x7f.1/x',
    'https://[::1]/x',
    'https://[::ffff:127.0.0.1]/x',
    'https://[::ffff:10.0.0.1]/x',
    'https://8.8.8.8/x',
  ])('rejects non-supported destination: %s', (u) => expect(check(u)).toBe('SOURCE_NOT_ALLOWED'))
})

describe('isPublicIp', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '::ffff:a00:1',
    '64:ff9b::7f00:1',
    '2001:db8::1',
    '2002:7f00:1::',
    'not-an-ip',
  ])('treats %s as non-public', (ip) => expect(isPublicIp(ip)).toBe(false))

  it.each(['8.8.8.8', '151.101.1.1', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'treats %s as public',
    (ip) => expect(isPublicIp(ip)).toBe(true),
  )
})

describe('parseAllowedHosts', () => {
  it('uses the defaults only when the variable is unset', () => {
    expect(parseAllowedHosts(undefined)).toEqual(DEFAULT_ALLOWED_HOSTS)
  })

  it('parses, trims, lowercases and drops blanks', () => {
    expect(parseAllowedHosts(' Example.com, ,b.org ')).toEqual(['example.com', 'b.org'])
  })

  it('allows nothing when explicitly set to empty', () => {
    const hosts = parseAllowedHosts('')
    expect(hosts).toEqual([])
    expect(code(() => validateImportUrl('https://allrecipes.com/x', hosts))).toBe(
      'SOURCE_NOT_ALLOWED',
    )
  })
})
