-- =====================================================
-- 010: Admin Phase C — events, admin roles, maintenance
-- Run after 009
-- =====================================================

CREATE TABLE IF NOT EXISTS public.app_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'banner',
      'stamp_multiplier',
      'speed_multiplier',
      'double_daily',
      'free_sends'
    )
  ),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_events_active
  ON public.app_events(is_active, starts_at, ends_at);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read active events" ON public.app_events;
CREATE POLICY "Anyone read active events" ON public.app_events FOR SELECT
  USING (
    is_active = true
    AND starts_at <= NOW()
    AND ends_at > NOW()
  );

DROP POLICY IF EXISTS "Admins manage events" ON public.app_events;
CREATE POLICY "Admins manage events" ON public.app_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

GRANT SELECT ON public.app_events TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.app_events TO authenticated;

-- Maintenance + health defaults
INSERT INTO public.system_settings (key, value)
VALUES
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_message', '"We are performing a short update. Sending is paused."'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_maintenance_mode()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}') IN ('true', '1', 'yes')
     FROM public.system_settings WHERE key = 'maintenance_mode'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_maintenance_mode() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_maintenance_message()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'maintenance_message'),
    'Maintenance in progress.'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_message() TO authenticated, anon;

-- Active events for app (banner / multipliers)
CREATE OR REPLACE FUNCTION public.get_active_events()
RETURNS SETOF public.app_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.app_events
  WHERE is_active = true
    AND starts_at <= NOW()
    AND ends_at > NOW()
  ORDER BY starts_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_events() TO authenticated, anon;

-- Create event
CREATE OR REPLACE FUNCTION public.admin_create_event(
  p_name text,
  p_description text,
  p_event_type text,
  p_config jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz
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
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be after starts_at';
  END IF;

  INSERT INTO public.app_events (
    name, description, event_type, config, starts_at, ends_at, created_by
  )
  VALUES (
    trim(p_name),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_event_type,
    COALESCE(p_config, '{}'::jsonb),
    p_starts_at,
    p_ends_at,
    v_me
  )
  RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me, 'create_event', 'event', v_id,
    jsonb_build_object('name', p_name, 'type', p_event_type)
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event(text, text, text, jsonb, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_event_active(p_event_id uuid, p_active boolean)
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

  UPDATE public.app_events SET is_active = p_active WHERE id = p_event_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (v_me, CASE WHEN p_active THEN 'enable_event' ELSE 'disable_event' END, 'event', p_event_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_event_active(uuid, boolean) TO authenticated;

-- Grant / revoke admin (cannot strip your own admin)
CREATE OR REPLACE FUNCTION public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
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

  IF p_user_id = v_me AND p_is_admin = false THEN
    RAISE EXCEPTION 'You cannot remove your own admin access';
  END IF;

  UPDATE public.profiles SET is_admin = p_is_admin WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me,
    CASE WHEN p_is_admin THEN 'grant_admin' ELSE 'revoke_admin' END,
    'user',
    p_user_id,
    jsonb_build_object('is_admin', p_is_admin)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;

-- Soft-disable account (ban + optional note via existing ban)
-- Admin message search is RLS-backed (Admins view all messages from 005)
