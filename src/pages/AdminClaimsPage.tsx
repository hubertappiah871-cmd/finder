import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import ClaimDecisionButtons from '../components/ClaimDecisionButtons'
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
]

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<ClaimWithRelations[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('pending')

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

  const counts = useMemo(() => {
    if (!claims) return { all: 0, pending: 0, approved: 0, rejected: 0 }
    return claims.reduce(
      (acc, c) => {
        acc.all += 1
        acc[c.status] += 1
        return acc
      },
      { all: 0, pending: 0, approved: 0, rejected: 0 },
    )
  }, [claims])

  const visible = useMemo(() => {
    if (!claims) return []
    return tab === 'all' ? claims : claims.filter((c) => c.status === tab)
  }, [claims, tab])

  return (
    <div className="container page">
      <PageHeader
        title="Manage claims"
        subtitle="Compare each claim against the original listing, then approve or reject it."
      />

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

                <blockquote className="claim-verification">“{claim.verification_details}”</blockquote>

                {claim.status === 'rejected' && claim.rejection_reason && (
                  <p className="muted">Rejection reason: {claim.rejection_reason}</p>
                )}

                {claim.status === 'pending' && (
                  <div className="claim-row__actions">
                    <ClaimDecisionButtons claim={claim} onDone={() => void load()} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
