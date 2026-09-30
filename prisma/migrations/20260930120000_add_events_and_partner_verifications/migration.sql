-- Events (admin-curated banners for the student app)
CREATE TABLE "public"."events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "external_url" TEXT NOT NULL,
    "event_date" TIMESTAMPTZ(6),
    "venue" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_events_active_order" ON "public"."events"("is_active", "display_order");
CREATE INDEX "idx_events_date" ON "public"."events"("event_date");

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON "public"."events"
FOR EACH ROW EXECUTE FUNCTION update_events_updated_at();

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;

-- Partner API keys (server-to-server; never expose the raw key to browsers)
CREATE TABLE "public"."partner_api_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "partner_name" VARCHAR(100) NOT NULL,
    "hashed_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "partner_api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "partner_api_keys_partner_name_key" UNIQUE ("partner_name")
);

CREATE INDEX "idx_partner_api_keys_active" ON "public"."partner_api_keys"("is_active");

CREATE OR REPLACE FUNCTION update_partner_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_partner_api_keys_updated_at
BEFORE UPDATE ON "public"."partner_api_keys"
FOR EACH ROW EXECUTE FUNCTION update_partner_api_keys_updated_at();

ALTER TABLE "public"."partner_api_keys" ENABLE ROW LEVEL SECURITY;

-- Local-dev placeholder. Production must set INSIDE_KARACHI_PARTNER_KEY so the
-- backend upserts the real SHA-256 hash on boot.
INSERT INTO "public"."partner_api_keys" ("partner_name", "hashed_key")
VALUES (
    'inside_karachi',
    encode(digest('REPLACE_ME_SET_INSIDE_KARACHI_PARTNER_KEY', 'sha256'), 'hex')
)
ON CONFLICT ("partner_name") DO NOTHING;

-- Partner verification handshake (Parchi ID 2FA)
CREATE TYPE "public"."partner_verification_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
);

CREATE TABLE "public"."partner_verification_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "partner_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "external_reference" VARCHAR(255) NOT NULL,
    "event_label" VARCHAR(255),
    "status" "public"."partner_verification_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),

    CONSTRAINT "partner_verification_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_partner_verify_partner_status"
    ON "public"."partner_verification_requests"("partner_id", "status");
CREATE INDEX "idx_partner_verify_student_status"
    ON "public"."partner_verification_requests"("student_id", "status");
CREATE INDEX "idx_partner_verify_expires"
    ON "public"."partner_verification_requests"("expires_at");
CREATE INDEX "idx_partner_verify_student_ref"
    ON "public"."partner_verification_requests"("student_id", "external_reference");

ALTER TABLE "public"."partner_verification_requests"
    ADD CONSTRAINT "partner_verification_requests_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "public"."partner_api_keys"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."partner_verification_requests"
    ADD CONSTRAINT "partner_verification_requests_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION update_partner_verify_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_partner_verify_updated_at
BEFORE UPDATE ON "public"."partner_verification_requests"
FOR EACH ROW EXECUTE FUNCTION update_partner_verify_updated_at();

ALTER TABLE "public"."partner_verification_requests" ENABLE ROW LEVEL SECURITY;

-- Students can read their own verification rows (needed for Supabase Realtime).
-- All writes go through NestJS (service role / postgres), which bypasses RLS.
CREATE POLICY "students_read_own_partner_verifications"
ON "public"."partner_verification_requests"
FOR SELECT
USING (
    student_id IN (
        SELECT id FROM public.students WHERE user_id = auth.uid()
    )
);

-- Realtime for the in-app approve screen. Polling still works if this fails.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_verification_requests;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
