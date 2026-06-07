-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "deactivation_reason" TEXT;
