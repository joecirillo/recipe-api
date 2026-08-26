import { bigint, bigserial, pgSchema, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { recipes } from './recipes'
import { tags } from './tags'

const recipeservice = pgSchema('recipeservice')

export const recipeTags = recipeservice.table(
  'recipe_tags',
  {
    id: bigserial('recipe_tag_id', { mode: 'number' }).primaryKey(),
    recipeId: bigint('recipe_id', { mode: 'number' })
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: bigint('tag_id', { mode: 'number' })
      .notNull()
      .references(() => tags.id),
  },
  (t) => [unique().on(t.recipeId, t.tagId)],
)

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeTags.recipeId],
    references: [recipes.id],
  }),
  tag: one(tags, {
    fields: [recipeTags.tagId],
    references: [tags.id],
  }),
}))

export type RecipeTag = typeof recipeTags.$inferSelect
export type NewRecipeTag = typeof recipeTags.$inferInsert
