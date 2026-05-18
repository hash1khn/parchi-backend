-- CreateEnum
CREATE TYPE "public"."qr_request_status" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'auto_approved');

-- AlterTable
ALTER TABLE "public"."merchant_branches" ADD COLUMN "qr_auto_approve" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "public"."qr_redemption_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "branch_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "status" "public"."qr_request_status" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "redemption_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "qr_redemption_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_qr_requests_branch_status" ON "public"."qr_redemption_requests"("branch_id", "status");

-- CreateIndex
CREATE INDEX "idx_qr_requests_student_status" ON "public"."qr_redemption_requests"("student_id", "status");

-- CreateIndex
CREATE INDEX "idx_qr_requests_expires" ON "public"."qr_redemption_requests"("expires_at");

-- AddForeignKey
ALTER TABLE "public"."qr_redemption_requests" ADD CONSTRAINT "qr_redemption_requests_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "public"."merchant_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."qr_redemption_requests" ADD CONSTRAINT "qr_redemption_requests_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."qr_redemption_requests" ADD CONSTRAINT "qr_redemption_requests_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_qr_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_qr_requests_updated_at
BEFORE UPDATE ON "public"."qr_redemption_requests"
FOR EACH ROW EXECUTE FUNCTION update_qr_requests_updated_at();

-- Enable Supabase Realtime for branch dashboard subscriptions
-- Run manually in Supabase SQL editor if not already set:
-- ALTER PUBLICATION supabase_realtime ADD TABLE "public"."qr_redemption_requests";
