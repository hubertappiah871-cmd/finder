import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, ClipboardList, MessageSquare, Phone } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import ClaimDecisionButtons from '../components/ClaimDecisionButtons'
import ClaimMessagingModal from '../components/ClaimMessagingModal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ClaimStatus, ClaimWithRelations } from '../lib/types'
import { cn, initials, timeAgo } from '../lib/utils'

const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'

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

  const [compareItemId, setCompareItemId] = useState<string | null>(null)
  const [messagingClaim, setMessagingClaim] = useState<ClaimWithRelations | null>(null)
  const location = useLocation()

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
  }, [load, location.pathname])

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
  }

  return (
    <div className="container page">
      <PageHeader
        title="Manage claims"
        subtitle="Compare each claim against the original listing, then approve or reject it."
      />

      {multiClaimItems.length > 0 && (
        <div className="alert alert--info">
          <strong>{multiClaimItems.length} item(s) have multiple claimants</strong>
          <span style={{ marginLeft: '0.5rem' }}>— compare claims to decide.</span>
          {multiClaimItems.map(([itemId, cs]) => (
            <button
              key={itemId}
              type="button"
              className="btn btn--small btn--secondary"
              style={{ marginLeft: '0.5rem', marginTop: '0.5rem' }}
              onClick={() => setCompareItemId(compareItemId === itemId ? null : itemId)}
            >
              {cs[0].item?.title ?? 'Item'} ({cs.length} claims)
            </button>
          ))}
        </div>
      )}

      {compareItemId && compareClaims.length > 0 && (
        <section className="card report-section">
          <div className="section__head">
            <h2>Compare Claims — {compareItem?.title}</h2>
            <button type="button" className="btn btn--small btn--secondary" onClick={() => setCompareItemId(null)}>
              Close
            </button>
          </div>
          <div className="compare-grid">
            {compareClaims.map((claim) => (
              <div key={claim.id} className="card card--soft compare-card">
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
                <div className="claim-row__actions compare-card__actions">
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

                {(claim.status === 'pending' || claim.status === 'meeting_required') && (
                  <div className="claim-row__actions">
                    <ClaimDecisionButtons claim={claim} onDone={() => void load()} />
                    <button
                      type="button"
                      className="btn btn--small btn--secondary"
                      onClick={() => openMessaging(claim)}
                    >
                      <MessageSquare size={14} aria-hidden="true" />
                      Message
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--secondary"
                      onClick={() => void shareContact(claim)}
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

      {messagingClaim && (
        <ClaimMessagingModal
          claim={messagingClaim}
          defaultRecipientId={messagingClaim.claimant_uid}
          onClose={() => setMessagingClaim(null)}
        />
      )}
    </div>
  )
}
