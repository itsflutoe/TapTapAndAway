-- =====================================================
-- 004: Conversation RPC + grants (DEADLOCK-SAFE VERSION)
-- Run this when the app is idle (close the Send page / wait a few seconds).
-- If a statement fails with deadlock, wait 2 seconds and re-run the WHOLE script.
-- It is idempotent.
-- =====================================================

-- 1) Grants only (lightweight locks)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.stamp_transactions TO authenticated;
GRANT SELECT, INSERT ON public.daily_rewards TO authenticated;
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT SELECT ON public.pigeons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.friendships TO authenticated;

-- 2) Helper function (CREATE OR REPLACE — no DROP needed)
CREATE OR REPLACE FUNCTION public.is_conversation_member(cid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = cid AND user_id = auth.uid()
  );
$$;

-- 3) Main RPC — does conversation + members in one security-definer call
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conv_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  SELECT cm1.conversation_id INTO v_conv_id
  FROM public.conversation_members cm1
  INNER JOIN public.conversation_members cm2
    ON cm1.conversation_id = cm2.conversation_id
  WHERE cm1.user_id = v_me
    AND cm2.user_id = p_other_user_id
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES
    (v_conv_id, v_me),
    (v_conv_id, p_other_user_id);

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stamps(uuid, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(uuid) TO authenticated;

-- 4) Policies last (heavier locks). Use DROP IF EXISTS + CREATE.
--    Close the app tab for a few seconds before this section if deadlocks persist.

DROP POLICY IF EXISTS "Authenticated insert conversations" ON public.conversations;
CREATE POLICY "Authenticated insert conversations"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Insert conversation members" ON public.conversation_members;
CREATE POLICY "Insert conversation members"
  ON public.conversation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = auth.uid() AND f.receiver_id = user_id)
            OR (f.receiver_id = auth.uid() AND f.requester_id = user_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "Insert deliveries for own messages" ON public.deliveries;
CREATE POLICY "Insert deliveries for own messages"
  ON public.deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update related deliveries" ON public.deliveries;
CREATE POLICY "Update related deliveries"
  ON public.deliveries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Insert notifications for self or recipients of own messages" ON public.notifications;
CREATE POLICY "Insert notifications for self or recipients of own messages"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.sender_id = auth.uid() AND m.receiver_id = notifications.user_id
    )
  );
