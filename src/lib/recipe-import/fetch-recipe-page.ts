import { ImportError } from './import-error'
import { isPublicIp, validateImportUrl } from './validate-import-url'

export const FETCH_TIMEOUT_MS = 10_000
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
export const MAX_REDIRECTS = 3
export const USER_AGENT = 'foodies-finds-recipe-import/1.0 (+https://foodiesfinds.com)'

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'

export type Resolver = (hostname: string, signal: AbortSignal) => Promise<string[]>

export type FetchRecipePageOptions = {
  allowedHosts: string[]
  fetchImpl?: typeof fetch
  resolve?: Resolver
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

export type FetchedPage = { html: string; finalUrl: string }

// Workers has no dns.lookup; DNS-over-HTTPS is the only way to see resolved addresses.
export function createDohResolver(fetchImpl: typeof fetch = fetch): Resolver {
  return async (hostname, signal) => {
    // A and AAAA run in parallel: each hop costs one round trip of DNS latency, not two.
    const lookups = (
      [
        ['A', 1],
        ['AAAA', 28],
      ] as const
    ).map(async ([type, code]) => {
      const res = await fetchImpl(
        `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`,
        {
          headers: { Accept: 'application/dns-json' },
          signal,
        },
      )
      if (!res.ok) throw new Error('dns failure')
      const body = (await res.json()) as { Answer?: { type: number; data: string }[] }
      return (body.Answer ?? []).filter((a) => a.type === code).map((a) => a.data)
    })
    return (await Promise.all(lookups)).flat()
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

async function readBody(res: Response, maxBytes: number, contentType: string): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    // Content-Length is advisory only; the real count is enforced while streaming.
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new ImportError('RESPONSE_TOO_LARGE', 'The page is too large to import.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

const BLOCKED_STATUSES = new Set([401, 402, 403])

function classifyStatus(res: Response): ImportError {
  const isChallenge = res.headers.get('cf-mitigated') === 'challenge'
  if (res.status === 429 && !isChallenge) {
    return new ImportError(
      'SOURCE_BLOCKED',
      'The site is limiting imports right now. Try again later, or add the recipe manually.',
    )
  }
  if (BLOCKED_STATUSES.has(res.status) || isChallenge) {
    return new ImportError(
      'SOURCE_BLOCKED',
      "This site doesn't allow automatic recipe imports. Add the recipe manually instead.",
    )
  }
  return new ImportError('SOURCE_HTTP_ERROR', `The source site returned an error (${res.status}).`)
}

/**
 * Fetches a recipe page under the import policy. One deadline covers DNS checks, redirects
 * and body consumption. Redirects are followed manually (limit MAX_REDIRECTS) and every hop
 * goes through the same URL + DNS validation. Nothing from the incoming request (API key,
 * cookies) is forwarded.
 *
 * Residual risk: the DNS check and the connection are separate lookups, so a hostile
 * authoritative server could still rebind between them. The host allowlist is what bounds
 * that risk; it is not eliminated by the DNS check alone.
 */
export async function fetchRecipePage(
  rawUrl: string,
  options: FetchRecipePageOptions,
): Promise<FetchedPage> {
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
  const resolve = options.resolve ?? createDohResolver(fetchImpl)
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS)
  const timeout = () =>
    new ImportError('FETCH_TIMEOUT', 'The source site took too long to respond.')

  try {
    let url = validateImportUrl(rawUrl, options.allowedHosts)

    for (let hop = 0; hop <= maxRedirects; hop++) {
      let addresses: string[]
      try {
        addresses = await resolve(url.hostname, controller.signal)
      } catch (error) {
        if (isAbort(error)) throw timeout()
        throw new ImportError('FETCH_FAILED', 'Could not reach the source site.')
      }
      if (addresses.length === 0) {
        throw new ImportError('FETCH_FAILED', 'Could not reach the source site.')
      }
      // Every answer must be public; one private address in a mixed set rejects the host.
      if (!addresses.every(isPublicIp)) {
        throw new ImportError('SOURCE_NOT_ALLOWED', 'This source is not supported.')
      }

      let res: Response
      try {
        res = await fetchImpl(url.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        })
      } catch (error) {
        if (isAbort(error)) throw timeout()
        throw new ImportError('FETCH_FAILED', 'Could not reach the source site.')
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        await res.body?.cancel().catch(() => undefined)
        if (!location || hop === maxRedirects) {
          throw new ImportError('SOURCE_HTTP_ERROR', 'The source site redirected too many times.')
        }
        let next: string
        try {
          next = new URL(location, url).toString()
        } catch {
          throw new ImportError('SOURCE_NOT_ALLOWED', 'This source is not supported.')
        }
        try {
          url = validateImportUrl(next, options.allowedHosts)
        } catch (error) {
          // A redirect to a bad destination is a policy violation, not a bad user input.
          if (error instanceof ImportError) {
            throw new ImportError('SOURCE_NOT_ALLOWED', 'This source is not supported.')
          }
          throw error
        }
        continue
      }

      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        throw classifyStatus(res)
      }

      const contentType = res.headers.get('content-type') ?? ''
      if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType.trim())) {
        await res.body?.cancel().catch(() => undefined)
        throw new ImportError('UNSUPPORTED_CONTENT_TYPE', 'The page is not an HTML document.')
      }

      try {
        const html = await readBody(res, maxBytes, contentType)
        return { html, finalUrl: url.toString() }
      } catch (error) {
        if (error instanceof ImportError) throw error
        if (isAbort(error) || controller.signal.aborted) throw timeout()
        throw new ImportError('FETCH_FAILED', 'Could not read the source page.')
      }
    }
    throw new ImportError('SOURCE_HTTP_ERROR', 'The source site redirected too many times.')
  } finally {
    clearTimeout(timer)
  }
}
