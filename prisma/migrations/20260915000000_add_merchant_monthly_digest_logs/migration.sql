-- Month-end merchant digest send log (idempotency + ops)
CREATE TABLE IF NOT EXISTS "public"."merchant_monthly_digest_logs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "merchant_id" UUID NOT NULL,
  "period_year" INTEGER NOT NULL,
  "period_month" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "recipient_email" VARCHAR(255),
  "redemption_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_monthly_digest_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_monthly_digest_logs_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_merchant_monthly_digest"
  ON "public"."merchant_monthly_digest_logs" ("merchant_id", "period_year", "period_month");

CREATE INDEX IF NOT EXISTS "idx_merchant_digest_period"
  ON "public"."merchant_monthly_digest_logs" ("period_year", "period_month");
