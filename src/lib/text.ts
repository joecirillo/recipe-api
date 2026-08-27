export function toTitleCase(value: string): string {
  return value
    .split(' ')
    .map((word) =>
      word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ')
}
