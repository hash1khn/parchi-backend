-- Paid-checkout attribution must survive verification TTL cleanup.
-- Idempotent if the previous migration already used ON DELETE RESTRICT.

ALTER TABLE "public"."partner_discount_redemptions"
    DROP CONSTRAINT IF EXISTS "partner_discount_redemptions_verification_request_id_fkey";

ALTER TABLE "public"."partner_discount_redemptions"
    ADD CONSTRAINT "partner_discount_redemptions_verification_request_id_fkey"
    FOREIGN KEY ("verification_request_id") REFERENCES "public"."partner_verification_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
