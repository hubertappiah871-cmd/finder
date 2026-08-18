import { useState } from 'react'
import { BadgeCheck, CircleX, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import type { ClaimWithRelations } from '../lib/types'
import ConfirmDialog from './ConfirmDialog'

interface ClaimDecisionButtonsProps {
  claim: ClaimWithRelations
  onDone: () => void
}

export default function ClaimDecisionButtons({ claim, onDone }: ClaimDecisionButtonsProps) {
  const { toast } = useToast()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [meetingDetails, setMeetingDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function approve() {
    setBusy(true)
    const itemName = claim.item?.title ?? 'this item'
    const { error } = await supabase.rpc('approve_claim', { target_claim_id: claim.id })

    setBusy(false)
    if (error) {
      toast('error', error.message || 'Could not approve the claim. Please try again.')
      return
    }
    toast('success', `Claim approved — "${itemName}" is now marked as claimed.`)
    onDone()
  }

  async function reject() {
    setBusy(true)
    const { error } = await supabase
      .from('claims')
      .update({ status: 'rejected', rejection_reason: reason.trim() || null })
      .eq('id', claim.id)
    setBusy(false)
    if (error) {
      toast('error', 'Could not reject the claim. Please try again.')
      return
    }
    toast('info', 'Claim rejected. The claimant has been notified.')
    setRejectOpen(false)
    setReason('')
    onDone()
  }

  async function requireMeeting() {
    setBusy(true)
    const { error } = await supabase
      .from('claims')
      .update({
        status: 'meeting_required',
        meeting_details: meetingDetails.trim() || null,
      })
      .eq('id', claim.id)
    setBusy(false)
    if (error) {
      toast('error', 'Could not update the claim. Please try again.')
      return
    }
    toast('info', 'Meeting required — the claimant has been notified.')
    setMeetingOpen(false)
    setMeetingDetails('')
    onDone()
  }

  return (
    <>
      <div className="row row--sm">
        <button type="button" className="btn btn--small btn--success" onClick={() => void approve()} disabled={busy}>
          <BadgeCheck size={14} aria-hidden="true" />
          Approve
        </button>
        <button
          type="button"
          className="btn btn--small btn--secondary"
          onClick={() => setMeetingOpen(true)}
          disabled={busy}
        >
          <MapPin size={14} aria-hidden="true" />
          Require Meeting
        </button>
        <button
          type="button"
          className="btn btn--small btn--danger-ghost"
          onClick={() => setRejectOpen(true)}
          disabled={busy}
        >
          <CircleX size={14} aria-hidden="true" />
          Reject
        </button>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        title="Reject claim"
        message={`Reject the claim from ${claim.claimant?.name ?? 'this user'} for "${claim.item?.title ?? 'this item'}"? The claimant will receive your reason in a notification.`}
        confirmLabel="Reject claim"
        inputLabel="Reason (shown to the claimant)"
        inputValue={reason}
        inputPlaceholder="e.g. The description you gave does not match the item."
        onInputChange={setReason}
        busy={busy}
        onConfirm={() => void reject()}
        onCancel={() => {
          setRejectOpen(false)
          setReason('')
        }}
      />

      <ConfirmDialog
        open={meetingOpen}
        title="Require in-person meeting"
        message={`Ask ${claim.claimant?.name ?? 'this user'} to meet you in person to verify ownership of "${claim.item?.title ?? 'this item'}". Provide a location and time.`}
        confirmLabel="Send meeting request"
        inputLabel="Meeting details (location, date/time)"
        inputValue={meetingDetails}
        inputPlaceholder="e.g. Please meet at the Admin Office on Monday 10am with proof of ownership."
        onInputChange={setMeetingDetails}
        busy={busy}
        tone="primary"
        onConfirm={() => void requireMeeting()}
        onCancel={() => {
          setMeetingOpen(false)
          setMeetingDetails('')
        }}
      />
    </>
  )
}
