-- =====================================================
-- 013: last_seen presence + admin set pigeon sprite
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC NULLS LAST);

-- Own heartbeat (every ~2 min from client)
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- Admin assigns sprite (does not change random signup pool)
CREATE OR REPLACE FUNCTION public.admin_set_pigeon_sprite(
  p_user_id UUID,
  p_sprite_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_sid := lower(trim(p_sprite_id));
  IF v_sid IS NULL OR v_sid = '' THEN
    RAISE EXCEPTION 'sprite_id required';
  END IF;
  IF v_sid !~ '^[a-z0-9]+-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid sprite_id format (use like basic-07 or basic-11)';
  END IF;

  UPDATE public.pigeons
  SET sprite_id = v_sid
  WHERE owner_id = p_user_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active pigeon for user';
  END IF;

  PERFORM public.admin_log(
    'set_sprite',
    'user',
    p_user_id,
    jsonb_build_object('sprite_id', v_sid)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_pigeon_sprite(UUID, TEXT) TO authenticated;
