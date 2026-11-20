import { load } from 'cheerio/slim'

export type JsonLdNode = Record<string, unknown>

export type ExtractedRecipeJsonLd = {
  recipe: JsonLdNode
  recipeCount: number
  nodesById: ReadonlyMap<string, JsonLdNode>
}

function isRecipe(value: JsonLdNode): boolean {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  return types.some((type) =>
    ['Recipe', 'https://schema.org/Recipe', 'http://schema.org/Recipe'].includes(type),
  )
}

function indexNode(node: JsonLdNode, nodesById: Map<string, JsonLdNode>): void {
  const id = node['@id']
  const isReferenceOnly = Object.keys(node).every((key) => key === '@id')
  if (typeof id === 'string' && !isReferenceOnly && !nodesById.has(id)) nodesById.set(id, node)
}

export function extractRecipeJsonLd(html: string): ExtractedRecipeJsonLd | null {
  const $ = load(html)
  let recipe: JsonLdNode | undefined
  let recipeCount = 0
  const nodesById = new Map<string, JsonLdNode>()

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
        const object = node as JsonLdNode
        indexNode(object, nodesById)
        if (isRecipe(object)) {
          recipe ??= object
          recipeCount++
          continue
        }
        const children = Object.values(object)
        for (let index = children.length - 1; index >= 0; index--) pending.push(children[index])
      }
    }
  })

  return recipe ? { recipe, recipeCount, nodesById } : null
}
