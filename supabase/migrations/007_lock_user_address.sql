-- =====================================================
-- 007: Address is set once at signup; only admins can change it
-- Run in Supabase SQL Editor
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_user_address_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  -- Admins may change any address fields
  SELECT is_admin INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admins: block changes to location fields after insert
  IF TG_OP = 'UPDATE' THEN
    IF NEW.address IS DISTINCT FROM OLD.address
       OR NEW.latitude IS DISTINCT FROM OLD.latitude
       OR NEW.longitude IS DISTINCT FROM OLD.longitude
    THEN
      RAISE EXCEPTION 'Address can only be set at signup. Contact an admin to change it.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_address ON public.profiles;
CREATE TRIGGER trg_lock_address
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_address_change();

-- Admin-only RPC to update a user's address + coordinates
CREATE OR REPLACE FUNCTION public.admin_set_address(
  p_user_id uuid,
  p_address text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
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

  UPDATE public.profiles
  SET
    address = trim(p_address),
    latitude = p_latitude,
    longitude = p_longitude,
    updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_address(uuid, text, double precision, double precision) TO authenticated;
