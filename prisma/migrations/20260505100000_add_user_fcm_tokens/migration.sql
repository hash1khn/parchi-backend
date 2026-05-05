-- Create user_fcm_tokens table for multi-device push notification support
CREATE TABLE IF NOT EXISTS "public"."user_fcm_tokens" (
  "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "user_id"    UUID        NOT NULL,
  "token"      TEXT        NOT NULL,
  "platform"   VARCHAR(20),
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT "user_fcm_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_fcm_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."public_users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_fcm_tokens_user_token_unique" UNIQUE ("user_id", "token")
);

CREATE INDEX IF NOT EXISTS "idx_user_fcm_tokens_user_id" ON "public"."user_fcm_tokens"("user_id");
