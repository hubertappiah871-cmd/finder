import { useEffect, useState } from 'react'
import {
  BadgeCheck,
  ClipboardCheck,
  Clock,
  Package,
  PackageSearch,
  ShieldCheck,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { ErrorState, LoadingScreen } from '../components/Feedback'
import StatCard from '../components/StatCard'
import { ClaimStatusBadge, ItemStatusBadge, TypeBadge } from '../components/StatusBadge'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import type { ClaimWithRelations, Item, ItemStatus, ItemWithReporter } from '../lib/types'
import { timeAgo } from '../lib/utils'

const ITEMS_SELECT = '*, reporter:profiles!items_reported_by_fkey(name, email)'
const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'

interface Counts {
  total: number
  lost: number
  found: number
  open: number
  claimed: number
  resolved: number
  claims: number
  pending: number
  approved: number
  rejected: number
  users: number
}

const STATUS_ORDER: ItemStatus[] = ['open', 'claimed', 'resolved']

export default function AdminReportsPage() {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [recentItems, setRecentItems] = useState<ItemWithReporter[]>([])
  const [recentClaims, setRecentClaims] = useState<ClaimWithRelations[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const [total, lost, found, open, claimed, resolved, claims, pending, approved, rejected, users, itemsRes, recentItemsRes, recentClaimsRes] =
        await Promise.all([
          supabase.from('items').select('*', { count: 'exact', head: true }),
          supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', 'lost'),
          supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', 'found'),
          supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'claimed'),
          supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
          supabase.from('claims').select('*', { count: 'exact', head: true }),
          supabase.from('claims').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('claims').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('claims').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('active', true),
          supabase.from('items').select('type, status, category'),
          supabase.from('items').select(ITEMS_SELECT).order('created_at', { ascending: false }).limit(5),
          supabase.from('claims').select(CLAIMS_SELECT).order('created_at', { ascending: false }).limit(5),
        ])
      if (!active) return
      const responses = [total, lost, found, open, claimed, resolved, claims, pending, approved, rejected, users, itemsRes, recentItemsRes, recentClaimsRes]
      if (responses.some((r) => r.error)) {
        setError('Could not load the reports.')
        return
      }
      setCounts({
        total: total.count ?? 0,
        lost: lost.count ?? 0,
        found: found.count ?? 0,
        open: open.count ?? 0,
        claimed: claimed.count ?? 0,
        resolved: resolved.count ?? 0,
        claims: claims.count ?? 0,
        pending: pending.count ?? 0,
        approved: approved.count ?? 0,
        rejected: rejected.count ?? 0,
        users: users.count ?? 0,
      })
      setItems((itemsRes.data as Item[] | null) ?? [])
      setRecentItems((recentItemsRes.data as ItemWithReporter[] | null) ?? [])
      setRecentClaims((recentClaimsRes.data as ClaimWithRelations[] | null) ?? [])
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: items.filter((i) => i.status === status).length,
  }))

  const categoryCounts = CATEGORIES.map((cat) => ({
    category: cat,
    count: items.filter((i) => i.category === cat).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)

  const maxStatus = Math.max(1, ...statusCounts.map((s) => s.count))
  const maxCategory = Math.max(1, ...categoryCounts.map((c) => c.count))
  const approvalRate = counts && counts.claims > 0 ? Math.round((counts.approved / counts.claims) * 100) : 0

  return (
    <div className="container page">
      <PageHeader
        title="Reports &amp; analytics"
        subtitle="A live snapshot of platform activity — updated every time the page loads."
      />

      {error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : !counts ? (
        <LoadingScreen label="Crunching the numbers…" />
      ) : (
        <>
          <section className="stats-grid">
            <StatCard icon={Package} label="Total items" value={counts.total} tone="navy" />
            <StatCard icon={Package} label="Lost items" value={counts.lost} tone="gold" />
            <StatCard icon={PackageSearch} label="Found items" value={counts.found} tone="gold" />
            <StatCard icon={ShieldCheck} label="Resolved" value={counts.resolved} tone="green" />
            <StatCard icon={ClipboardCheck} label="Pending claims" value={counts.pending} tone="red" />
            <StatCard icon={Users} label="Active users" value={counts.users} tone="blue" />
          </section>

          <section className="card report-section">
            <h2 className="report-section__title">Claim decisions</h2>
            <div className="stats-grid stats-grid--compact">
              <StatCard icon={ClipboardCheck} label="Total claims" value={counts.claims} tone="navy" />
              <StatCard icon={BadgeCheck} label="Approved" value={counts.approved} tone="green" />
              <StatCard icon={Clock} label="Pending" value={counts.pending} tone="gold" />
              <StatCard icon={ClipboardCheck} label="Approval rate" value={`${approvalRate}%`} tone="blue" />
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h2>Items by status</h2>
            </div>
            <div className="bar-list">
              {statusCounts.map(({ status, count }) => (
                <div key={status} className="bar-row">
                  <span className="bar-row__label">
                    <ItemStatusBadge status={status} />
                  </span>
                  <span className="bar-row__track">
                    <span className="bar-row__fill bar-row__fill--status" style={{ width: `${(count / maxStatus) * 100}%` }} />
                  </span>
                  <span className="bar-row__value">{count}</span>
                </div>
              ))}
            </div>
          </section>

          {categoryCounts.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h2>Items by category</h2>
              </div>
              <div className="bar-list">
                {categoryCounts.map(({ category, count }) => (
                  <div key={category} className="bar-row">
                    <span className="bar-row__label">{category}</span>
                    <span className="bar-row__track">
                      <span className="bar-row__fill" style={{ width: `${(count / maxCategory) * 100}%` }} />
                    </span>
                    <span className="bar-row__value">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section__head">
              <h2>Recent activity</h2>
            </div>
            <div className="report-grid">
              <div className="card report-col">
                <h3 className="report-col__title">Latest items</h3>
                {recentItems.length === 0 ? (
                  <p className="muted">No items yet.</p>
                ) : (
                  <ul className="report-list">
                    {recentItems.map((item) => (
                      <li key={item.id} className="report-list__row">
                        <span className="report-list__main">
                          <strong>{item.title}</strong>
                          <span className="muted">
                            {item.reporter?.name ?? 'Former member'} · {timeAgo(item.created_at)}
                          </span>
                        </span>
                        <span className="row row--sm">
                          <TypeBadge type={item.type} />
                          <ItemStatusBadge status={item.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card report-col">
                <h3 className="report-col__title">Latest claims</h3>
                {recentClaims.length === 0 ? (
                  <p className="muted">No claims yet.</p>
                ) : (
                  <ul className="report-list">
                    {recentClaims.map((claim) => (
                      <li key={claim.id} className="report-list__row">
                        <span className="report-list__main">
                          <strong>{claim.item?.title ?? 'Item removed'}</strong>
                          <span className="muted">
                            {claim.claimant?.name ?? 'Former member'} · {timeAgo(claim.created_at)}
                          </span>
                        </span>
                        <ClaimStatusBadge status={claim.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
