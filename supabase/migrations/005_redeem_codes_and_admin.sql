-- =====================================================
-- 005: Redeem codes + admin helpers
-- Run in Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.redeem_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  stamp_amount INTEGER NOT NULL CHECK (stamp_amount > 0),
  max_uses INTEGER, -- NULL = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.redeem_code_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_id UUID NOT NULL REFERENCES public.redeem_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stamp_amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON public.redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_redemptions_user ON public.redeem_code_redemptions(user_id);

ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redeem_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Users cannot list all codes; only redeem via RPC
DROP POLICY IF EXISTS "Admins manage redeem codes" ON public.redeem_codes;
CREATE POLICY "Admins manage redeem codes"
  ON public.redeem_codes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Users view own redemptions" ON public.redeem_code_redemptions;
CREATE POLICY "Users view own redemptions"
  ON public.redeem_code_redemptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Redeem a code (server-side validation)
CREATE OR REPLACE FUNCTION public.redeem_stamp_code(p_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.redeem_codes%ROWTYPE;
  v_new_balance integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.redeem_codes
  WHERE upper(code) = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;

  IF NOT v_row.is_active THEN
    RAISE EXCEPTION 'This code is no longer active';
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW() THEN
    RAISE EXCEPTION 'This code has expired';
  END IF;

  IF v_row.max_uses IS NOT NULL AND v_row.used_count >= v_row.max_uses THEN
    RAISE EXCEPTION 'This code has reached its maximum uses';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.redeem_code_redemptions
    WHERE code_id = v_row.id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'You already redeemed this code';
  END IF;

  UPDATE public.redeem_codes
  SET used_count = used_count + 1
  WHERE id = v_row.id;

  INSERT INTO public.redeem_code_redemptions (code_id, user_id, stamp_amount)
  VALUES (v_row.id, v_user, v_row.stamp_amount);

  v_new_balance := public.adjust_stamps(
    v_user,
    v_row.stamp_amount,
    'other',
    v_row.id,
    'Redeemed code ' || upper(trim(p_code))
  );

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_stamp_code(text) TO authenticated;

-- Admin: create redeem code
CREATE OR REPLACE FUNCTION public.admin_create_redeem_code(
  p_code text,
  p_stamp_amount integer,
  p_max_uses integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
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

  IF p_stamp_amount IS NULL OR p_stamp_amount <= 0 THEN
    RAISE EXCEPTION 'Stamp amount must be positive';
  END IF;

  INSERT INTO public.redeem_codes (code, stamp_amount, max_uses, expires_at, created_by)
  VALUES (upper(trim(p_code)), p_stamp_amount, p_max_uses, p_expires_at, v_me)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_redeem_code(text, integer, integer, timestamptz) TO authenticated;

-- Admin helpers
CREATE OR REPLACE FUNCTION public.admin_set_stamps(p_user_id uuid, p_amount integer, p_description text DEFAULT 'Admin adjustment')
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

  UPDATE public.profiles
  SET stamp_balance = GREATEST(0, p_amount)
  WHERE id = p_user_id
  RETURNING stamp_balance INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.stamp_transactions (user_id, amount, transaction_type, description)
  VALUES (p_user_id, p_amount, 'admin_adjustment', p_description);

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_stamps(p_user_id uuid, p_delta integer, p_description text DEFAULT 'Admin adjustment')
RETURNS integer
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

  RETURN public.adjust_stamps(p_user_id, p_delta, 'admin_adjustment', NULL, p_description);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_banned(p_user_id uuid, p_banned boolean)
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

  UPDATE public.profiles SET is_banned = p_banned WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_force_deliver(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_msg public.messages%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.deliveries
  SET status = 'DELIVERED',
      progress_percent = 100,
      actual_arrival = NOW()
  WHERE id = p_delivery_id
  RETURNING message_id INTO v_msg.id;

  SELECT * INTO v_msg FROM public.messages WHERE id = (
    SELECT message_id FROM public.deliveries WHERE id = p_delivery_id
  );

  IF FOUND THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      v_msg.receiver_id,
      'message_delivered',
      'Pigeon arrived!',
      'A message has been delivered to you.',
      jsonb_build_object('message_id', v_msg.id)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_delivery(p_delivery_id uuid, p_refund boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_msg public.messages%ROWTYPE;
  v_status text;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_me AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT status INTO v_status FROM public.deliveries WHERE id = p_delivery_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  UPDATE public.deliveries
  SET status = 'FAILED',
      failure_reason = 'Cancelled by admin',
      actual_arrival = NOW(),
      progress_percent = 100
  WHERE id = p_delivery_id;

  IF p_refund THEN
    SELECT * INTO v_msg FROM public.messages WHERE id = (
      SELECT message_id FROM public.deliveries WHERE id = p_delivery_id
    );
    IF FOUND THEN
      PERFORM public.adjust_stamps(
        v_msg.sender_id,
        v_msg.stamp_cost,
        'failed_delivery_refund',
        p_delivery_id,
        'Admin cancelled delivery refund'
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_setting(p_key text, p_value jsonb)
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

  INSERT INTO public.system_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, NOW(), v_me)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW(),
        updated_by = v_me;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_deliver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_delivery(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_banned(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_stamps(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stamps(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_redeem_code(text, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_stamp_code(text) TO authenticated;

-- Admin can select all profiles/deliveries via RLS widen for admins
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT
  USING (
    true
  );

-- profiles already had public select true

DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS "Admins view all deliveries" ON public.deliveries;
CREATE POLICY "Admins view all deliveries"
  ON public.deliveries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins view all messages" ON public.messages;
CREATE POLICY "Admins view all messages"
  ON public.messages FOR SELECT
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins view all stamp tx" ON public.stamp_transactions;
CREATE POLICY "Admins view all stamp tx"
  ON public.stamp_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
