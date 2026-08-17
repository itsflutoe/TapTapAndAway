-- =====================================================
-- 011: Apply events + notify users on broadcast/events
-- =====================================================

-- Notify every non-banned user (used by broadcast + events)
CREATE OR REPLACE FUNCTION public.notify_all_users(
  p_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT id, p_type, p_title, p_message, COALESCE(p_data, '{}'::jsonb)
  FROM public.profiles
  WHERE COALESCE(is_banned, false) = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_all_users(text, text, text, jsonb) TO authenticated;

-- Harden broadcast (same as before, explicit types)
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

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'Message required';
  END IF;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (p_user_id, 'admin_message', trim(p_title), trim(p_message), jsonb_build_object('from_admin', true));
    v_count := 1;
  ELSE
    v_count := public.notify_all_users(
      'admin_message',
      trim(p_title),
      trim(p_message),
      jsonb_build_object('from_admin', true, 'broadcast', true)
    );
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_me,
    'broadcast',
    CASE WHEN p_user_id IS NULL THEN 'all' ELSE 'user' END,
    p_user_id,
    jsonb_build_object('title', p_title, 'count', v_count)
  );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_broadcast(text, text, uuid) TO authenticated;

-- Create event + notify users
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
  v_title text;
  v_body text;
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

  -- Notify if event is already in window (or starts within 1 hour)
  IF p_starts_at <= NOW() + interval '1 hour' AND p_ends_at > NOW() THEN
    v_title := 'Event: ' || trim(p_name);
    v_body := COALESCE(
      NULLIF(trim(COALESCE(p_description, '')), ''),
      CASE p_event_type
        WHEN 'free_sends' THEN 'Free pigeon deliveries are active!'
        WHEN 'stamp_multiplier' THEN 'Special stamp rates are active.'
        WHEN 'speed_multiplier' THEN 'Pigeons are flying faster!'
        WHEN 'double_daily' THEN 'Double daily stamp reward is active.'
        ELSE 'A new event is live.'
      END
    );
    PERFORM public.notify_all_users(
      'event',
      v_title,
      v_body,
      jsonb_build_object('event_id', v_id, 'event_type', p_event_type)
    );
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event(text, text, text, jsonb, timestamptz, timestamptz) TO authenticated;

-- Active event effects for client (single JSON)
CREATE OR REPLACE FUNCTION public.get_event_effects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_free boolean := false;
  v_stamp_mult numeric := 1;
  v_speed_mult numeric := 1;
  v_double_daily boolean := false;
  r record;
BEGIN
  FOR r IN
    SELECT event_type, config
    FROM public.app_events
    WHERE is_active = true
      AND starts_at <= NOW()
      AND ends_at > NOW()
  LOOP
    IF r.event_type = 'free_sends' THEN
      v_free := true;
    ELSIF r.event_type = 'stamp_multiplier' THEN
      v_stamp_mult := GREATEST(
        v_stamp_mult,
        COALESCE((r.config->>'multiplier')::numeric, 1)
      );
    ELSIF r.event_type = 'speed_multiplier' THEN
      v_speed_mult := GREATEST(
        v_speed_mult,
        COALESCE((r.config->>'multiplier')::numeric, 1)
      );
    ELSIF r.event_type = 'double_daily' THEN
      v_double_daily := true;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'free_sends', v_free,
    'stamp_multiplier', v_stamp_mult,
    'speed_multiplier', v_speed_mult,
    'double_daily', v_double_daily
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_effects() TO authenticated, anon;

-- Mark notifications read
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_ids IS NULL THEN
    UPDATE public.notifications
    SET read = true
    WHERE user_id = v_me AND read = false;
  ELSE
    UPDATE public.notifications
    SET read = true
    WHERE user_id = v_me AND id = ANY(p_ids);
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;
