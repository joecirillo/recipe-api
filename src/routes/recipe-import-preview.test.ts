import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../middleware/auth'
import { errorHandler } from '../middleware/error-handler'
import { rateLimiterMiddleware } from '../middleware/rate-limiter'
import * as recipeService from '../services/recipe-service'
import { recipeRouter } from './recipes'

const createDb = vi.fn(() => ({}))
vi.mock('../db/client', () => ({ createDb: () => createDb() }))
vi.mock('../services/recipe-service')

type Bindings = {
  USER_API_KEY: string
  ADMIN_API_KEY: string
  R2_PUBLIC_URL: string
  HYPERDRIVE: { connectionString: string }
}
const ENV: Bindings = {
  USER_API_KEY: 'user',
  ADMIN_API_KEY: 'admin',
  R2_PUBLIC_URL: 'https://cdn.test',
  HYPERDRIVE: { connectionString: 'postgresql://test' },
}

function buildApp() {
  const app = new Hono<{ Bindings: Bindings }>()
  app.onError(errorHandler)
  app.use('*', authMiddleware)
  app.use('*', rateLimiterMiddleware)
  app.route('/recipes', recipeRouter as unknown as Hono<{ Bindings: Bindings }>)
  return app
}

const RECIPE_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Tomato Soup',
  author: { '@type': 'Person', name: 'Pat Cook' },
  image: '/img/soup.jpg',
  recipeIngredient: ['2 tomatoes', '1 cup stock'],
  recipeInstructions: ['Chop.', 'Simmer.'],
})}</script></head></html>`

let pageResponse: () => Response
const fetchMock = vi.fn<typeof fetch>(async (input) => {
  const url = String(input)
  if (url.startsWith('https://cloudflare-dns.com/')) {
    const type = new URL(url).searchParams.get('type')
    return Response.json({ Answer: type === 'A' ? [{ type: 1, data: '151.101.1.1' }] : [] })
  }
  return pageResponse()
})

type Json = { code?: string; message?: string; data: any }
const json = async (res: Response) => (await res.json()) as Json

const outbound = () => fetchMock.mock.calls.length

function post(body: unknown, key: string | null = 'user') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['X-Api-Key'] = key
  return buildApp().request(
    '/recipes/import-preview',
    { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) },
    ENV,
  )
}

beforeEach(() => {
  fetchMock.mockClear()
  createDb.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  pageResponse = () => new Response(RECIPE_HTML, { headers: { 'content-type': 'text/html' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('POST /recipes/import-preview', () => {
  it('returns a preview resolved against the final URL, with no database access', async () => {
    const res = await post({ url: 'https://www.allrecipes.com/recipe/1/soup/' })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.message).toBe('Recipe parsed')
    expect(body.data.recipe.name).toBe('Tomato Soup')
    expect(body.data.recipe.imageUrl).toBe('https://www.allrecipes.com/img/soup.jpg')
    expect(body.data.source.sourceUrl).toBe('https://www.allrecipes.com/recipe/1/soup/')
    expect(body.data.source.originalAuthor).toBe('Pat Cook')
    expect(createDb).not.toHaveBeenCalled()
    expect(vi.mocked(recipeService.createRecipe)).not.toHaveBeenCalled()
  })

  it('accepts the admin key as well as the user key', async () => {
    expect((await post({ url: 'https://allrecipes.com/r' }, 'admin')).status).toBe(200)
  })

  it.each([null, 'wrong'])('returns 401 and fetches nothing for key %s', async (key) => {
    const res = await post({ url: 'https://allrecipes.com/r' }, key)
    expect(res.status).toBe(401)
    expect(outbound()).toBe(0)
  })

  it('returns 429 and fetches nothing once the rate limit is hit', async () => {
    const app = buildApp()
    const send = () =>
      app.request(
        '/recipes/import-preview',
        {
          method: 'POST',
          headers: { 'X-Api-Key': 'rate-limit-key-user', 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://allrecipes.com/r' }),
        },
        { ...ENV, USER_API_KEY: 'rate-limit-key-user' },
      )
    for (let i = 0; i < 60; i++) expect((await send()).status).toBe(200)
    const before = outbound()
    expect((await send()).status).toBe(429)
    expect(outbound()).toBe(before)
  })

  it.each([
    ['malformed JSON', '{nope'],
    ['missing url', {}],
    ['non-string url', { url: 5 }],
    ['relative url', { url: '/recipe' }],
    ['http url', { url: 'http://allrecipes.com/r' }],
    ['credentials', { url: 'https://a:b@allrecipes.com/r' }],
  ])('rejects %s with INVALID_URL before any fetch', async (_n, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await json(res)).code).toBe('INVALID_URL')
    expect(outbound()).toBe(0)
  })

  it.each([
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://allrecipes.com:8443/',
    'https://example.org/',
  ])('rejects %s as SOURCE_NOT_ALLOWED with a generic message', async (url) => {
    const res = await post({ url })
    const body = await json(res)
    expect(res.status).toBe(400)
    expect(body.code).toBe('SOURCE_NOT_ALLOWED')
    expect(body.message).toBe('This source is not supported.')
    expect(outbound()).toBe(0)
  })

  it('returns NO_RECIPE_FOUND (400) for pages without Recipe markup', async () => {
    pageResponse = () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    const res = await post({ url: 'https://allrecipes.com/r' })
    expect(res.status).toBe(400)
    expect((await json(res)).code).toBe('NO_RECIPE_FOUND')
  })

  it('returns SOURCE_BLOCKED without exposing upstream content', async () => {
    pageResponse = () => new Response('<html>Access denied SECRET</html>', { status: 403 })
    const res = await post({ url: 'https://allrecipes.com/r' })
    const text = await res.text()
    expect(res.status).toBe(400)
    expect(text).toContain('SOURCE_BLOCKED')
    expect(text).not.toContain('SECRET')
  })

  it('does not forward the API key to the source site', async () => {
    await post({ url: 'https://allrecipes.com/r' })
    const pageCall = fetchMock.mock.calls.find(([u]) => !String(u).includes('cloudflare-dns'))!
    const headers = pageCall[1]!.headers as Record<string, string>
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('x-api-key')
    expect(Object.values(headers)).not.toContain(ENV.USER_API_KEY)
  })
})

describe('provenance on save', () => {
  const SAVE = {
    name: 'Tomato Soup',
    calories: 100,
    servings: 2,
    cookingTime: 10,
    preparationTime: 5,
    cuisine: { name: 'Italian' },
    ingredients: [{ name: '2 tomatoes', unitId: null, quantity: null }],
    steps: [{ stepNumber: 1, description: 'Chop' }],
  }
  const saved = (sourceUrl: string | null) =>
    ({ id: 1, ...SAVE, imageUrl: null, sourceUrl }) as unknown as recipeService.RecipeResponse

  const create = (body: unknown) =>
    buildApp().request(
      '/recipes',
      {
        method: 'POST',
        headers: { 'X-Api-Key': 'user', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      ENV,
    )

  it('passes sourceUrl and author through to createRecipe', async () => {
    vi.mocked(recipeService.createRecipe).mockResolvedValue(saved('https://allrecipes.com/r'))
    const res = await create({ ...SAVE, author: 'Pat Cook', sourceUrl: 'https://allrecipes.com/r' })
    expect(res.status).toBe(201)
    expect((await json(res)).data.sourceUrl).toBe('https://allrecipes.com/r')
    expect(vi.mocked(recipeService.createRecipe).mock.calls[0]![1]).toMatchObject({
      author: 'Pat Cook',
      sourceUrl: 'https://allrecipes.com/r',
    })
  })

  it('keeps manual creation valid when provenance is omitted', async () => {
    vi.mocked(recipeService.createRecipe).mockResolvedValue(saved(null))
    expect((await create(SAVE)).status).toBe(201)
  })

  it.each(['http://x.com/a', 'javascript:alert(1)', 'not a url'])(
    'rejects sourceUrl %s',
    async (u) => {
      expect((await create({ ...SAVE, sourceUrl: u })).status).toBe(400)
    },
  )
})
