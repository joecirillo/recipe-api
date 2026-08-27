// Capitalizes the letter after start-of-string, whitespace, or a hyphen; \p{L} (not \w) so
// accented letters count, and apostrophes are excluded so "shepherd's pie" -> "Shepherd's Pie"
export function toTitleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_, boundary: string, letter: string) => boundary + letter.toUpperCase(),
    )
}
