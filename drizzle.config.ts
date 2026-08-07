import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['recipeservice'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
