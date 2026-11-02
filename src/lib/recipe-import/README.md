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
  `SAVE_LIMIT_EXCEEDED` paths instead identify mapped preview fields, e.g.
  `recipe.ingredients[2].name`, so the consumer can highlight the affected row.
  Messages are display text; consumers should branch on codes, not messages.

Ingredient rows contain `id: null`, the raw line as `name`, and null `quantity`,
`unitId`, and `notes`. Null measurements are permitted by the preview contract;
they are not extraction errors. The current save API and checked-in Drizzle
schema still require quantity and unit. Accepting null measurements through save
is tracked in [recipe-api#84](https://github.com/joecirillo/recipe-api/issues/84),
including coordinated frontend changes for
[foodies-finds#76](https://github.com/joecirillo/foodies-finds/issues/76);
this preview does not change persistence or submit directly to `POST /recipes`.

Instructions become sequentially numbered steps with null tips. A single string
is one step; string arrays and nested HowToSection/HowToStep structures retain
their order. Markup is converted to text with block/line boundaries and decoded
entities. Original ingredient strings remain raw text and must be rendered as
text, not HTML. All preview strings, including decoded names, descriptions, and
instructions, must be rendered as text rather than inserted with an HTML-rendering
API. Decoded text can contain literal angle brackets; conversion to plain text is
not an HTML-sanitization guarantee.

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
Arrays of strings/numbers use the first interpretable serving count and preserve
all string/finite-number entries, in order, joined with newlines in `originalYield`.
Matching counts such as `["4", "4 servings"]` do not warn; conflicting counts,
ranges, and rejected entries request review. Unsupported entries are never
coerced to strings. If no count is interpretable, servings remain omitted.

## Save limits

`SAVE_LIMIT_EXCEEDED` warnings preserve the imported value without truncation or
numeric capping. They check the current save/API or database upper bounds:
recipe name 150 characters; author/image URL/ingredient name 255; cuisine/tag
name 100; servings, times, and step numbers 32767. The image limit applies after
URL normalization. The recipe name limit is the API's stricter limit, not the
255-character database column. Tag and step-number limits also protect against
current gaps in save-route validation (tag validation is tracked in #78).

These warnings are not complete save validation. Required fields, minimum values,
and the current measurement requirements still need validation during review and
by the save API. A warning-free preview is not necessarily ready to save. Keep
these upper-bound checks aligned with future save-contract changes.

| Warning code          | Meaning                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `INVALID_FIELD`       | A supplied field or list entry has unsupported/empty content.    |
| `INVALID_DURATION`    | A supplied time cannot be parsed under the duration policy.      |
| `AMBIGUOUS_YIELD`     | A serving range or conflicting array counts need review.         |
| `UNSUPPORTED_YIELD`   | One or more yield entries cannot be interpreted as servings.     |
| `INVALID_IMAGE_URL`   | An image candidate was rejected; a later candidate may be used.  |
| `SAVE_LIMIT_EXCEEDED` | An imported value exceeds a current save limit and needs review. |
| `MULTIPLE_RECIPES`    | The first of multiple recipes was selected.                      |

Missing/null fields and empty lists are left empty for review. Supplied invalid
entries produce warnings while valid sibling entries are retained. Selection
stops after the first usable author/image, so unused later alternatives are not
validated. No route, network call, or persistence operation is part of this module.

## Local Workers smoke check

The isolated harness imports and executes the actual parser and mapper in
`workerd`. Its configuration has the application's compatibility date/flag but
no production bindings, routes, or secrets. It is not the application's entry
point and must not be deployed. Use Node.js 24 and the pinned pnpm version:

```sh
pnpm exec wrangler dev --config scripts/wrangler.recipe-import-smoke.jsonc --local --ip 127.0.0.1 --port 8799 --inspector-port 0
```

In another terminal:

```sh
curl --fail --silent --show-error http://127.0.0.1:8799
```

A successful response contains `"passed":true`; assertion failures return an
error. Stop the server after checking. The harness covers malformed-script
recovery, graph selection/counting, Cheerio text decoding, nested instructions,
nullable ingredients, array yields, durations, image filtering/resolution,
absent recipes, and save-limit warnings. It passed locally with Wrangler 4.115.0;
this verifies local Workers execution, not deployment to Cloudflare.
