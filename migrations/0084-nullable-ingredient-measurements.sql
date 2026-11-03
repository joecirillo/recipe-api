BEGIN;

ALTER TABLE recipeservice.recipe_ingredients
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN unit_id DROP NOT NULL;

COMMIT;
