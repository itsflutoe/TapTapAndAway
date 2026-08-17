-- =====================================================
-- 009: Admin Phase B — reports, bulk codes, bulk stuck
-- Run in Supabase SQL Editor after 008
-- =====================================================

-- Ensure reports table exists (from 008)
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_note TEXT,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports(status, created_at DESC);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert reports" ON public.user_reports;
CREATE POLICY "Users insert reports" ON public.user_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users view own reports" ON public.user_reports;
CREATE POLICY "Users view own reports" ON public.user_reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins manage reports" ON public.user_reports;
CREATE POLICY "Admins manage reports" ON public.user_reports FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

GRANT SELECT, INSERT, UPDATE ON public.user_reports TO authenticated;

-- Admins can read all redemptions for analytics
DROP POLICY IF EXISTS "Admins view all redemptions" ON public.redeem_code_redemptions;
CREATE POLICY "Admins view all redemptions" ON public.redeem_code_redemptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Submit report (user)
CREATE OR REPLACE FUNCTION public.submit_user_report(
  p_reported_user_id uuid,
  p_reason text,
  p_details text DEFAULT NULL,
  p_message_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_reported_user_id IS NULL OR p_reported_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid report target';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason required';
  END IF;

  INSERT INTO public.user_reports (reporter_id, reported_user_id, message_id, reason, details)
  VALUES (v_me, p_reported_user_id, p_message_id, trim(p_reason), NULLIF(trim(COALESCE(p_details, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_user_report(uuid, text, text, uuid) TO authenticated;

-- Resolve / dismiss report
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_status text,
  p_admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_status NOT IN ('reviewing', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.user_reports
  SET
    status = p_status,
    admin_note = COALESCE(p_admin_note, admin_note),
    resolved_by = CASE WHEN p_status IN ('resolved', 'dismissed') THEN v_me ELSE resolved_by END,
    resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN NOW() ELSE resolved_at END
  WHERE id = p_report_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me, 'resolve_report', 'report', p_report_id,
    jsonb_build_object('status', p_status, 'note', p_admin_note)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text) TO authenticated;

-- Bulk create redeem codes: PREFIX + random suffix
CREATE OR REPLACE FUNCTION public.admin_bulk_create_codes(
  p_prefix text,
  p_count integer,
  p_stamp_amount integer,
  p_max_uses integer DEFAULT 1,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_codes text[] := '{}';
  v_i integer;
  v_code text;
  v_prefix text;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_count IS NULL OR p_count < 1 OR p_count > 100 THEN
    RAISE EXCEPTION 'Count must be 1–100';
  END IF;
  IF p_stamp_amount IS NULL OR p_stamp_amount < 1 THEN
    RAISE EXCEPTION 'Invalid stamp amount';
  END IF;

  v_prefix := upper(regexp_replace(COALESCE(p_prefix, 'CODE'), '[^A-Z0-9]', '', 'g'));
  IF length(v_prefix) = 0 THEN v_prefix := 'CODE'; END IF;

  FOR v_i IN 1..p_count LOOP
    v_code := v_prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    INSERT INTO public.redeem_codes (code, stamp_amount, max_uses, expires_at, created_by)
    VALUES (v_code, p_stamp_amount, p_max_uses, p_expires_at, v_me);
    v_codes := array_append(v_codes, v_code);
  END LOOP;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, details)
  VALUES (
    v_me, 'bulk_create_codes', 'codes',
    jsonb_build_object('prefix', v_prefix, 'count', p_count, 'amount', p_stamp_amount)
  );

  RETURN v_codes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_create_codes(text, integer, integer, integer, timestamptz) TO authenticated;

-- Bulk force-complete overdue flying deliveries
CREATE OR REPLACE FUNCTION public.admin_bulk_force_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_count integer := 0;
  r record;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  FOR r IN
    SELECT id FROM public.deliveries
    WHERE status IN ('DISPATCHED', 'FLYING', 'PREPARING')
      AND actual_departure IS NOT NULL
      AND actual_departure + (COALESCE(estimated_duration_seconds, 0) || ' seconds')::interval < NOW() - interval '5 seconds'
  LOOP
    PERFORM public.admin_force_deliver(r.id);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, details)
  VALUES (v_me, 'bulk_force_overdue', 'deliveries', jsonb_build_object('count', v_count));

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_force_overdue() TO authenticated;

-- Bulk cancel overdue + refund
CREATE OR REPLACE FUNCTION public.admin_bulk_cancel_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_count integer := 0;
  r record;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  FOR r IN
    SELECT id FROM public.deliveries
    WHERE status IN ('DISPATCHED', 'FLYING', 'PREPARING')
      AND actual_departure IS NOT NULL
      AND actual_departure + (COALESCE(estimated_duration_seconds, 0) || ' seconds')::interval < NOW() - interval '5 seconds'
  LOOP
    PERFORM public.admin_cancel_delivery(r.id, true);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, details)
  VALUES (v_me, 'bulk_cancel_overdue', 'deliveries', jsonb_build_object('count', v_count));

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_cancel_overdue() TO authenticated;
