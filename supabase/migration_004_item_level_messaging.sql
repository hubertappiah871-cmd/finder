-- ============================================================================
--  Campus Lost & Found — Migration 004: Item-Level Messaging (Finder ↔ Admin)
-- ============================================================================
--  Run this in your Supabase SQL Editor to allow direct messaging regarding items
--  (even before any claim has been submitted).
-- ============================================================================

-- 1. Make claim_id nullable and add item_id to messages table
-- ----------------------------------------------------------------------------

ALTER TABLE public.messages ALTER COLUMN claim_id DROP NOT NULL;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.items (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS messages_item_idx ON public.messages (item_id);

-- 2. Update trigger to support messages linked to either claim_id or item_id
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
  v_title text;
BEGIN
  SELECT name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;

  IF NEW.item_id IS NOT NULL THEN
    SELECT title INTO v_title FROM public.items WHERE id = NEW.item_id;
  ELSIF NEW.claim_id IS NOT NULL THEN
    SELECT i.title INTO v_title
    FROM public.claims c
    JOIN public.items i ON i.id = c.item_id
    WHERE c.id = NEW.claim_id;
  END IF;

  INSERT INTO public.notifications (user_id, message)
  VALUES (
    NEW.recipient_id,
    COALESCE(sender_name, 'A user') || ' sent you a message'
      || CASE WHEN v_title IS NOT NULL THEN ' regarding “' || v_title || '”' ELSE '' END
      || ': “' || CASE WHEN length(NEW.body) > 60 THEN substr(NEW.body, 1, 57) || '…' ELSE NEW.body END || '”'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_notify_recipient ON public.messages;
CREATE TRIGGER messages_notify_recipient
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();
