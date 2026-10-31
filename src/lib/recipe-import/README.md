# Recipe JSON-LD import

`extractRecipeJsonLd(html)` parses HTML without fetching resources. It examines
JSON-LD scripts in document order and visits objects and arrays depth-first in
their JSON property/array order. The result contains the first Recipe object and
the total `recipeCount`, or is `null` when none exists. Missing recipe fields do
not disqualify a node. Malformed JSON scripts are skipped. The returned fields are
untrusted `unknown` values; extraction does not validate recipe fields.

`parseDurationMinutes(value)` in `../duration.ts` accepts uppercase ISO durations
with nonnegative integer days, hours, and minutes, and nonnegative seconds that
may have a fractional part. Days are exactly 24 hours. The total is rounded up to
whole minutes, so `PT1S` becomes 1 and `PT0S` remains 0. Years, months, weeks,
fractional days/hours/minutes, negative durations, empty durations, and results
outside JavaScript's safe integer range return `null`, as do missing values.

## Preview contract

`RecipeImportPreview` in `../types.ts` is the agreed contract for
`joecirillo/foodies-finds#76`. Call `mapSchemaOrgRecipe(extracted, { sourceUrl })`
with the extraction result and the final fetched page URL. The caller owns URL
validation and fetching; pass an absolute HTTP(S) page URL after redirects.

```ts
const extracted = extractRecipeJsonLd(html)
const preview = extracted ? mapSchemaOrgRecipe(extracted, { sourceUrl }) : null
```

The preview has three properties:

- `recipe`: optional, typed form fields. Missing scalar fields are omitted;
  missing or invalid `cookingTime` and `preparationTime` are `null`.
  `ingredients`, `steps`, and `tags` are arrays, empty when no usable entries
  exist. No calories or other missing values are invented.
- `source`: `sourceUrl`, `originalAuthor` (string or null),
  `originalIngredientLines` (string array), `originalYield` (string or null),
  and `recipeCount`. Original ingredient strings are copied without trimming or
  measurement parsing. Numeric yields are preserved as text. Editing recipe
  fields does not change this metadata.
- `warnings`: stable `code`, optional `field`, and actionable `message`.
  Field paths refer to the source JSON-LD, e.g. `recipeInstructions[2].text`.
  Messages are display text; consumers should branch on codes, not messages.

Ingredient rows contain `id: null`, the raw line as `name`, and null `quantity`,
`unitId`, and `notes`. Null measurements are permitted by the preview contract;
they are not extraction errors. The current save API and checked-in Drizzle
schema still require quantity and unit. Accepting null measurements through save
requires coordinated backend/frontend changes in the subsequent import work;
this preview does not change persistence or submit directly to `POST /recipes`.

Instructions become sequentially numbered steps with null tips. A single string
is one step; string arrays and nested HowToSection/HowToStep structures retain
their order. Markup is converted to text with block/line boundaries and decoded
entities. Original ingredient strings remain raw text and must be rendered as
text, not HTML.

Cuisine uses the first usable name. Keywords are split on commas; category
strings are retained as whole names. Tags are deduplicated case-insensitively,
preserving the first spelling and order. Named cuisine/tags have `id: null`.
The first supported author name is copied to both `recipe.author` and
`source.originalAuthor`.

Image selection accepts strings and typed ImageObjects (`url`, then
`contentUrl`), including arrays. Relative URLs resolve against `sourceUrl`.
Only HTTP(S) URLs without embedded credentials are retained. No image is
downloaded, checked for availability, or rehosted.

Positive integer yields, explicit serving counts (e.g. `Serves 4`, `4 servings`,
`4 people`), and ascending integer serving ranges are supported. Ranges use the
lower value with a warning. Item yields such as `24 cookies` are not servings.
Unsupported yield values leave servings omitted and request review.

| Warning code        | Meaning                                                         |
| ------------------- | --------------------------------------------------------------- |
| `INVALID_FIELD`     | A supplied field or list entry has unsupported/empty content.   |
| `INVALID_DURATION`  | A supplied time cannot be parsed under the duration policy.     |
| `AMBIGUOUS_YIELD`   | A serving range was reduced to its lower value.                 |
| `UNSUPPORTED_YIELD` | The yield cannot safely be interpreted as servings.             |
| `INVALID_IMAGE_URL` | An image candidate was rejected; a later candidate may be used. |
| `MULTIPLE_RECIPES`  | The first of multiple recipes was selected.                     |

Missing/null fields and empty lists are left empty for review. Supplied invalid
entries produce warnings while valid sibling entries are retained. Selection
stops after the first usable author/image, so unused later alternatives are not
validated. No route, network call, or persistence operation is part of this module.
