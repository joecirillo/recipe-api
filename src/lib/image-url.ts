// recipes.imageUrl stores an R2 key (e.g. "recipes/<uuid>.jpg") going forward, resolved to a
// full URL at read time so a future public-domain change (see #41) never requires rewriting
// existing rows. Rows written before this change still hold a full URL; toPublicUrl leaves an
// already-absolute value untouched instead of forcing a one-time migration.

export function toStorageKey(imageUrl: string, publicUrl: string): string {
  const base = publicUrl.replace(/\/$/, '')
  return imageUrl.startsWith(`${base}/`) ? imageUrl.slice(base.length + 1) : imageUrl
}

export function toPublicUrl(stored: string | null, publicUrl: string): string | null {
  if (!stored) return null
  if (/^https?:\/\//i.test(stored)) return stored
  return `${publicUrl.replace(/\/$/, '')}/${stored}`
}

export function withPublicImageUrl<T extends { imageUrl: string | null }>(
  item: T,
  publicUrl: string,
): T {
  return { ...item, imageUrl: toPublicUrl(item.imageUrl, publicUrl) }
}
