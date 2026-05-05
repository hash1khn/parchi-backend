-- Add semantic version fields to app_configs
ALTER TABLE "public"."app_configs"
  ADD COLUMN IF NOT EXISTS "min_android_version" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS "min_ios_version" TEXT NOT NULL DEFAULT '1.0.0';
