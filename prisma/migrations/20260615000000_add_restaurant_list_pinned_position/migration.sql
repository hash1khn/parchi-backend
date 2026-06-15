-- Add pin position for "All Restaurants" student list (distinct from featured_order for Top Brands grid)
ALTER TABLE "public"."merchants" ADD COLUMN IF NOT EXISTS "restaurant_list_pinned_position" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_merchants_restaurant_list_pin"
  ON "public"."merchants" ("restaurant_list_pinned_position")
  WHERE "restaurant_list_pinned_position" IS NOT NULL;
