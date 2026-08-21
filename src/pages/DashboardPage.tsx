import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bell,
  ClipboardCheck,
  Clock,
  HandHeart,
  Package,
  PackageSearch,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, ItemWithReporter } from '../lib/types'
import { ErrorState, LoadingScreen } from '../components/Feedback'
import ItemCard from '../components/ItemCard'
import StatCard from '../components/StatCard'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import { initials, timeAgo } from '../lib/utils'

const ITEMS_SELECT = '*, reporter:profiles!items_reported_by_fkey(name, email)'
const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'

interface UserStats {
  lost: number
  found: number
  claims: number
  unread: number
}

function UserDashboard() {
  const { profile } = useAuth()
  const location = useLocation()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [recent, setRecent] = useState<ItemWithReporter[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const uid = profile.id
    const [lost, found, claims, unread, items] = await Promise.all([
      supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', 'lost').eq('reported_by', uid),
      supabase.from('items').select('*', { count: 'exact', head: true }).eq('type', 'found').eq('reported_by', uid),
      supabase.from('claims').select('*', { count: 'exact', head: true }).eq('claimant_uid', uid),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('read', false),
      supabase.from('items').select(ITEMS_SELECT).order('created_at', { ascending: false }).limit(6),
    ])
    if (lost.error || found.error || claims.error || unread.error || items.error) {
      setError('Could not load your dashboard data. Please try again.')
      return
    }
    setStats({
      lost: lost.count ?? 0,
      found: found.count ?? 0,
      claims: claims.count ?? 0,
      unread: unread.count ?? 0,
    })
    setRecent((items.data as ItemWithReporter[] | null) ?? [])
  }, [profile])

  // Re-fetch every time the user navigates to the dashboard
  useEffect(() => {
    void load()
  }, [load, location.pathname])

  // Also refresh on window focus (e.g. switching back from another tab)
  useEffect(() => {
    function onFocus() {
      void load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (!profile) return null
  const firstName = profile.name.split(' ')[0]

  return (
    <div className="container page">
      <section className="hero-card">
        <div className="hero-card__copy">
          <p className="hero-card__eyebrow">Campus Lost &amp; Found</p>
          <h1>Welcome back, {firstName}.</h1>
          <p>
            Lost something? Found something? This is the place to reunite them. Start in under a
            minute.
          </p>
          <div className="row">
            <Link className="btn btn--gold" to="/report-lost">
              <Package size={16} aria-hidden="true" />
              Report a lost item
            </Link>
            <Link className="btn btn--outline-light" to="/register-found">
              <PackageSearch size={16} aria-hidden="true" />
              Register a found item
            </Link>
            <Link className="btn btn--ghost-light" to="/search">
              <Search size={16} aria-hidden="true" />
              Browse items
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !stats ? (
        <LoadingScreen label="Loading your dashboard…" />
      ) : (
        <>
          <section className="stats-grid">
            <StatCard icon={Package} label="Lost items reported" value={stats.lost} tone="navy" />
            <StatCard icon={PackageSearch} label="Found items registered" value={stats.found} tone="gold" />
            <StatCard icon={ClipboardCheck} label="Claims submitted" value={stats.claims} tone="blue" />
            <StatCard icon={Bell} label="Unread notifications" value={stats.unread} tone="green" />
          </section>

          <section className="section">
            <div className="section__head">
              <h2>Recently added</h2>
              <Link className="link" to="/search">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="card card--soft">
                <p className="muted">
                  No items yet — be the first to report a lost item or register something you found.
                </p>
              </div>
            ) : (
              <div className="item-grid">
                {recent.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

interface AdminStats {
  total: number
  open: number
  resolved: number
  pendingClaims: number
  users: number
}

function AdminDashboard() {
  const { profile } = useAuth()
  const location = useLocation()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [pendingClaims, setPendingClaims] = useState<ClaimWithRelations[]>([])
  const [recent, setRecent] = useState<ItemWithReporter[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [total, open, resolved, pendingClaims, users, claimsRes, itemsRes] = await Promise.all([
      supabase.from('items').select('*', { count: 'exact', head: true }),
      supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('claims').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('claims').select(CLAIMS_SELECT).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('items').select(ITEMS_SELECT).order('created_at', { ascending: false }).limit(6),
    ])
    if (total.error || open.error || resolved.error || pendingClaims.error || users.error || claimsRes.error || itemsRes.error) {
      setError('Could not load the operations overview. Please try again.')
      return
    }
    setStats({
      total: total.count ?? 0,
      open: open.count ?? 0,
      resolved: resolved.count ?? 0,
      pendingClaims: pendingClaims.count ?? 0,
      users: users.count ?? 0,
    })
    setPendingClaims((claimsRes.data as ClaimWithRelations[] | null) ?? [])
    setRecent((itemsRes.data as ItemWithReporter[] | null) ?? [])
  }, [])

  // Re-fetch every time the user navigates to the dashboard
  useEffect(() => {
    void load()
  }, [load, location.pathname])

  // Also refresh on window focus
  useEffect(() => {
    function onFocus() {
      void load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (!profile) return null

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="page-header__title">Operations overview</h1>
        </div>
        <div className="row">
          <Link className="btn btn--primary" to="/admin/claims">
            <ClipboardCheck size={16} aria-hidden="true" />
            Review claims
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !stats ? (
        <LoadingScreen label="Loading the overview…" />
      ) : (
        <>
          <section className="stats-grid">
            <StatCard icon={Package} label="Total items" value={stats.total} tone="navy" />
            <StatCard icon={Clock} label="Open items" value={stats.open} tone="gold" />
            <StatCard icon={ShieldCheck} label="Resolved" value={stats.resolved} tone="green" />
            <StatCard icon={ClipboardCheck} label="Pending claims" value={stats.pendingClaims} tone="red" />
            <StatCard icon={Users} label="Active users" value={stats.users} tone="blue" />
          </section>

          <section className="section">
            <div className="section__head">
              <h2>Claims awaiting your decision</h2>
              <Link className="link" to="/admin/claims">
                Manage all claims
              </Link>
            </div>
            {pendingClaims.length === 0 ? (
              <div className="card card--soft">
                <p className="muted">No pending claims — you are all caught up.</p>
              </div>
            ) : (
              <div className="claim-preview-list">
                {pendingClaims.map((claim) => (
                  <Link key={claim.id} to="/admin/claims" className="claim-preview">
                    <span className="claim-preview__avatar">{initials(claim.claimant?.name ?? '?')}</span>
                    <span className="claim-preview__body">
                      <span className="claim-preview__line">
                        {claim.claimant?.name ?? 'A user'} claimed "{claim.item?.title ?? 'item'}"
                      </span>
                      <span className="claim-preview__meta">{timeAgo(claim.created_at)} · {claim.item?.type === 'lost' ? 'Lost' : 'Found'} item</span>
                    </span>
                    <ClaimStatusBadge status={claim.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section__head">
              <h2>Recent items</h2>
              <Link className="link" to="/admin/items">
                Manage items
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="card card--soft">
                <p className="muted">No items have been reported yet.</p>
              </div>
            ) : (
              <div className="admin-mini-list">
                {recent.map((item) => (
                  <Link key={item.id} to={`/items/${item.id}`} className="admin-mini">
                    <span className="admin-mini__thumb">
                      {item.photo_url ? <img src={item.photo_url} alt="" /> : <HandHeart size={16} />}
                    </span>
                    <span className="admin-mini__body">
                      <span className="admin-mini__title">{item.title}</span>
                      <span className="admin-mini__meta">
                        {item.reporter?.name ?? 'Unknown'} · {timeAgo(item.created_at)}
                      </span>
                    </span>
                    <TypeBadge type={item.type} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  if (!profile) return null
  return profile.role === 'admin' ? <AdminDashboard /> : <UserDashboard />
}
