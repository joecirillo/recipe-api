export function parseDurationMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value)
  if (!match || match[0] !== value || !match.slice(1).some(Boolean)) return null
  if (value.endsWith('T')) return null

  const [, days, hours, minutes, seconds] = match
  const total = Math.ceil(
    Number(days ?? 0) * 1440 +
      Number(hours ?? 0) * 60 +
      Number(minutes ?? 0) +
      Number(seconds ?? 0) / 60,
  )
  return Number.isSafeInteger(total) ? total : null
}
