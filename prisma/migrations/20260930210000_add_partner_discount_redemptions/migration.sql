-- Attribution log: IK reports a paid checkout where a Parchi student discount was applied.
-- Parchi does not take payment or issue tickets; this is an audit / attribution row only.

CREATE TABLE "public"."partner_discount_redemptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "partner_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "external_reference" VARCHAR(255) NOT NULL,
    "event_label" VARCHAR(255),
    "discount_amount_pkr" DECIMAL(12, 2) NOT NULL,
    "order_total_pkr" DECIMAL(12, 2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "partner_discount_redemptions_pkey" PRIMARY KEY ("id")
);

-- One log per verification request (an approval cannot be spent twice).
CREATE UNIQUE INDEX "partner_discount_redemptions_verification_request_id_key"
    ON "public"."partner_discount_redemptions"("verification_request_id");

-- Safe IK retries: same partner + same order id returns the existing row.
CREATE UNIQUE INDEX "uq_partner_discount_partner_ref"
    ON "public"."partner_discount_redemptions"("partner_id", "external_reference");

CREATE INDEX "idx_partner_discount_partner_created"
    ON "public"."partner_discount_redemptions"("partner_id", "created_at" DESC);

CREATE INDEX "idx_partner_discount_student_created"
    ON "public"."partner_discount_redemptions"("student_id", "created_at" DESC);

ALTER TABLE "public"."partner_discount_redemptions"
    ADD CONSTRAINT "partner_discount_redemptions_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "public"."partner_api_keys"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."partner_discount_redemptions"
    ADD CONSTRAINT "partner_discount_redemptions_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict: verification TTL cleanup must not wipe paid-checkout attribution rows.
ALTER TABLE "public"."partner_discount_redemptions"
    ADD CONSTRAINT "partner_discount_redemptions_verification_request_id_fkey"
    FOREIGN KEY ("verification_request_id") REFERENCES "public"."partner_verification_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION update_partner_discount_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_partner_discount_updated_at
BEFORE UPDATE ON "public"."partner_discount_redemptions"
FOR EACH ROW EXECUTE FUNCTION update_partner_discount_updated_at();

ALTER TABLE "public"."partner_discount_redemptions" ENABLE ROW LEVEL SECURITY;
