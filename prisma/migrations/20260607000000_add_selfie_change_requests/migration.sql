-- CreateTable
CREATE TABLE "public"."selfie_change_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "student_id" UUID NOT NULL,
    "new_selfie_path" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "selfie_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_selfie_change_status_created" ON "public"."selfie_change_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "public"."selfie_change_requests" ADD CONSTRAINT "selfie_change_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
