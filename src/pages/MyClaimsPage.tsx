import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, FileText } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations } from '../lib/types'
import { timeAgo } from '../lib/utils'

const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'

export default function MyClaimsPage() {
  const { profile } = useAuth()
  const [claims, setClaims] = useState<ClaimWithRelations[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    const uid = profile.id
    let active = true
    async function load() {
      const { data, error: err } = await supabase
        .from('claims')
        .select(CLAIMS_SELECT)
        .eq('claimant_uid', uid)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!active) return
      if (err) {
        setError('Could not load your claims.')
        return
      }
      setClaims((data as ClaimWithRelations[] | null) ?? [])
    }
    void load()
    return () => {
      active = false
    }
  }, [profile])

  return (
    <div className="container page">
      <PageHeader
        title="My claims"
        subtitle="Track every item you have claimed, from submission to resolution."
      />

      {error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : !claims ? (
        <LoadingScreen label="Loading your claims…" />
      ) : claims.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No claims yet"
          message="When you find a lost item that belongs to you, submit a claim with proof of ownership and it will appear here."
        />
      ) : (
        <div className="claim-card-list">
          {claims.map((claim) => (
            <Link key={claim.id} to={`/items/${claim.item_id}`} className="claim-card-row">
              <span className="claim-card-row__thumb">
                {claim.item?.photo_url ? (
                  <img src={claim.item.photo_url} alt="" />
                ) : (
                  <FileText size={18} aria-hidden="true" />
                )}
              </span>
              <span className="claim-card-row__body">
                <span className="claim-card-row__head">
                  <strong>{claim.item?.title ?? 'Item no longer available'}</strong>
                  <ClaimStatusBadge status={claim.status} />
                </span>
                <span className="claim-card-row__meta">
                  {claim.item ? <TypeBadge type={claim.item.type} /> : null}
                  {claim.item && <span>{claim.item.type === 'lost' ? 'Lost' : 'Found'} item</span>}
                  <span>· Submitted {timeAgo(claim.created_at)}</span>
                </span>
                {claim.status === 'rejected' && claim.rejection_reason && (
                  <span className="claim-card-row__reason">Reason: {claim.rejection_reason}</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
