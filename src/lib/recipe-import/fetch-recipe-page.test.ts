import { describe, expect, it, vi } from 'vitest'
import { createDohResolver, fetchRecipePage, type Resolver } from './fetch-recipe-page'
import { ImportError } from './import-error'
import { DEFAULT_ALLOWED_HOSTS } from './validate-import-url'

const PUBLIC: Resolver = async () => ['151.101.1.1']
const html = (body = '<html></html>', init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  })
const redirect = (to: string, status = 302) =>
  new Response(null, { status, headers: { location: to } })

async function failure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    if (e instanceof ImportError) return e.code
    throw e
  }
  return null
}

const run = (
  url: string,
  fetchImpl: typeof fetch,
  extra: Partial<Parameters<typeof fetchRecipePage>[1]> = {},
) =>
  fetchRecipePage(url, {
    allowedHosts: DEFAULT_ALLOWED_HOSTS,
    fetchImpl,
    resolve: PUBLIC,
    ...extra,
  })

describe('fetchRecipePage', () => {
  it('returns html and the final URL, sending only the identifying headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => html('<p>ok</p>'))
    const page = await run('https://allrecipes.com/r/1', fetchImpl)
    expect(page).toEqual({ html: '<p>ok</p>', finalUrl: 'https://allrecipes.com/r/1' })
    const init = fetchImpl.mock.calls[0]![1]!
    expect(init.redirect).toBe('manual')
    const headers = init.headers as Record<string, string>
    expect(Object.keys(headers).sort()).toEqual(['Accept', 'User-Agent'])
  })

  it('follows allowed redirects and reports the final URL', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('/moved'))
      .mockResolvedValueOnce(html())
    const page = await run('https://allrecipes.com/a', fetchImpl)
    expect(page.finalUrl).toBe('https://allrecipes.com/moved')
  })

  it('rejects a redirect to a blocked destination without requesting it', async () => {
    for (const target of [
      'https://169.254.169.254/latest',
      'http://allrecipes.com/x',
      'https://evil.com/',
    ]) {
      const fetchImpl = vi.fn<typeof fetch>(async () => redirect(target))
      expect(await failure(run('https://allrecipes.com/a', fetchImpl))).toBe('SOURCE_NOT_ALLOWED')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('enforces the redirect limit and loops', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => redirect('https://allrecipes.com/loop'))
    expect(await failure(run('https://allrecipes.com/loop', fetchImpl))).toBe('SOURCE_HTTP_ERROR')
    expect(fetchImpl).toHaveBeenCalledTimes(4) // initial + 3 redirects
  })

  it('rejects when any resolved address is non-public (mixed answers) and never fetches', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    for (const answers of [
      ['151.101.1.1', '10.0.0.5'],
      ['2606:4700::1111', '::1'],
      ['::ffff:127.0.0.1'],
    ]) {
      const code = await failure(
        run('https://allrecipes.com/a', fetchImpl, { resolve: async () => answers }),
      )
      expect(code).toBe('SOURCE_NOT_ALLOWED')
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('re-validates DNS on each redirect hop', async () => {
    const resolve = vi
      .fn<Resolver>()
      .mockResolvedValueOnce(['151.101.1.1'])
      .mockResolvedValueOnce(['127.0.0.1'])
    const fetchImpl = vi.fn<typeof fetch>(async () => redirect('https://www.allrecipes.com/b'))
    expect(await failure(run('https://allrecipes.com/a', fetchImpl, { resolve }))).toBe(
      'SOURCE_NOT_ALLOWED',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps DNS failure and connection failure to FETCH_FAILED', async () => {
    const f = vi.fn<typeof fetch>()
    expect(
      await failure(
        run('https://allrecipes.com/a', f, {
          resolve: async () => {
            throw new Error('x')
          },
        }),
      ),
    ).toBe('FETCH_FAILED')
    expect(await failure(run('https://allrecipes.com/a', f, { resolve: async () => [] }))).toBe(
      'FETCH_FAILED',
    )
    const boom = vi.fn<typeof fetch>(async () => {
      throw new TypeError('net down 10.0.0.1')
    })
    expect(await failure(run('https://allrecipes.com/a', boom))).toBe('FETCH_FAILED')
  })

  it.each([
    [403, 'SOURCE_BLOCKED'],
    [429, 'SOURCE_BLOCKED'],
    [401, 'SOURCE_BLOCKED'],
    [402, 'SOURCE_BLOCKED'],
    [404, 'SOURCE_HTTP_ERROR'],
    [500, 'SOURCE_HTTP_ERROR'],
  ])('maps upstream %i to %s without leaking the body', async (status, expected) => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('SECRET upstream body', { status }),
    )
    try {
      await run('https://allrecipes.com/a', fetchImpl)
      expect.unreachable()
    } catch (e) {
      expect((e as ImportError).code).toBe(expected)
      expect((e as ImportError).message).not.toContain('SECRET')
    }
  })

  it.each([
    [402, "doesn't allow automatic recipe imports"],
    [403, "doesn't allow automatic recipe imports"],
    [429, 'Try again later'],
  ])('tells the user what to do after an upstream %i', async (status, wording) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status }))
    try {
      await run('https://allrecipes.com/a', fetchImpl)
      expect.unreachable()
    } catch (e) {
      expect((e as ImportError).message).toContain(wording)
    }
  })

  it('treats a Cloudflare challenge as blocked', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('', { status: 503, headers: { 'cf-mitigated': 'challenge' } }),
    )
    expect(await failure(run('https://allrecipes.com/a', fetchImpl))).toBe('SOURCE_BLOCKED')
  })

  it('rejects unsupported content types', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
    )
    expect(await failure(run('https://allrecipes.com/a', fetchImpl))).toBe(
      'UNSUPPORTED_CONTENT_TYPE',
    )
  })

  it('enforces the size cap while streaming, ignoring a lying or missing Content-Length', async () => {
    const big = 'x'.repeat(2000)
    const lying = vi.fn<typeof fetch>(async () =>
      html(big, { headers: { 'content-type': 'text/html', 'content-length': '10' } }),
    )
    expect(await failure(run('https://allrecipes.com/a', lying, { maxBytes: 1000 }))).toBe(
      'RESPONSE_TOO_LARGE',
    )

    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600))
      },
      cancel() {
        cancelled = true
      },
    })
    const endless = vi.fn<typeof fetch>(
      async () => new Response(stream, { headers: { 'content-type': 'text/html' } }),
    )
    expect(await failure(run('https://allrecipes.com/a', endless, { maxBytes: 1000 }))).toBe(
      'RESPONSE_TOO_LARGE',
    )
    expect(cancelled).toBe(true)
  })

  it('times out before headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_u, init) =>
        new Promise((_res, rej) => {
          init!.signal!.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    expect(await failure(run('https://allrecipes.com/a', fetchImpl, { timeoutMs: 20 }))).toBe(
      'FETCH_TIMEOUT',
    )
  })

  it('times out during body consumption', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_u, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html>'))
          init!.signal!.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          )
        },
      })
      return new Response(stream, { headers: { 'content-type': 'text/html' } })
    })
    expect(await failure(run('https://allrecipes.com/a', fetchImpl, { timeoutMs: 20 }))).toBe(
      'FETCH_TIMEOUT',
    )
  })

  it('makes no resolver or fetch call for a prohibited URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const resolve = vi.fn<Resolver>()
    for (const u of [
      'http://allrecipes.com/',
      'https://127.0.0.1/',
      'https://evil.com/',
      'https://u:p@allrecipes.com/',
    ]) {
      await failure(run(u, fetchImpl, { resolve }))
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('createDohResolver', () => {
  it('looks up A and AAAA concurrently and merges the answers', async () => {
    let inFlight = 0
    let peak = 0
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      const type = new URL(String(input)).searchParams.get('type')
      return Response.json({
        Answer:
          type === 'A'
            ? [
                { type: 5, data: 'cname.example.' },
                { type: 1, data: '151.101.1.1' },
              ]
            : [{ type: 28, data: '2606:4700::1111' }],
      })
    })
    const addresses = await createDohResolver(fetchImpl)(
      'allrecipes.com',
      new AbortController().signal,
    )
    expect(peak).toBe(2)
    expect(addresses.sort()).toEqual(['151.101.1.1', '2606:4700::1111'])
  })

  it('fails the whole lookup if either query fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      new URL(String(input)).searchParams.get('type') === 'A'
        ? Response.json({ Answer: [] })
        : new Response('', { status: 500 }),
    )
    await expect(
      createDohResolver(fetchImpl)('allrecipes.com', new AbortController().signal),
    ).rejects.toThrow()
  })
})
