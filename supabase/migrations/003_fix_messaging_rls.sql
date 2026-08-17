-- =====================================================
-- Fix messaging: missing INSERT/UPDATE RLS + recursive policy
-- Causes HTTP 500 / "Failed to create conversation"
-- Run in Supabase SQL Editor on existing projects
-- =====================================================

-- Helper: check membership without recursive RLS on conversation_members
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

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated, anon;

-- ---------- conversations ----------
DROP POLICY IF EXISTS "View own conversations" ON public.conversations;

CREATE POLICY "View own conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id));

CREATE POLICY "Authenticated insert conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (true);

-- ---------- conversation_members ----------
DROP POLICY IF EXISTS "View conversation members" ON public.conversation_members;

-- Own rows
CREATE POLICY "View own conversation memberships"
  ON public.conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Other members of conversations you belong to (uses security definer helper → no recursion)
CREATE POLICY "View peer members in my conversations"
  ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

CREATE POLICY "Insert conversation members"
  ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.receiver_id = user_id)
          OR (f.receiver_id = auth.uid() AND f.requester_id = user_id)
        )
    )
  );

-- ---------- deliveries ----------
CREATE POLICY "Insert deliveries for own messages"
  ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
  );

CREATE POLICY "Update related deliveries"
  ON public.deliveries FOR UPDATE TO authenticated
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

-- ---------- notifications ----------
CREATE POLICY "Insert notifications for self or recipients of own messages"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.sender_id = auth.uid() AND m.receiver_id = notifications.user_id
    )
  );

-- ---------- RPC grants ----------
GRANT EXECUTE ON FUNCTION public.adjust_stamps(uuid, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(uuid) TO authenticated;

-- daily_rewards insert happens inside claim_daily_reward (SECURITY DEFINER)
-- Ensure authenticated can still read own rewards (already in 001)

-- Broaden function execute grants (safe for Phase 1 authenticated app)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
