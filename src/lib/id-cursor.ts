const toBase64Url = (value: string) =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (value: string) => atob(value.replace(/-/g, '+').replace(/_/g, '/'))

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0

export const encodeIdCursor = (id: number) => toBase64Url(JSON.stringify({ id }))

export const decodeIdCursor = (cursor: string): number | null => {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor))
    const id = (parsed as { id?: unknown } | null)?.id
    return isPositiveSafeInteger(id) ? id : null
  } catch {
    return null
  }
}
