-- =====================================================
-- 012: pigeon.sprite_id for basic starter appearances
-- Preserves existing pigeon ids, names, genders, owners
-- =====================================================

ALTER TABLE public.pigeons
  ADD COLUMN IF NOT EXISTS sprite_id TEXT;

-- One-time: only pigeons with missing sprite_id
UPDATE public.pigeons
SET sprite_id = 'basic-' || lpad((1 + floor(random() * 9)::int)::text, 2, '0')
WHERE sprite_id IS NULL OR btrim(sprite_id) = '';

ALTER TABLE public.pigeons DROP CONSTRAINT IF EXISTS pigeons_sprite_id_format;
ALTER TABLE public.pigeons
  ADD CONSTRAINT pigeons_sprite_id_format
  CHECK (sprite_id IS NULL OR sprite_id ~ '^[a-z0-9]+-[0-9]{2}$');

CREATE INDEX IF NOT EXISTS idx_pigeons_sprite_id ON public.pigeons(sprite_id);

-- Signup: same as 002, plus random basic sprite once
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
  v_sprite TEXT;
BEGIN
  v_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  IF v_username IS NULL THEN
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

  v_sprite := 'basic-' || lpad((1 + floor(random() * 9)::int)::text, 2, '0');

  INSERT INTO public.profiles (
    id, username, display_name, gender, address, latitude, longitude, stamp_balance
  ) VALUES (
    NEW.id, v_username, v_display_name, v_gender, v_address, v_lat, v_lng, v_bonus
  );

  INSERT INTO public.pigeons (owner_id, name, gender, speed, stamina, reliability, sprite_id)
  VALUES (NEW.id, v_pigeon_name, v_pigeon_gender, 100.00, 50.00, 95.00, v_sprite);

  INSERT INTO public.stamp_transactions (user_id, amount, transaction_type, description)
  VALUES (NEW.id, v_bonus, 'signup_bonus', 'Welcome bonus stamps');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
