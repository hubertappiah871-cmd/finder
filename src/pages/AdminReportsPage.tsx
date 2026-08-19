import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  BadgeCheck,
  ClipboardCheck,
  Clock,
  Download,
  Package,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { ErrorState, LoadingScreen } from '../components/Feedback'
import StatCard from '../components/StatCard'
import { ClaimStatusBadge, ItemStatusBadge, TypeBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
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
  meeting_required: number
  users: number
}

const STATUS_ORDER: ItemStatus[] = ['open', 'claimed', 'resolved']

export default function AdminReportsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [recentItems, setRecentItems] = useState<ItemWithReporter[]>([])
  const [recentClaims, setRecentClaims] = useState<ClaimWithRelations[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [dateError, setDateError] = useState('')

  const [exporting, setExporting] = useState(false)
  const manualRefreshUsed = useRef(false)
  const location = useLocation()

  const load = useCallback(async () => {
    setLoading(true)
    const [total, lost, found, open, claimed, resolved, claims, pending, approved, rejected, meetingReq, users, itemsRes, recentItemsRes, recentClaimsRes] =
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
        supabase.from('claims').select('*', { count: 'exact', head: true }).eq('status', 'meeting_required'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('items').select('type, status, category'),
        supabase.from('items').select(ITEMS_SELECT).order('created_at', { ascending: false }).limit(5),
        supabase.from('claims').select(CLAIMS_SELECT).order('created_at', { ascending: false }).limit(5),
      ])

    const responses = [total, lost, found, open, claimed, resolved, claims, pending, approved, rejected, meetingReq, users, itemsRes, recentItemsRes, recentClaimsRes]
    if (responses.some((r) => r.error)) {
      setError('Could not load the reports.')
      setLoading(false)
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
      meeting_required: meetingReq.count ?? 0,
      users: users.count ?? 0,
    })
    setItems((itemsRes.data as Item[] | null) ?? [])
    setRecentItems((recentItemsRes.data as ItemWithReporter[] | null) ?? [])
    setRecentClaims((recentClaimsRes.data as ClaimWithRelations[] | null) ?? [])
    setLoading(false)
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

  function handleManualRefresh() {
    if (manualRefreshUsed.current) return
    manualRefreshUsed.current = true
    void load()
    toast('info', 'Dashboard refreshed. Manual refresh limited to once per session.')
  }

  function validateDateRange(): boolean {
    setDateError('')
    if (dateStart && dateEnd) {
      if (new Date(dateStart) > new Date(dateEnd)) {
        setDateError('Start date must be before or equal to end date.')
        return false
      }
    }
    return true
  }

  const filteredItems = dateStart || dateEnd
    ? items.filter((item) => {
        const itemDate = new Date(item.date)
        if (dateStart && itemDate < new Date(dateStart)) return false
        if (dateEnd && itemDate > new Date(dateEnd)) return false
        return true
      })
    : items

  function handleExport() {
    if (profile?.role !== 'admin') {
      toast('error', 'Only administrators can export data.')
      return
    }
    if (!validateDateRange()) return

    setExporting(true)
    try {
      const rows = filteredItems.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        category: item.category,
        location: item.location,
        date: item.date,
        status: item.status,
      }))

      const headers = Object.keys(rows[0] ?? {})
      const csv = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(',')),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `items-report-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast('success', `Exported ${rows.length} items.`)
    } catch {
      toast('error', 'Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: filteredItems.filter((i) => i.status === status).length,
  }))

  const categoryCounts = CATEGORIES.map((cat) => ({
    category: cat,
    count: filteredItems.filter((i) => i.category === cat).length,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)

  const maxStatus = Math.max(1, ...statusCounts.map((s) => s.count))
  const maxCategory = Math.max(1, ...categoryCounts.map((c) => c.count))
  const approvalRate = counts && counts.claims > 0 ? Math.round((counts.approved / counts.claims) * 100) : 0

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="container page">
      <PageHeader
        title="Reports &amp; analytics"
        subtitle="A live snapshot of platform activity."
        actions={
          <div className="row row--sm row--wrap">
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={handleManualRefresh}
              disabled={manualRefreshUsed.current}
              title="Refresh data (once per session)"
            >
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={handleExport}
                disabled={exporting}
              >
                <Download size={15} aria-hidden="true" />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
          </div>
        }
      />

      <div className="card date-filter">
        <div className="date-filter__grid">
          <div className="field">
            <label className="field__label" htmlFor="date-start">Start Date</label>
            <input
              id="date-start"
              className="input"
              type="date"
              value={dateStart}
              onChange={(e) => {
                setDateStart(e.target.value)
                setDateError('')
              }}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="date-end">End Date</label>
            <input
              id="date-end"
              className="input"
              type="date"
              value={dateEnd}
              onChange={(e) => {
                setDateEnd(e.target.value)
                setDateError('')
              }}
            />
          </div>
          {(dateStart || dateEnd) && (
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => { setDateStart(''); setDateEnd(''); setDateError('') }}
            >
              Clear
            </button>
          )}
        </div>
        {dateError && <p className="field__error date-filter__error">{dateError}</p>}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : loading && !counts ? (
        <LoadingScreen label="Crunching the numbers…" />
      ) : (
        <>
          <section className="stats-grid">
            <StatCard icon={Package} label="Total items" value={counts?.total ?? 0} tone="navy" />
            <StatCard icon={Package} label="Lost items" value={counts?.lost ?? 0} tone="gold" />
            <StatCard icon={PackageSearch} label="Found items" value={counts?.found ?? 0} tone="gold" />
            <StatCard icon={ShieldCheck} label="Resolved" value={counts?.resolved ?? 0} tone="green" />
            <StatCard icon={ClipboardCheck} label="Pending claims" value={counts?.pending ?? 0} tone="red" />
            <StatCard icon={Users} label="Active users" value={counts?.users ?? 0} tone="blue" />
          </section>

          <section className="card report-section">
            <h2 className="report-section__title">Claim decisions</h2>
            <div className="stats-grid stats-grid--compact">
              <StatCard icon={ClipboardCheck} label="Total claims" value={counts?.claims ?? 0} tone="navy" />
              <StatCard icon={BadgeCheck} label="Approved" value={counts?.approved ?? 0} tone="green" />
              <StatCard icon={Clock} label="Pending" value={counts?.pending ?? 0} tone="gold" />
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
