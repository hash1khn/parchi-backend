-- Migration: Replace CNIC-based deduplication with Institute + Student ID Number
-- Date: 2026-05-04

-- Add institute_id and student_id_number columns to students table
ALTER TABLE "public"."students"
  ADD COLUMN IF NOT EXISTS "institute_id" UUID,
  ADD COLUMN IF NOT EXISTS "student_id_number" VARCHAR(100);

-- Add foreign key from students.institute_id -> institutes.id (nullable)
ALTER TABLE "public"."students"
  ADD CONSTRAINT "students_institute_id_fkey"
    FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

-- Unique index: one student_id_number per institute (nulls are excluded from unique check)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_students_institute_id_number"
  ON "public"."students" ("institute_id", "student_id_number")
  WHERE "institute_id" IS NOT NULL AND "student_id_number" IS NOT NULL;

-- Index to quickly look up all students of a given institute
CREATE INDEX IF NOT EXISTS "idx_students_institute"
  ON "public"."students" ("institute_id");
