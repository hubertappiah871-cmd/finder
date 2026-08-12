import { useState } from 'react'
import { BadgeCheck, CircleX } from 'lucide-react'
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
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function approve() {
    setBusy(true)
    const itemName = claim.item?.title ?? 'this item'
    // Atomic database call: marks the claim approved and the item claimed
    // in a single transaction (see approve_claim in supabase/schema.sql).
    const { error } = await supabase.rpc('approve_claim', { target_claim_id: claim.id })

    setBusy(false)
    if (error) {
      toast('error', error.message || 'Could not approve the claim. Please try again.')
      return
    }
    toast('success', `Claim approved — “${itemName}” is now marked as claimed.`)
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

  return (
    <>
      <div className="row row--sm">
        <button type="button" className="btn btn--small btn--success" onClick={() => void approve()} disabled={busy}>
          <BadgeCheck size={14} aria-hidden="true" />
          Approve
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
        message={`Reject the claim from ${claim.claimant?.name ?? 'this user'} for “${claim.item?.title ?? 'this item'}”? The claimant will receive your reason in a notification.`}
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
    </>
  )
}
