-- ============================================================================
--  Campus Lost & Found — Migration 002: Enhancements
-- ============================================================================
--  Run this AFTER schema.sql in your Supabase SQL Editor.
--  Adds: claim fields, messages table, multi-claimant dispute resolution,
--         duplicate claim prevention, and meeting_required status.
-- ============================================================================

-- 1. Extend claims.status to include 'meeting_required'
-- -----------------------------------------------------------------------------

-- Drop the old check constraint and replace it
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_status_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'meeting_required'));

-- 2. Add new columns to claims
-- -----------------------------------------------------------------------------

ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS contact_info text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS meeting_details text;

-- 3. Unique constraint: one active claim per user per item
-- -----------------------------------------------------------------------------

-- Partial unique index: blocks duplicate active claims
CREATE UNIQUE INDEX IF NOT EXISTS claims_unique_active_claim
  ON public.claims (item_id, claimant_uid)
  WHERE status IN ('pending', 'meeting_required');

-- 4. Messages table (admin ↔ claimant)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS messages_claim_idx ON public.messages (claim_id);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON public.messages (recipient_id);

-- 5. RLS for messages
-- -----------------------------------------------------------------------------

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Insert: only admins can send messages
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_admin());

-- Select: only sender or recipient can read
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Update: only recipient can mark as read
DROP POLICY IF EXISTS messages_update ON public.messages;
CREATE POLICY messages_update ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- 6. Update approve_claim RPC to auto-reject other pending claims
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_claim(target_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can approve claims';
  END IF;

  UPDATE public.claims
  SET status = 'approved'
  WHERE id = target_claim_id AND status IN ('pending', 'meeting_required');

  IF NOT found THEN
    RAISE EXCEPTION 'Claim not found or already decided';
  END IF;

  SELECT item_id INTO v_item_id FROM public.claims WHERE id = target_claim_id;

  UPDATE public.items
  SET status = 'claimed'
  WHERE id = v_item_id AND status = 'open';

  -- Auto-reject other pending claims on the same item
  UPDATE public.claims
  SET status = 'rejected',
      rejection_reason = 'Another claim was approved for this item'
  WHERE item_id = v_item_id
    AND id != target_claim_id
    AND status IN ('pending', 'meeting_required');
END;
$$;

-- 7. Update claim decision notification trigger for meeting_required
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_claim_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_title text;
BEGIN
  IF new.status = old.status OR new.status NOT IN ('approved', 'rejected', 'meeting_required') THEN
    RETURN new;
  END IF;

  SELECT title INTO item_title FROM public.items WHERE id = new.item_id;

  IF new.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, message)
    VALUES (new.claimant_uid,
            'Your claim for "' || coalesce(item_title, 'item') || '" was approved. Contact the finder to arrange pickup.');

    INSERT INTO public.notifications (user_id, message)
    SELECT i.reported_by,
           'The claim for your found "' || i.title || '" was approved — the item is now marked as claimed.'
    FROM public.items i
    WHERE i.id = new.item_id AND i.reported_by IS NOT NULL;

  ELSIF new.status = 'meeting_required' THEN
    INSERT INTO public.notifications (user_id, message)
    VALUES (new.claimant_uid,
            'An admin needs to verify your claim for "' || coalesce(item_title, 'item') || '" in person.'
              || CASE WHEN new.meeting_details IS NOT NULL
                      THEN ' ' || new.meeting_details
                      ELSE ' Please contact the admin office to arrange a meeting.'
                 END);

  ELSE
    INSERT INTO public.notifications (user_id, message)
    VALUES (new.claimant_uid,
            'Your claim for "' || coalesce(item_title, 'item') || '" was rejected'
              || CASE WHEN new.rejection_reason IS NOT NULL
                      THEN ': ' || new.rejection_reason
                      ELSE '.' END);
  END IF;

  RETURN new;
END;
$$;

-- 8. Item ID immutability trigger (optional hardening)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_item_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Item ID cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_immutable_id ON public.items;
CREATE TRIGGER items_immutable_id
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_item_id_change();
