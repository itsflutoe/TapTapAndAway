-- =====================================================
-- 008: Admin Phase A — audit log, reports, broadcast, economy pause
-- Run in Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log(created_at DESC);

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

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins all audit" ON public.admin_audit_log;
CREATE POLICY "Admins all audit" ON public.admin_audit_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

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

CREATE OR REPLACE FUNCTION public.admin_log(
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, COALESCE(p_details, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_log(text, text, uuid, jsonb) TO authenticated;

-- Wrap stamp adjust with audit
CREATE OR REPLACE FUNCTION public.admin_adjust_stamps(
  p_user_id uuid,
  p_delta integer,
  p_description text DEFAULT 'Admin adjustment'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_new integer;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_new := public.adjust_stamps(p_user_id, p_delta, 'admin_adjustment', NULL, p_description);

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me,
    'adjust_stamps',
    'user',
    p_user_id,
    jsonb_build_object('delta', p_delta, 'description', p_description, 'new_balance', v_new)
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_stamps(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT 'Admin set balance'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_old integer;
  v_new integer;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT stamp_balance INTO v_old FROM public.profiles WHERE id = p_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  UPDATE public.profiles
  SET stamp_balance = GREATEST(0, p_amount)
  WHERE id = p_user_id
  RETURNING stamp_balance INTO v_new;

  INSERT INTO public.stamp_transactions (user_id, amount, transaction_type, description)
  VALUES (p_user_id, v_new - v_old, 'admin_adjustment', p_description);

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me, 'set_stamps', 'user', p_user_id,
    jsonb_build_object('old', v_old, 'new', v_new, 'description', p_description)
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_stamps(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stamps(uuid, integer, text) TO authenticated;

-- Broadcast notification to all users (or one user if p_user_id set)
CREATE OR REPLACE FUNCTION public.admin_broadcast(
  p_title text,
  p_message text,
  p_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (p_user_id, 'admin_message', p_title, p_message);
    v_count := 1;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT id, 'admin_message', p_title, p_message FROM public.profiles
    WHERE is_banned = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me, 'broadcast', CASE WHEN p_user_id IS NULL THEN 'all' ELSE 'user' END, p_user_id,
    jsonb_build_object('title', p_title, 'count', v_count)
  );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_broadcast(text, text, uuid) TO authenticated;

-- Economy pause helper (reads system_settings)
CREATE OR REPLACE FUNCTION public.is_sending_paused()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}') IN ('true', '1', 'yes')
     FROM public.system_settings WHERE key = 'sending_paused'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_sending_paused() TO authenticated, anon;

-- Ensure default settings exist
INSERT INTO public.system_settings (key, value)
VALUES
  ('sending_paused', 'false'::jsonb),
  ('max_stamps_per_user', '10000'::jsonb),
  ('max_sends_per_hour', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_reports TO authenticated;
