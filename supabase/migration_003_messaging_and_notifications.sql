-- ============================================================================
--  Campus Lost & Found — Migration 003: Messaging & Notifications Fix
-- ============================================================================
--  Run this in your Supabase SQL Editor to apply:
--   1. Allow anyone authenticated to send and reply to messages (fixes 2-way texting).
--   2. Allow notifications to be sent to item owners when items are found or messaged.
--   3. Trigger automated notifications when messages are sent.
--   4. Bidirectional matching notifications for lost & found items.
-- ============================================================================

-- 1. MESSAGES RLS FIX — Anyone authenticated can send messages as themselves
-- ----------------------------------------------------------------------------

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR public.is_admin());

DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS messages_update ON public.messages;
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- 2. NOTIFICATIONS RLS FIX — Allow sending notifications to other users
-- ----------------------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. TRIGGER: NOTIFY RECIPIENT ON NEW MESSAGE
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
  claim_item_title text;
BEGIN
  SELECT name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  
  SELECT i.title INTO claim_item_title
  FROM public.claims c
  JOIN public.items i ON i.id = c.item_id
  WHERE c.id = NEW.claim_id;

  INSERT INTO public.notifications (user_id, message)
  VALUES (
    NEW.recipient_id,
    COALESCE(sender_name, 'A user') || ' sent you a message'
      || CASE WHEN claim_item_title IS NOT NULL THEN ' regarding “' || claim_item_title || '”' ELSE '' END
      || ': “' || CASE WHEN length(NEW.body) > 60 THEN substr(NEW.body, 1, 57) || '…' ELSE NEW.body END || '”'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_recipient ON public.messages;
CREATE TRIGGER messages_notify_recipient
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- 4. ENHANCED MATCHING NOTIFICATIONS (BIDIRECTIONAL & CASE-INSENSITIVE)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_matching_owners()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'found' THEN
    -- A found item was registered -> notify owners of open lost items in same category
    INSERT INTO public.notifications (user_id, message)
    SELECT i.reported_by,
           'A found item matching your lost “' || i.title || '” was just registered: “'
             || NEW.title || '” (' || NEW.category || ').'
    FROM public.items i
    WHERE i.type = 'lost'
      AND i.status = 'open'
      AND lower(trim(i.category)) = lower(trim(NEW.category))
      AND i.reported_by IS NOT NULL
      AND i.reported_by IS DISTINCT FROM NEW.reported_by;

  ELSIF NEW.type = 'lost' THEN
    -- A lost item was reported -> check if a matching found item is already in system
    INSERT INTO public.notifications (user_id, message)
    SELECT NEW.reported_by,
           'A previously registered found item may match your lost “' || NEW.title || '”: “'
             || i.title || '” (' || i.category || ').'
    FROM public.items i
    WHERE i.type = 'found'
      AND i.status = 'open'
      AND lower(trim(i.category)) = lower(trim(NEW.category))
      AND i.reported_by IS NOT NULL
      AND i.reported_by IS DISTINCT FROM NEW.reported_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_notify_matching ON public.items;
CREATE TRIGGER items_notify_matching
  AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.notify_matching_owners();

-- 5. RPC HELPER: "I FOUND THIS" DIRECT NOTIFICATION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_item_found(
  target_item_id uuid,
  finder_contact text,
  found_location text,
  finder_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_finder_name text;
  v_msg text;
BEGIN
  SELECT id, title, reported_by INTO v_item
  FROM public.items
  WHERE id = target_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  IF v_item.reported_by IS NULL THEN
    RAISE EXCEPTION 'This item has no recorded owner';
  END IF;

  IF v_item.reported_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot notify yourself';
  END IF;

  SELECT name INTO v_finder_name FROM public.profiles WHERE id = auth.uid();

  v_msg := COALESCE(v_finder_name, 'Someone') || ' found your lost “' || v_item.title || '”!'
           || ' Location: ' || found_location
           || ' · Contact: ' || finder_contact;

  IF finder_note IS NOT NULL AND length(trim(finder_note)) > 0 THEN
    v_msg := v_msg || ' · Note: ' || trim(finder_note);
  END IF;

  INSERT INTO public.notifications (user_id, message)
  VALUES (v_item.reported_by, v_msg);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_item_found(uuid, text, text, text) TO authenticated;
