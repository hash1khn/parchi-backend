-- Landing-page conversion forms: Become a Merchant + Become a Campus Ambassador.
--
-- RLS is enabled with NO public policies: inserts happen server-side only,
-- through app/api/applications/* (Next.js) using the service-role key.
-- Admin read/update goes through this backend's /applications/* endpoints.

CREATE TABLE IF NOT EXISTS "public"."merchant_applications" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_name" TEXT NOT NULL,
    "contact_name"  TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "phone"         TEXT NOT NULL,
    "city"          TEXT NOT NULL,
    "category"      TEXT NOT NULL,
    "branch_count"  TEXT NOT NULL,
    "website"       TEXT,
    "message"       TEXT,
    "status"        TEXT NOT NULL DEFAULT 'new',
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "merchant_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ambassador_applications" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name"     TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "phone"         TEXT NOT NULL,
    "institute"     TEXT NOT NULL,
    "year_of_study" TEXT NOT NULL,
    "city"          TEXT NOT NULL,
    "instagram"     TEXT,
    "motivation"    TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'new',
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "ambassador_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "merchant_applications_created_at_idx"
    ON "public"."merchant_applications" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "merchant_applications_status_idx"
    ON "public"."merchant_applications" ("status");

CREATE INDEX IF NOT EXISTS "ambassador_applications_created_at_idx"
    ON "public"."ambassador_applications" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "ambassador_applications_status_idx"
    ON "public"."ambassador_applications" ("status");

ALTER TABLE "public"."merchant_applications"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ambassador_applications" ENABLE ROW LEVEL SECURITY;
