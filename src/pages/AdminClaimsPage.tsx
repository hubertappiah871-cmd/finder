import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, ClipboardList, MessageSquare, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import ClaimDecisionButtons from '../components/ClaimDecisionButtons'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ClaimStatus, ClaimWithRelations, MessageWithSender } from '../lib/types'
import { cn, initials, timeAgo } from '../lib/utils'

const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'
const MESSAGES_SELECT = '*, sender:profiles!messages_sender_id_fkey(name, role)'

type Tab = 'all' | ClaimStatus

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'meeting_required', label: 'Meeting Required' },
]

export default function AdminClaimsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [claims, setClaims] = useState<ClaimWithRelations[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('pending')

  // Compare view state
  const [compareItemId, setCompareItemId] = useState<string | null>(null)

  // Messaging state
  const [messagingClaim, setMessagingClaim] = useState<ClaimWithRelations | null>(null)
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [messageBody, setMessageBody] = useState('')
  const [messageBusy, setMessageBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('claims')
      .select(CLAIMS_SELECT)
      .order('created_at', { ascending: false })
      .limit(300)
    if (err) {
      setError('Could not load claims.')
      return
    }
    setClaims((data as ClaimWithRelations[] | null) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-refresh when the window regains focus
  useEffect(() => {
    function onFocus() {
      void load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const counts = useMemo(() => {
    if (!claims) return { all: 0, pending: 0, approved: 0, rejected: 0, meeting_required: 0 }
    return claims.reduce(
      (acc, c) => {
        acc.all += 1
        acc[c.status] += 1
        return acc
      },
      { all: 0, pending: 0, approved: 0, rejected: 0, meeting_required: 0 },
    )
  }, [claims])

  const visible = useMemo(() => {
    if (!claims) return []
    return tab === 'all' ? claims : claims.filter((c) => c.status === tab)
  }, [claims, tab])

  // Group pending claims by item for compare view
  const multiClaimItems = useMemo(() => {
    if (!claims) return []
    const pending = claims.filter((c) => c.status === 'pending' || c.status === 'meeting_required')
    const byItem = new Map<string, ClaimWithRelations[]>()
    for (const c of pending) {
      if (!c.item) continue
      const list = byItem.get(c.item.id) ?? []
      list.push(c)
      byItem.set(c.item.id, list)
    }
    return Array.from(byItem.entries()).filter(([, cs]) => cs.length >= 2)
  }, [claims])

  const compareClaims = useMemo(() => {
    if (!compareItemId || !claims) return []
    return claims.filter(
      (c) => c.item_id === compareItemId && (c.status === 'pending' || c.status === 'meeting_required'),
    )
  }, [compareItemId, claims])

  const compareItem = useMemo(() => {
    return compareClaims.length > 0 ? compareClaims[0].item ?? null : null
  }, [compareClaims])

  // Load messages for a claim
  async function loadMessages(claimId: string) {
    const { data, error: err } = await supabase
      .from('messages')
      .select(MESSAGES_SELECT)
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true })
      .limit(50)
    if (err) {
      console.error('Failed to load messages:', err.message)
      toast('error', 'Could not load messages. Make sure the migration SQL has been run in Supabase.')
      setMessages([])
      return
    }
    setMessages((data as MessageWithSender[] | null) ?? [])
  }

  async function sendMessage() {
    if (!messagingClaim || !messageBody.trim() || !profile) return
    setMessageBusy(true)
    const { error } = await supabase.from('messages').insert({
      claim_id: messagingClaim.id,
      sender_id: profile.id,
      recipient_id: messagingClaim.claimant_uid,
      body: messageBody.trim(),
    })
    setMessageBusy(false)
    if (error) {
      console.error('Failed to send message:', error.message)
      toast('error', `Could not send message: ${error.message}`)
      return
    }
    setMessageBody('')
    toast('success', 'Message sent.')
    await loadMessages(messagingClaim.id)
  }

  async function shareContact(claim: ClaimWithRelations) {
    if (!profile) return
    const contact = profile.email
    const { error } = await supabase.from('messages').insert({
      claim_id: claim.id,
      sender_id: profile.id,
      recipient_id: claim.claimant_uid,
      body: `Admin contact: You can reach us at ${contact}. Please use this to coordinate the handover.`,
    })
    if (error) {
      console.error('Failed to share contact:', error.message)
      toast('error', `Could not share contact: ${error.message}`)
      return
    }
    toast('success', 'Contact info sent to the claimant.')
  }

  function openMessaging(claim: ClaimWithRelations) {
    setMessagingClaim(claim)
    void loadMessages(claim.id)
  }

  return (
    <div className="container page">
      <PageHeader
        title="Manage claims"
        subtitle="Compare each claim against the original listing, then approve or reject it."
      />

      {/* Multi-claimant compare alerts */}
      {multiClaimItems.length > 0 && (
        <div className="alert alert--info" style={{ marginBottom: '1rem' }}>
          <strong>{multiClaimItems.length} item(s) have multiple claimants</strong>
          <span style={{ marginLeft: '0.5rem' }}>— compare claims to decide.</span>
          {multiClaimItems.map(([itemId, cs]) => (
            <button
              key={itemId}
              type="button"
              className="btn btn--small btn--secondary"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => setCompareItemId(compareItemId === itemId ? null : itemId)}
            >
              {cs[0].item?.title ?? 'Item'} ({cs.length} claims)
            </button>
          ))}
        </div>
      )}

      {/* Compare claims view */}
      {compareItemId && compareClaims.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
          <div className="section__head">
            <h2>Compare Claims — {compareItem?.title}</h2>
            <button type="button" className="btn btn--small btn--secondary" onClick={() => setCompareItemId(null)}>
              Close
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(compareClaims.length, 3)}, 1fr)`, gap: '1rem', marginTop: '1rem' }}>
            {compareClaims.map((claim) => (
              <div key={claim.id} className="card card--soft" style={{ padding: '1rem' }}>
                <div className="claim-row__head">
                  <strong>{claim.claimant?.name ?? 'Unknown'}</strong>
                  <ClaimStatusBadge status={claim.status} />
                </div>
                <p className="claim-row__meta">{claim.claimant?.email} · {timeAgo(claim.created_at)}</p>
                {claim.owner_name && (
                  <p className="muted">Name: {claim.owner_name} · Contact: {claim.contact_info}</p>
                )}
                <blockquote className="claim-verification">"{claim.verification_details}"</blockquote>
                {claim.status === 'meeting_required' && claim.meeting_details && (
                  <p className="muted">Meeting: {claim.meeting_details}</p>
                )}
                <div className="claim-row__actions" style={{ marginTop: '0.75rem' }}>
                  <ClaimDecisionButtons claim={claim} onDone={() => { void load(); setCompareItemId(null); }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={cn('tabs__btn', tab === t.value && 'tabs__btn--active')}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            <span className="tabs__count">{counts[t.value]}</span>
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !claims ? (
        <LoadingScreen label="Loading claims…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab === 'pending' ? 'No pending claims' : 'Nothing here'}
          message={
            tab === 'pending'
              ? 'When a user claims a found item, it will appear here for your review.'
              : 'No claims match this filter.'
          }
        />
      ) : (
        <div className="claim-list">
          {visible.map((claim) => (
            <div key={claim.id} className={cn('claim-row', claim.status === 'pending' && 'claim-row--pending')}>
              <span className="claim-row__avatar">{initials(claim.claimant?.name ?? '?')}</span>
              <div className="claim-row__body">
                <div className="claim-row__head">
                  <strong>{claim.claimant?.name ?? 'Former member'}</strong>
                  <ClaimStatusBadge status={claim.status} />
                </div>
                <p className="claim-row__meta">
                  {claim.claimant?.email} · submitted {timeAgo(claim.created_at)}
                </p>

                {claim.item && (
                  <Link to={`/items/${claim.item.id}`} className="claim-item">
                    <span className="claim-item__thumb">
                      {claim.item.photo_url ? <img src={claim.item.photo_url} alt="" /> : <ClipboardCheck size={15} />}
                    </span>
                    <span>
                      <strong>{claim.item.title}</strong>
                      <span className="claim-item__badges">
                        <TypeBadge type={claim.item.type} />
                        <span className="muted">Original listing · {claim.item.status}</span>
                      </span>
                    </span>
                  </Link>
                )}

                {claim.owner_name && (
                  <p className="muted">Claimed by: {claim.owner_name} · Contact: {claim.contact_info}</p>
                )}

                <blockquote className="claim-verification">"{claim.verification_details}"</blockquote>

                {claim.status === 'rejected' && claim.rejection_reason && (
                  <p className="muted">Rejection reason: {claim.rejection_reason}</p>
                )}

                {claim.status === 'meeting_required' && claim.meeting_details && (
                  <p className="muted">Meeting: {claim.meeting_details}</p>
                )}

                {/* Show actions for pending AND meeting_required claims */}
                {(claim.status === 'pending' || claim.status === 'meeting_required') && (
                  <div className="claim-row__actions">
                    <ClaimDecisionButtons claim={claim} onDone={() => void load()} />
                    <button
                      type="button"
                      className="btn btn--small btn--secondary"
                      onClick={() => openMessaging(claim)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <MessageSquare size={14} aria-hidden="true" />
                      Message Claimant
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--secondary"
                      onClick={() => void shareContact(claim)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <Phone size={14} aria-hidden="true" />
                      Share Contact
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messaging modal */}
      {messagingClaim && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMessagingClaim(null)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '500px' }}>
            <h3 className="modal__title">
              Message {messagingClaim.claimant?.name ?? 'claimant'}
            </h3>
            <p className="modal__message">
              Regarding claim for "{messagingClaim.item?.title ?? 'item'}"
            </p>

            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
              {messages.length === 0 ? (
                <p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {m.sender?.name ?? 'Unknown'}:
                    </p>
                    <p style={{ fontSize: '0.9rem' }}>{m.body}</p>
                    <p className="muted" style={{ fontSize: '0.75rem' }}>{timeAgo(m.created_at)}</p>
                  </div>
                ))
              )}
            </div>

            <div className="field">
              <textarea
                className="input"
                rows={3}
                placeholder="Type your message…"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
              />
            </div>

            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setMessagingClaim(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void sendMessage()}
                disabled={messageBusy || !messageBody.trim()}
              >
                {messageBusy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
