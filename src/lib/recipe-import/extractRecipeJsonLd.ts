import { load } from 'cheerio/slim'

export type ExtractedRecipeJsonLd = {
  recipe: Record<string, unknown>
  recipeCount: number
}

function isRecipe(value: Record<string, unknown>): boolean {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  return types.some((type) =>
    ['Recipe', 'https://schema.org/Recipe', 'http://schema.org/Recipe'].includes(type),
  )
}

export function extractRecipeJsonLd(html: string): ExtractedRecipeJsonLd | null {
  const $ = load(html)
  let recipe: Record<string, unknown> | undefined
  let recipeCount = 0

  $('script').each((_, script) => {
    if ($(script).attr('type')?.trim().toLowerCase() !== 'application/ld+json') return

    let parsed: unknown
    try {
      parsed = JSON.parse($(script).text())
    } catch (error) {
      if (error instanceof SyntaxError) return
      throw error
    }

    const pending: unknown[] = [parsed]
    while (pending.length) {
      const node = pending.pop()
      if (Array.isArray(node)) {
        for (let index = node.length - 1; index >= 0; index--) pending.push(node[index])
      } else if (node !== null && typeof node === 'object') {
        const object = node as Record<string, unknown>
        if (isRecipe(object)) {
          recipe ??= object
          recipeCount++
        }
        const children = Object.values(object)
        for (let index = children.length - 1; index >= 0; index--) pending.push(children[index])
      }
    }
  })

  return recipe ? { recipe, recipeCount } : null
}
