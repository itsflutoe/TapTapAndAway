-- =====================================================
-- 006: Pigeon lifetime stats + rate limit helper
-- Run in Supabase SQL Editor
-- =====================================================

ALTER TABLE public.pigeons
  ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_flights INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_flights INTEGER NOT NULL DEFAULT 0;

-- Increment pigeon stats on successful delivery (call from client completeDelivery or trigger)
CREATE OR REPLACE FUNCTION public.record_successful_flight(
  p_pigeon_id uuid,
  p_distance_km numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pigeon_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.pigeons
  SET
    total_distance_km = total_distance_km + GREATEST(0, COALESCE(p_distance_km, 0)),
    total_flights = total_flights + 1,
    successful_flights = successful_flights + 1,
    updated_at = NOW()
  WHERE id = p_pigeon_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_failed_flight(p_pigeon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pigeon_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.pigeons
  SET total_flights = total_flights + 1, updated_at = NOW()
  WHERE id = p_pigeon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_successful_flight(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_flight(uuid) TO authenticated;

-- Rate limit: max N messages per window from same sender
CREATE OR REPLACE FUNCTION public.can_send_message(p_user_id uuid, p_max integer DEFAULT 5, p_window_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.messages
  WHERE sender_id = p_user_id
    AND created_at > NOW() - make_interval(secs => p_window_seconds);

  RETURN v_count < p_max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_send_message(uuid, integer, integer) TO authenticated;

-- Mark tutorial complete
CREATE OR REPLACE FUNCTION public.complete_tutorial(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.profiles SET tutorial_completed = true WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_tutorial(uuid) TO authenticated;

-- Allow any authenticated user to read time_multiplier (needed for accurate delivery ETA)
CREATE OR REPLACE FUNCTION public.get_time_multiplier()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  SELECT COALESCE((value #>> '{}')::numeric, 1) INTO v
  FROM public.system_settings
  WHERE key = 'time_multiplier';
  IF v IS NULL OR v <= 0 THEN
    RETURN 1;
  END IF;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_time_multiplier() TO authenticated, anon;
