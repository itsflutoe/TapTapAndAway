-- =====================================================
-- TAP TAP AND AWAY - Phase 1 Database Schema
-- Run this in the Supabase SQL Editor
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  pigeon_id TEXT UNIQUE NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  avatar_url TEXT,
  stamp_balance INTEGER NOT NULL DEFAULT 10 CHECK (stamp_balance >= 0),
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_pigeon_id ON public.profiles(pigeon_id);

-- PIGEONS
CREATE TABLE public.pigeons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Unnamed',
  gender TEXT CHECK (gender IN ('male', 'female')),
  species TEXT NOT NULL DEFAULT 'standard',
  speed NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  stamina NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  reliability NUMERIC(5,2) NOT NULL DEFAULT 95.00,
  rarity TEXT NOT NULL DEFAULT 'common',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pigeons_owner ON public.pigeons(owner_id);

-- FRIENDSHIPS
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, receiver_id),
  CHECK (requester_id <> receiver_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_receiver ON public.friendships(receiver_id);

-- CONVERSATIONS
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user ON public.conversation_members(user_id);

-- MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  stamp_cost INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);

-- DELIVERIES
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  pigeon_id UUID REFERENCES public.pigeons(id) ON DELETE SET NULL,
  origin_latitude DOUBLE PRECISION NOT NULL,
  origin_longitude DOUBLE PRECISION NOT NULL,
  destination_latitude DOUBLE PRECISION NOT NULL,
  destination_longitude DOUBLE PRECISION NOT NULL,
  distance_km NUMERIC(10,2) NOT NULL,
  base_speed_mph NUMERIC(6,2) NOT NULL DEFAULT 100.00,
  modified_speed_mph NUMERIC(6,2) NOT NULL,
  weather TEXT,
  weather_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  estimated_duration_seconds INTEGER NOT NULL,
  actual_departure TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PREPARING' CHECK (status IN (
    'DRAFT', 'PREPARING', 'DISPATCHED', 'FLYING', 'ARRIVED', 'DELIVERED', 'READ', 'FAILED'
  )),
  failure_reason TEXT,
  progress_percent NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_deliveries_message ON public.deliveries(message_id);

-- STAMP TRANSACTIONS
CREATE TABLE public.stamp_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'signup_bonus', 'daily_reward', 'message_sent', 'failed_delivery_refund',
    'admin_adjustment', 'purchase', 'other'
  )),
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stamp_transactions_user ON public.stamp_transactions(user_id);

-- DAILY REWARDS
CREATE TABLE public.daily_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, reward_date)
);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);

-- SYSTEM SETTINGS
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

INSERT INTO public.system_settings (key, value, description) VALUES
  ('pigeon_base_speed_mph', '100', 'Base pigeon flight speed in mph'),
  ('failure_probability', '0.005', 'Probability of pigeon delivery failure (0-1)'),
  ('time_multiplier', '3600', 'Dev time multiplier: 1 real second = N simulated seconds. Set to 1 for production'),
  ('daily_stamp_reward', '1', 'Free stamps given daily'),
  ('signup_stamp_bonus', '10', 'Stamps given on signup'),
  ('weather_modifiers', '{"clear":1.0,"cloudy":0.95,"rain":0.80,"heavy_rain":0.65,"storm":0.50}', 'Speed multipliers by weather'),
  ('stamp_cost_per_70km', '1', 'Stamp cost tiers every 70 km');

-- Generate unique Pigeon ID
CREATE OR REPLACE FUNCTION generate_pigeon_id()
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_unique_pigeon_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pigeon_id IS NULL OR NEW.pigeon_id = '' THEN
    LOOP
      NEW.pigeon_id := generate_pigeon_id();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE pigeon_id = NEW.pigeon_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_pigeon_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION ensure_unique_pigeon_id();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pigeons_updated BEFORE UPDATE ON public.pigeons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_friendships_updated BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Safe stamp adjustment
CREATE OR REPLACE FUNCTION adjust_stamps(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET stamp_balance = stamp_balance + p_amount
  WHERE id = p_user_id
  RETURNING stamp_balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient stamps';
  END IF;

  INSERT INTO public.stamp_transactions (user_id, amount, transaction_type, reference_id, description)
  VALUES (p_user_id, p_amount, p_type, p_reference_id, p_description);

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION claim_daily_reward(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  reward_amt INTEGER;
  already_claimed BOOLEAN;
BEGIN
  SELECT (value::text)::integer INTO reward_amt FROM public.system_settings WHERE key = 'daily_stamp_reward';
  IF reward_amt IS NULL THEN reward_amt := 1; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.daily_rewards
    WHERE user_id = p_user_id AND reward_date = CURRENT_DATE
  ) INTO already_claimed;

  IF already_claimed THEN
    RETURN 0;
  END IF;

  INSERT INTO public.daily_rewards (user_id, reward_date, amount)
  VALUES (p_user_id, CURRENT_DATE, reward_amt);

  RETURN adjust_stamps(p_user_id, reward_amt, 'daily_reward', NULL, 'Daily stamp reward');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pigeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "View own or friends pigeons" ON public.pigeons FOR SELECT USING (
  owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.status = 'accepted' AND
    ((f.requester_id = auth.uid() AND f.receiver_id = owner_id) OR (f.receiver_id = auth.uid() AND f.requester_id = owner_id))
  )
);
CREATE POLICY "Insert own pigeons" ON public.pigeons FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Update own pigeons" ON public.pigeons FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "View own friendships" ON public.friendships FOR SELECT USING (requester_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Create friend requests" ON public.friendships FOR INSERT WITH CHECK (requester_id = auth.uid());
CREATE POLICY "Update friendships" ON public.friendships FOR UPDATE USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "View own conversations" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = auth.uid())
);
CREATE POLICY "View conversation members" ON public.conversation_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_members.conversation_id AND cm.user_id = auth.uid())
);

CREATE POLICY "View own messages" ON public.messages FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "Insert messages as sender" ON public.messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Update received messages" ON public.messages FOR UPDATE USING (receiver_id = auth.uid());

CREATE POLICY "View related deliveries" ON public.deliveries FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid()))
);

CREATE POLICY "View own stamp transactions" ON public.stamp_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "View own daily rewards" ON public.daily_rewards FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "View own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins view settings" ON public.system_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Auth trigger for new user
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
