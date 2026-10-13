-- Home screen ad carousel (admin-curated 3.2:1 banners under Top Brands)
CREATE TABLE "public"."home_ads" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "title" VARCHAR(255) NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "home_ads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_home_ads_active_order" ON "public"."home_ads"("is_active", "display_order");

CREATE OR REPLACE FUNCTION update_home_ads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_home_ads_updated_at
BEFORE UPDATE ON "public"."home_ads"
FOR EACH ROW EXECUTE FUNCTION update_home_ads_updated_at();

ALTER TABLE "public"."home_ads" ENABLE ROW LEVEL SECURITY;

-- Seconds each ad stays on screen before the carousel swipes to the next one.
ALTER TABLE "public"."app_configs"
    ADD COLUMN "home_ad_interval_seconds" INTEGER NOT NULL DEFAULT 4;

-- Launch content: PrismFest first, then the general Parchi promo.
INSERT INTO "public"."home_ads" ("title", "image_url", "link_url", "display_order")
VALUES
    (
        'Prismfest ''26 (20% OFF)',
        'https://zjghfwnrzazmukykgyhh.supabase.co/storage/v1/object/public/merchant-assets/banners/prismfest-26-1791842313916.png',
        'https://www.insidekarachi.com/events/prismfest-26',
        0
    ),
    (
        'Kharchi Bachao, Parchi Lagao!',
        'https://zjghfwnrzazmukykgyhh.supabase.co/storage/v1/object/public/merchant-assets/banners/kharchi-bachao-parchi-lagao-1791842313916.png',
        NULL,
        1
    );
