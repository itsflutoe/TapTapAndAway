-- =====================================================
-- Fix signup trigger failures that cause Auth HTTP 500
-- Run this in Supabase SQL Editor if 001 was already applied
-- =====================================================

-- Harden profile PID generator
CREATE OR REPLACE FUNCTION public.generate_pigeon_id()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'PID-';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_unique_pigeon_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pigeon_id IS NULL OR NEW.pigeon_id = '' THEN
    LOOP
      NEW.pigeon_id := public.generate_pigeon_id();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE pigeon_id = NEW.pigeon_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Fixed handle_new_user: defensive defaults, search_path, safe JSONB cast
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_display_name TEXT;
  v_gender TEXT;
  v_address TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_pigeon_gender TEXT;
  v_pigeon_name TEXT;
  v_bonus INTEGER := 10;
BEGIN
  v_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  IF v_username IS NULL THEN
    -- Fallback so NOT NULL never fails the whole auth insert
    v_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12);
  END IF;

  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    v_username
  );

  v_gender := COALESCE(NEW.raw_user_meta_data->>'gender', 'prefer_not_to_say');
  IF v_gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
    v_gender := 'prefer_not_to_say';
  END IF;

  v_address := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'address'), ''), 'Unknown');

  BEGIN
    v_lat := NULLIF(NEW.raw_user_meta_data->>'latitude', '')::DOUBLE PRECISION;
  EXCEPTION WHEN OTHERS THEN
    v_lat := NULL;
  END;

  BEGIN
    v_lng := NULLIF(NEW.raw_user_meta_data->>'longitude', '')::DOUBLE PRECISION;
  EXCEPTION WHEN OTHERS THEN
    v_lng := NULL;
  END;

  IF v_gender = 'female' THEN
    v_pigeon_gender := 'female';
  ELSIF v_gender = 'male' THEN
    v_pigeon_gender := 'male';
  ELSE
    v_pigeon_gender := CASE WHEN random() < 0.5 THEN 'male' ELSE 'female' END;
  END IF;

  v_pigeon_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'pigeon_name'), ''),
    'Mochi'
  );

  BEGIN
    SELECT COALESCE((value #>> '{}')::integer, 10)
    INTO v_bonus
    FROM public.system_settings
    WHERE key = 'signup_stamp_bonus';
  EXCEPTION WHEN OTHERS THEN
    v_bonus := 10;
  END;

  IF v_bonus IS NULL THEN
    v_bonus := 10;
  END IF;

  INSERT INTO public.profiles (
    id, username, display_name, gender, address, latitude, longitude, stamp_balance
  ) VALUES (
    NEW.id, v_username, v_display_name, v_gender, v_address, v_lat, v_lng, v_bonus
  );

  INSERT INTO public.pigeons (owner_id, name, gender, speed, stamina, reliability)
  VALUES (NEW.id, v_pigeon_name, v_pigeon_gender, 100.00, 50.00, 95.00);

  INSERT INTO public.stamp_transactions (user_id, amount, transaction_type, description)
  VALUES (NEW.id, v_bonus, 'signup_bonus', 'Welcome bonus stamps');

  RETURN NEW;
END;
$$;

-- Ensure trigger exists and points at the fixed function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Allow the trigger (security definer) path to be clear; grants for authenticated reads remain via RLS
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- stamp_transactions: allow insert only via security definer functions in practice;
-- keep select for own rows (already in 001). Add insert policy for own rows as safety net.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stamp_transactions'
      AND policyname = 'Users insert own stamp transactions'
  ) THEN
    CREATE POLICY "Users insert own stamp transactions"
      ON public.stamp_transactions FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
