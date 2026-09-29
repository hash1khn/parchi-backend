-- Hardening for the Parchi <-> partner verification handshake.
--
-- NOTE: the unique partial index below cannot be expressed in schema.prisma.
-- Apply migrations with `prisma migrate deploy`. If you use `prisma migrate dev`,
-- Prisma may propose dropping this index; do not accept that.

-- 1. The seed migration inserted a key whose raw value is public in source control.
--    Deactivate it. The backend re-installs the real hash from INSIDE_KARACHI_PARTNER_KEY
--    on boot without re-activating rows an operator has disabled.
UPDATE "public"."partner_api_keys"
SET "is_active" = false
WHERE "hashed_key" = '34b7be74b5ef512ef9ae89db55e5f1775ffb58366422c384ba9ec2f3a2d16c60';

-- 2. New columns: number-matching code for the push path + push delivery telemetry.
ALTER TABLE "public"."partner_verification_requests"
    ADD COLUMN IF NOT EXISTS "match_code" VARCHAR(4),
    ADD COLUMN IF NOT EXISTS "push_status" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "push_sent_at" TIMESTAMPTZ(6);

-- 3. Clean up any duplicate pending rows (keep the newest per student+partner),
--    otherwise the unique index cannot be created.
UPDATE "public"."partner_verification_requests" r
SET "status" = 'expired'
WHERE r."status" = 'pending'
  AND EXISTS (
      SELECT 1
      FROM "public"."partner_verification_requests" n
      WHERE n."student_id" = r."student_id"
        AND n."partner_id" = r."partner_id"
        AND n."status" = 'pending'
        AND (n."created_at" > r."created_at"
             OR (n."created_at" = r."created_at" AND n."id" > r."id"))
  );

-- 4. At most ONE pending request per student per partner, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_partner_verify_one_pending"
    ON "public"."partner_verification_requests" ("student_id", "partner_id")
    WHERE "status" = 'pending';

-- 5. Supports the per-student request cap (student, partner, recent created_at).
CREATE INDEX IF NOT EXISTS "idx_partner_verify_student_partner_created"
    ON "public"."partner_verification_requests" ("student_id", "partner_id", "created_at" DESC);
