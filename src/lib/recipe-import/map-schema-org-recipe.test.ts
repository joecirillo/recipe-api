import { describe, expect, it } from 'vitest'
import { extractRecipeJsonLd } from './extract-recipe-json-ld'
import { mapSchemaOrgRecipe } from './map-schema-org-recipe'

const context = { sourceUrl: 'https://example.com/recipes/soup' }
const preview = (recipe: Record<string, unknown>) =>
  mapSchemaOrgRecipe({ recipe, recipeCount: 1, nodesById: new Map() }, context)

const rawIngredients = ['  2 cups flour  ', 'Salt & pepper to taste']

describe('mapSchemaOrgRecipe', () => {
  it('maps a complete recipe into editable fields and independent source metadata', () => {
    const input = {
      name: 'Bread &amp; butter',
      description: '<p>Easy <b>bread</b>.</p>',
      cookTime: 'PT1H30M',
      prepTime: 'PT45M',
      recipeYield: '4 servings',
      recipeIngredient: rawIngredients,
      recipeInstructions: ['Mix.', 'Bake.'],
      recipeCuisine: ['French', 'European'],
      keywords: 'Bread, Easy, bread',
      recipeCategory: ['Easy', 'Side dish'],
      author: { '@type': 'Person', name: 'Jane Doe' },
      image: '/images/bread.jpg',
    }
    const result = preview(input)
    expect(result).toEqual({
      recipe: {
        name: 'Bread & butter',
        description: 'Easy bread.',
        cookingTime: 90,
        preparationTime: 45,
        servings: 4,
        cuisine: { id: null, name: 'French' },
        tags: [
          { id: null, name: 'Bread' },
          { id: null, name: 'Easy' },
          { id: null, name: 'Side dish' },
        ],
        author: 'Jane Doe',
        imageUrl: 'https://example.com/images/bread.jpg',
        ingredients: ['2 cups flour', 'Salt & pepper to taste'].map((name) => ({
          id: null,
          name,
          quantity: null,
          unitId: null,
          notes: null,
        })),
        steps: [
          { stepNumber: 1, description: 'Mix.', tip: null },
          { stepNumber: 2, description: 'Bake.', tip: null },
        ],
      },
      source: {
        sourceUrl: context.sourceUrl,
        originalAuthor: 'Jane Doe',
        originalIngredientLines: rawIngredients,
        originalYield: '4 servings',
        recipeCount: 1,
      },
      warnings: [],
    })
    result.recipe.ingredients![0].name = 'Edited ingredient'
    result.recipe.author = 'Edited author'
    expect(result.source.originalIngredientLines).toEqual(rawIngredients)
    expect(result.source.originalAuthor).toBe('Jane Doe')
    expect(input.recipeIngredient).toEqual(rawIngredients)
    expect(result.source.originalIngredientLines).not.toBe(rawIngredients)
  })

  it('leaves missing fields empty without inventing required values', () => {
    expect(preview({})).toEqual({
      recipe: { cookingTime: null, preparationTime: null, ingredients: [], steps: [], tags: [] },
      source: {
        sourceUrl: context.sourceUrl,
        originalAuthor: null,
        originalIngredientLines: [],
        originalYield: null,
        recipeCount: 1,
      },
      warnings: [],
    })
    expect(preview({ name: 'Soup' }).recipe).toMatchObject({ name: 'Soup', cookingTime: null })
    expect(preview({ name: 'Soup' }).recipe).not.toHaveProperty('servings')
  })

  it('keeps usable data and warns about rejected values with precise paths', () => {
    const result = preview({
      name: 42,
      description: { text: 'No' },
      cookTime: false,
      prepTime: 'PT0S',
      recipeYield: '24 cookies',
      recipeIngredient: ['salt', 1, null, ''],
      recipeInstructions: ['Stir.', false, { '@type': 'HowToStep' }],
      recipeCuisine: [false, 'Italian'],
      keywords: ['Dinner', {}],
      recipeCategory: 5,
      author: [null, { '@type': 'Organization', name: 'Test Kitchen' }],
      image: ['javascript:alert(1)', 'https://example.com/good.jpg'],
    })
    expect(result.recipe).toMatchObject({
      cookingTime: null,
      preparationTime: 0,
      author: 'Test Kitchen',
      cuisine: { id: null, name: 'Italian' },
      imageUrl: 'https://example.com/good.jpg',
      ingredients: [{ name: 'salt', quantity: null, unitId: null }],
      steps: [{ stepNumber: 1, description: 'Stir.' }],
      tags: [{ id: null, name: 'Dinner' }],
    })
    expect(result.recipe).not.toHaveProperty('name')
    expect(result.recipe).not.toHaveProperty('servings')
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'name' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'description' }),
        expect.objectContaining({ code: 'INVALID_DURATION', field: 'cookTime' }),
        expect.objectContaining({ code: 'UNSUPPORTED_YIELD', field: 'recipeYield' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeIngredient[1]' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeIngredient[2]' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeIngredient[3]' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeInstructions[1]' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeInstructions[2].text' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeCuisine[0]' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'keywords[1]' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeCategory' }),
        expect.objectContaining({ code: 'INVALID_FIELD', field: 'author[0]' }),
        expect.objectContaining({ code: 'INVALID_IMAGE_URL', field: 'image[0]' }),
      ]),
    )
    expect(result.warnings.every((warning) => warning.message.length > 10)).toBe(true)
  })

  it('decodes and strips markup from ingredient names while keeping original lines raw', () => {
    const lines = ['1 &amp; 1/2 cups flour', '<b>2</b> eggs', '<br>']
    const result = preview({ recipeIngredient: lines })
    expect(result.recipe.ingredients?.map((ingredient) => ingredient.name)).toEqual([
      '1 & 1/2 cups flour',
      '2 eggs',
    ])
    expect(result.source.originalIngredientLines).toEqual(lines.slice(0, 2))
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'INVALID_FIELD', field: 'recipeIngredient[2]' }),
    )
  })

  it('handles empty arrays and null fields', () => {
    const result = preview({
      name: null,
      description: null,
      recipeIngredient: [],
      recipeInstructions: [],
      recipeCuisine: [],
      keywords: [],
      recipeCategory: [],
      author: [],
      image: [],
    })
    expect(result).toEqual(preview({}))
  })

  it('rejects scalar ingredients and unsupported instructions without coercing them', () => {
    const result = preview({ recipeIngredient: 'salt', recipeInstructions: 123 })
    expect(result.recipe.ingredients).toEqual([])
    expect(result.recipe.steps).toEqual([])
    expect(result.warnings.map(({ field }) => field)).toEqual([
      'recipeIngredient',
      'recipeInstructions',
    ])
  })

  it('flattens nested HowToSections in order and preserves text boundaries and entities', () => {
    const result = preview({
      recipeInstructions: [
        { '@type': 'HowToStep', text: '<p>Heat &amp; stir.</p><p>Wait.</p>' },
        {
          '@type': 'HowToSection',
          name: 'Finish',
          itemListElement: [
            { '@type': ['Thing', 'HowToStep'], text: 'Add <b>salt</b><br>Mix&nbsp;well.' },
            {
              '@type': 'HowToSection',
              itemListElement: [
                { '@type': 'HowToStep', text: '<ul><li>Serve.</li><li>Enjoy.</li></ul>' },
              ],
            },
          ],
        },
      ],
    })
    expect(result.recipe.steps).toEqual([
      { stepNumber: 1, description: 'Heat & stir.\nWait.', tip: null },
      { stepNumber: 2, description: 'Add salt\nMix well.', tip: null },
      { stepNumber: 3, description: 'Serve.\nEnjoy.', tip: null },
    ])
    expect(result.warnings).toEqual([])
  })

  it('maps a single instruction string as one step and removes non-content markup', () => {
    expect(
      preview({
        recipeInstructions:
          '<script>bad()</script><style>bad</style><p>Mix &lt; gently.</p><p>Bake.</p>',
      }).recipe.steps,
    ).toEqual([{ stepNumber: 1, description: 'Mix < gently.\nBake.', tip: null }])
  })

  it('warns for broken sections and retains later steps with sequential numbering', () => {
    const result = preview({
      recipeInstructions: [
        { '@type': 'HowToSection', itemListElement: {} },
        { '@type': 'HowToStep', text: 7 },
        'Serve.',
      ],
    })
    expect(result.recipe.steps).toEqual([{ stepNumber: 1, description: 'Serve.', tip: null }])
    expect(result.warnings.map(({ field }) => field)).toEqual([
      'recipeInstructions[0].itemListElement',
      'recipeInstructions[1].text',
    ])
  })

  it('attaches King Arthur HowToTip entries to the step before them', () => {
    const result = preview({
      '@type': 'Recipe',
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat the oven to 350°F.' },
        { '@type': 'HowToStep', text: '<p>Bake for 25 to 30 minutes.</p>' },
        {
          '@type': 'HowToTip',
          text: 'Want to make this recipe gluten-free? Substitute King Arthur Measure for Measure Flour.',
        },
        { '@type': 'HowToTip', text: 'For mocha brownies, add 1 teaspoon espresso powder.' },
        { '@type': 'HowToTip', text: 'Store brownies, well wrapped, for up to 5 days.' },
        { '@type': 'HowToTip', text: '<p>Freeze for longer storage.</p>' },
      ],
    })
    expect(result.recipe.steps).toEqual([
      { stepNumber: 1, description: 'Preheat the oven to 350°F.', tip: null },
      {
        stepNumber: 2,
        description: 'Bake for 25 to 30 minutes.',
        tip: [
          'Want to make this recipe gluten-free? Substitute King Arthur Measure for Measure Flour.',
          'For mocha brownies, add 1 teaspoon espresso powder.',
          'Store brownies, well wrapped, for up to 5 days.',
          'Freeze for longer storage.',
        ].join('\n'),
      },
    ])
    expect(result.warnings).toEqual([])
  })

  it('attaches a tip to the previous step across sections and accepts full type IRIs', () => {
    const result = preview({
      recipeInstructions: [
        { '@type': 'HowToSection', itemListElement: ['Mix.'] },
        {
          '@type': 'HowToSection',
          itemListElement: [{ '@type': 'https://schema.org/HowToTip', text: 'Do not overmix.' }],
        },
        'Bake.',
      ],
    })
    expect(result.recipe.steps).toEqual([
      { stepNumber: 1, description: 'Mix.', tip: 'Do not overmix.' },
      { stepNumber: 2, description: 'Bake.', tip: null },
    ])
  })

  it('warns about tips without a preceding step or without text', () => {
    const result = preview({
      recipeInstructions: [
        { '@type': 'HowToTip', text: 'Read the recipe first.' },
        'Mix.',
        { '@type': 'HowToTip' },
        { '@type': 'HowToTip', text: 7 },
        { '@type': 'HowToTip', text: '<p> </p>' },
      ],
    })
    expect(result.recipe.steps).toEqual([{ stepNumber: 1, description: 'Mix.', tip: null }])
    expect(result.warnings).toEqual(
      [
        'recipeInstructions[0]',
        'recipeInstructions[2].text',
        'recipeInstructions[3].text',
        'recipeInstructions[4].text',
      ].map((field) => expect.objectContaining({ code: 'INVALID_FIELD', field })),
    )
  })

  it('keeps a long joined tip without a save-limit warning because tips are unbounded', () => {
    const tip = 'x'.repeat(5000)
    const result = preview({
      recipeInstructions: ['Mix.', { '@type': 'HowToTip', text: tip }],
    })
    expect(result.recipe.steps?.[0].tip).toBe(tip)
    expect(result.warnings).toEqual([])
  })

  it.each([
    ['Jane', 'Jane'],
    [{ '@type': 'Person', name: 'Jane' }, 'Jane'],
    [{ '@type': 'Organization', name: 'Kitchen' }, 'Kitchen'],
    [[{}, { '@type': 'Person', name: 'Jane' }, 'Other'], 'Jane'],
    [[{ '@type': 'Person' }, 'Jane'], 'Jane'],
    [[{ '@type': 'Person', name: 7 }, 'Jane'], 'Jane'],
  ])('maps the first supported author in %j', (author, expected) => {
    const result = preview({ author })
    expect(result.recipe.author).toBe(expected)
    expect(result.source.originalAuthor).toBe(expected)
  })

  it.each([
    {
      site: 'Budget Bytes',
      sourceUrl: 'https://www.budgetbytes.com/one-pot-chili-pasta/',
      personId: 'https://www.budgetbytes.com/#/schema/person/de53c1c4f0b36d0ff5ad3dd8fd7f9c7e',
      name: 'Beth - Budget Bytes',
    },
    {
      site: 'RecipeTin Eats',
      sourceUrl: 'https://www.recipetineats.com/chicken-chow-mein/',
      personId: 'https://www.recipetineats.com/#/schema/person/9e39c0a4b25d4d1ba08fd7bf4d4ba4a1',
      name: 'Nagi',
    },
  ])('resolves a $site Yoast author reference to the Person name', (site) => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', '@id': site.sourceUrl, author: { '@id': site.personId } },
          {
            '@type': 'Person',
            '@id': site.personId,
            name: site.name,
            image: { '@type': 'ImageObject', '@id': `${site.sourceUrl}#personlogo` },
          },
          {
            '@type': 'Recipe',
            '@id': `${site.sourceUrl}#recipe`,
            name: 'Dinner',
            author: { '@id': site.personId },
            isPartOf: { '@id': site.sourceUrl },
          },
        ],
      }) +
      '</script>'
    const result = mapSchemaOrgRecipe(extractRecipeJsonLd(html)!, { sourceUrl: site.sourceUrl })
    expect(result.recipe.author).toBe(site.name)
    expect(result.source.originalAuthor).toBe(site.name)
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ field: 'author' }))
  })

  it.each([
    [{ '@id': '#missing' }, 'author'],
    [{ '@id': '#webpage' }, 'author'],
    [{ '@id': '#nameless' }, 'author.name'],
    [{ '@type': 'Person', '@id': '#missing' }, 'author.name'],
  ])('keeps the author warning when reference %j does not resolve to a name', (author, field) => {
    const nodesById = new Map([
      ['#webpage', { '@type': 'WebPage', '@id': '#webpage', name: 'Home' }],
      ['#nameless', { '@type': 'Person', '@id': '#nameless' }],
    ])
    const result = mapSchemaOrgRecipe({ recipe: { author }, recipeCount: 1, nodesById }, context)
    expect(result.recipe).not.toHaveProperty('author')
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'INVALID_FIELD', field })])
  })

  it('prefers an inline author name over the referenced node', () => {
    const nodesById = new Map([['#p', { '@type': 'Person', '@id': '#p', name: 'Graph' }]])
    const author = { '@type': 'Person', '@id': '#p', name: 'Inline' }
    const result = mapSchemaOrgRecipe({ recipe: { author }, recipeCount: 1, nodesById }, context)
    expect(result.recipe.author).toBe('Inline')
  })

  it('resolves references inside an author array in order', () => {
    const nodesById = new Map([['#p', { '@type': 'Person', '@id': '#p', name: 'Jane' }]])
    const author = [{ '@id': '#missing' }, { '@id': '#p' }]
    const result = mapSchemaOrgRecipe({ recipe: { author }, recipeCount: 1, nodesById }, context)
    expect(result.recipe.author).toBe('Jane')
    expect(result.warnings.map(({ field }) => field)).toEqual(['author[0]'])
  })

  it('does not coerce an invalid author', () => {
    const result = preview({ author: { '@type': 'Person', name: {} } })
    expect(result.recipe).not.toHaveProperty('author')
    expect(result.source.originalAuthor).toBeNull()
    expect(result.warnings[0]).toMatchObject({ code: 'INVALID_FIELD', field: 'author.name' })
  })

  it('maps Food Network zero-padded ISO durations', () => {
    const result = preview({
      '@type': 'Recipe',
      prepTime: 'P0Y0M0DT0H15M0.000S',
      cookTime: 'P0Y0M0DT0H25M0.000S',
      totalTime: 'P0Y0M0DT1H0M0.000S',
    })
    expect(result.recipe).toMatchObject({ preparationTime: 15, cookingTime: 25 })
    expect(result.warnings).toEqual([])
  })

  it('maps Bon Appétit plain-English durations', () => {
    const result = preview({
      '@type': 'Recipe',
      prepTime: '1 hour 20 minutes',
      cookTime: '20 minutes',
      totalTime: '40 minutes',
    })
    expect(result.recipe).toMatchObject({ preparationTime: 80, cookingTime: 20 })
    expect(result.warnings).toEqual([])
  })

  it.each(['about 20 minutes', '20-25 minutes', 'P1Y', 'P2M'])(
    'leaves unsupported duration %j empty with a warning',
    (cookTime) => {
      const result = preview({ cookTime })
      expect(result.recipe.cookingTime).toBeNull()
      expect(result.warnings).toEqual([
        expect.objectContaining({ code: 'INVALID_DURATION', field: 'cookTime' }),
      ])
    },
  )

  it.each([
    ['https://images.example.com/a.jpg', 'https://images.example.com/a.jpg'],
    ['http://images.example.com/a.jpg', 'http://images.example.com/a.jpg'],
    ['/images/a.jpg', 'https://example.com/images/a.jpg'],
    ['../images/a.jpg', 'https://example.com/images/a.jpg'],
    ['//images.example.com/a.jpg', 'https://images.example.com/a.jpg'],
    [{ '@type': 'ImageObject', url: '/a.jpg' }, 'https://example.com/a.jpg'],
    [{ '@type': 'ImageObject', contentUrl: '/a.jpg' }, 'https://example.com/a.jpg'],
    [
      { '@type': 'ImageObject', url: 'data:image/png,x', contentUrl: '/a.jpg' },
      'https://example.com/a.jpg',
    ],
    [[null, { '@type': 'ImageObject', url: '/a.jpg' }, '/b.jpg'], 'https://example.com/a.jpg'],
  ])('maps image %j to the first usable URL', (image, expected) => {
    expect(preview({ image }).recipe.imageUrl).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'data:image/png,x',
    'file:///a.jpg',
    'ftp://example.com/a.jpg',
    'https://',
    'https://user:password@example.com/a.jpg',
    '',
    7,
    {},
    { '@type': 'ImageObject' },
  ])('rejects invalid image %j', (image) => {
    const result = preview({ image })
    expect(result.recipe).not.toHaveProperty('imageUrl')
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'INVALID_IMAGE_URL', field: 'image' }),
    ])
  })

  it('maps string cuisine/category and array keywords with stable deduplication', () => {
    expect(
      preview({
        recipeCuisine: 'French',
        keywords: [' Quick, easy ', 'QUICK'],
        recipeCategory: 'easy',
      }).recipe,
    ).toMatchObject({
      cuisine: { id: null, name: 'French' },
      tags: [
        { id: null, name: 'Quick' },
        { id: null, name: 'easy' },
      ],
    })
  })

  it('reports a rejected ImageObject URL even when contentUrl is usable', () => {
    const result = preview({
      image: { '@type': 'ImageObject', url: 'javascript:alert(1)', contentUrl: '/safe.jpg' },
    })
    expect(result.recipe.imageUrl).toBe('https://example.com/safe.jpg')
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'INVALID_IMAGE_URL', field: 'image.url' }),
    ])
  })

  it('carries deterministic selection metadata from HTML extraction into a warning', () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        '@graph': [
          { '@type': 'Recipe', name: 'First' },
          { '@type': 'Recipe', name: 'Second' },
        ],
      }) +
      '</script>'
    const extracted = extractRecipeJsonLd(html)!
    const result = mapSchemaOrgRecipe(extracted, context)
    expect(result.recipe.name).toBe('First')
    expect(result.source.recipeCount).toBe(2)
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'MULTIPLE_RECIPES' })])
  })

  it('does not mutate an extracted node and produces a JSON-serializable preview', () => {
    const node = { name: 'Soup', recipeIngredient: Object.freeze(['salt']), recipeYield: '4–6' }
    const result = preview(Object.freeze(node))
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    expect(node.recipeIngredient).toEqual(['salt'])
    expect(result.recipe.servings).toBe(4)
    expect(result.source.originalYield).toBe('4–6')
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'AMBIGUOUS_YIELD', field: 'recipeYield' }),
    ])
  })
})
