BEGIN;

ALTER TABLE recipeservice.recipes
  ADD COLUMN IF NOT EXISTS source_url varchar(2048);

COMMIT;
