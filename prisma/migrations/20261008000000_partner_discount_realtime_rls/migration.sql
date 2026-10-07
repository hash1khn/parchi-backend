-- Students can read their own partner discount rows (needed for Supabase Realtime
-- on the in-app "waiting for payment" → ALL DONE screen). Writes stay in NestJS.
CREATE POLICY "students_read_own_partner_discount_redemptions"
ON "public"."partner_discount_redemptions"
FOR SELECT
USING (
    student_id IN (
        SELECT id FROM public.students WHERE user_id = auth.uid()
    )
);

-- Realtime for the open verify screen after approve. Polling still works if this fails.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_discount_redemptions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
