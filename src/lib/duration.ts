const ISO_DURATION =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

export function parseDurationMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = ISO_DURATION.exec(value)
  if (!match || match[0] !== value || !match.slice(1).some(Boolean)) return null
  if (value.endsWith('T')) return null

  const [, years, months, weeks, days, hours, minutes, seconds] = match
  // Years and months have no fixed length; weeks were never supported.
  // Zero values carry no time, so sites that pad every part still parse.
  if ([years, months, weeks].some((part) => Number(part ?? 0) !== 0)) return null

  const total = Math.ceil(
    Number(days ?? 0) * 1440 +
      Number(hours ?? 0) * 60 +
      Number(minutes ?? 0) +
      Number(seconds ?? 0) / 60,
  )
  return Number.isSafeInteger(total) ? total : null
}

const PLAIN_DURATION = /^(?:(\d+)\s+(?:hours?|hrs?)(?:\s+|$))?(?:(\d+)\s+(?:minutes?|mins?))?$/i

export function parsePlainDurationMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = PLAIN_DURATION.exec(value.trim())
  if (!match) return null
  const [, hours, minutes] = match
  if (hours === undefined && minutes === undefined) return null

  const total = Number(hours ?? 0) * 60 + Number(minutes ?? 0)
  return Number.isSafeInteger(total) ? total : null
}
