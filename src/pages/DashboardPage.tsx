import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  HandHeart,
  Package,
  PackagePlus,
  PackageSearch,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, ItemWithReporter } from '../lib/types'
import { CATEGORIES } from '../lib/constants'
import { ErrorState, LoadingScreen } from '../components/Feedback'
import ItemCard from '../components/ItemCard'
import StatCard from '../components/StatCard'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import { cn, initials, timeAgo } from '../lib/utils'

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
  const [items, setItems] = useState<ItemWithReporter[]>([])
  const [error, setError] = useState('')

  // Search and filter state for recent items
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')

  const load = useCallback(async () => {
    if (!profile) return
    const uid = profile.id
    const [lost, found, claims, unread, itemsRes] = await Promise.all([
      supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'lost')
        .eq('reported_by', uid),
      supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'found')
        .eq('reported_by', uid),
      supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('claimant_uid', uid)
        .eq('status', 'pending'),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('read', false),
      supabase
        .from('items')
        .select(ITEMS_SELECT)
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    if (lost.error || found.error || claims.error || unread.error || itemsRes.error) {
      setError('Could not load your dashboard data. Please try again.')
      return
    }

    setStats({
      lost: lost.count ?? 0,
      found: found.count ?? 0,
      claims: claims.count ?? 0,
      unread: unread.count ?? 0,
    })
    setItems((itemsRes.data as ItemWithReporter[] | null) ?? [])
  }, [profile])

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

  // Filter items in memory
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchLoc = item.location.toLowerCase().includes(q)
        const matchCat = item.category.toLowerCase().includes(q)
        const matchDesc = item.description?.toLowerCase().includes(q)
        if (!matchTitle && !matchLoc && !matchCat && !matchDesc) return false
      }
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false
      }
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false
      }
      if (selectedType !== 'all' && item.type !== selectedType) {
        return false
      }
      return true
    })
  }, [items, searchQuery, selectedCategory, selectedStatus, selectedType])

  if (!profile) return null
  const firstName = profile.name.split(' ')[0]

  return (
    <div className="container page">
      {/* ── Compact Modern Hero ─────────────────────────────────────────── */}
      <section className="hero-card hero-card--compact">
        <div className="hero-card__content">
          <div className="hero-card__copy">
            <p className="hero-card__eyebrow">Campus Lost &amp; Found</p>
            <h1 className="hero-card__title">Welcome back, {firstName}.</h1>
            <p className="hero-card__desc">
              Lost something or found something? We're here to help reunite items with their
              owners.
            </p>
            <div className="hero-card__actions">
              <Link className="btn btn--gold btn--hero-primary" to="/report-lost">
                <Package size={17} aria-hidden="true" />
                <span>Report Lost Item</span>
              </Link>
              <Link className="btn btn--outline-light btn--hero-secondary" to="/register-found">
                <PackagePlus size={17} aria-hidden="true" />
                <span>Report Found Item</span>
              </Link>
              <Link className="btn btn--ghost-light btn--hero-tertiary" to="/search">
                <Search size={16} aria-hidden="true" />
                <span>Browse Items</span>
              </Link>
            </div>
          </div>

          <div className="hero-card__visual" aria-hidden="true">
            <div className="hero-illustration">
              <div className="hero-badge hero-badge--backpack">
                <Package size={28} />
              </div>
              <div className="hero-badge hero-badge--keys">
                <ShieldCheck size={20} />
              </div>
              <div className="hero-badge hero-badge--bottle">
                <CheckCircle2 size={18} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !stats ? (
        <LoadingScreen label="Loading your dashboard…" />
      ) : (
        <>
          {/* ── 4 Key Metric Cards ────────────────────────────────────────── */}
          <section className="stats-grid stats-grid--4" aria-label="Dashboard summary">
            <div className="stat-card stat-card--interactive">
              <div className="stat-card__top">
                <span className="stat-card__icon stat-card__icon--navy">
                  <Package size={18} aria-hidden="true" />
                </span>
                <span className="stat-card__value">{stats.lost}</span>
              </div>
              <div className="stat-card__body">
                <strong className="stat-card__heading">Lost Items reported</strong>
                <p className="stat-card__sub">Items you have reported</p>
              </div>
              <Link to="/my-claims" className="stat-card__link">
                <span>View your reports</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            <div className="stat-card stat-card--interactive">
              <div className="stat-card__top">
                <span className="stat-card__icon stat-card__icon--gold">
                  <PackageSearch size={18} aria-hidden="true" />
                </span>
                <span className="stat-card__value">{stats.found}</span>
              </div>
              <div className="stat-card__body">
                <strong className="stat-card__heading">Found Items registered</strong>
                <p className="stat-card__sub">Items you have registered</p>
              </div>
              <Link to="/search?type=found" className="stat-card__link">
                <span>View found items</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            <div
              className={cn(
                'stat-card stat-card--interactive',
                stats.claims > 0 && 'stat-card--highlight',
              )}
            >
              <div className="stat-card__top">
                <span
                  className={cn(
                    'stat-card__icon',
                    stats.claims > 0 ? 'stat-card__icon--amber' : 'stat-card__icon--blue',
                  )}
                >
                  <ClipboardCheck size={18} aria-hidden="true" />
                </span>
                <span className="stat-card__value">{stats.claims}</span>
              </div>
              <div className="stat-card__body">
                <strong className="stat-card__heading">
                  {stats.claims === 1 ? 'Pending Claim' : 'Pending Claims'}
                </strong>
                <p className="stat-card__sub">
                  {stats.claims > 0 ? 'Needs your attention' : 'No pending claims'}
                </p>
              </div>
              <Link to="/my-claims" className="stat-card__link">
                <span>{stats.claims > 0 ? 'Review claim' : 'Manage claims'}</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            <div className="stat-card stat-card--interactive">
              <div className="stat-card__top">
                <span className="stat-card__icon stat-card__icon--green">
                  <Bell size={18} aria-hidden="true" />
                </span>
                <span className="stat-card__value">{stats.unread}</span>
              </div>
              <div className="stat-card__body">
                <strong className="stat-card__heading">Notifications</strong>
                <p className="stat-card__sub">
                  {stats.unread === 0 ? "You're all caught up!" : `${stats.unread} unread alerts`}
                </p>
              </div>
              <Link to="/notifications" className="stat-card__link">
                <span>View all notifications</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </section>

          {/* ── Needs Your Attention Banner (Dynamic) ────────────────────────── */}
          {stats.claims > 0 && (
            <section className="attention-banner" role="status">
              <div className="attention-banner__content">
                <span className="attention-banner__icon">
                  <Bell size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="attention-banner__title">Need your attention</h3>
                  <p className="attention-banner__message">
                    You have {stats.claims} pending claim that requires your review.
                  </p>
                </div>
              </div>
              <Link to="/my-claims" className="btn btn--gold btn--small attention-banner__btn">
                <span>Review claim</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </section>
          )}

          {/* ── Recent Lost & Found with Toolbar & Grid ──────────────────── */}
          <section className="section recent-section">
            <div className="section__head recent-section__head">
              <div>
                <h2 className="recent-section__title">Recent Lost &amp; Found</h2>
                <p className="muted recent-section__subtitle">
                  See the latest items reported by students on campus.
                </p>
              </div>
              <Link className="link link--view-all" to="/search">
                <span>View all items</span>
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </div>

            {/* Inline Search & Filter Toolbar */}
            <div className="dashboard-filter-bar">
              <div className="dashboard-filter-bar__search">
                <Search size={15} aria-hidden="true" className="dashboard-filter-bar__icon" />
                <input
                  type="text"
                  className="dashboard-filter-bar__input"
                  placeholder="Search items by name, location or description…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="dashboard-filter-bar__dropdowns">
                <select
                  className="select-input"
                  aria-label="Filter by category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  className="select-input"
                  aria-label="Filter by status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="claimed">Claimed</option>
                  <option value="resolved">Resolved</option>
                </select>

                <select
                  className="select-input"
                  aria-label="Filter by type"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  <option value="all">All types</option>
                  <option value="lost">Lost</option>
                  <option value="found">Found</option>
                </select>
              </div>
            </div>

            {/* Responsive Items Grid */}
            {filteredItems.length === 0 ? (
              <div className="card card--soft recent-empty">
                <PackageSearch size={32} className="muted" aria-hidden="true" />
                <p className="muted">
                  {items.length === 0
                    ? 'No items reported yet — be the first to report a lost item or register something you found.'
                    : 'No items match your active search filters.'}
                </p>
                {(searchQuery ||
                  selectedCategory !== 'all' ||
                  selectedStatus !== 'all' ||
                  selectedType !== 'all') && (
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedCategory('all')
                      setSelectedStatus('all')
                      setSelectedType('all')
                    }}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <div className="item-grid item-grid--dashboard">
                {filteredItems.map((item) => (
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
      supabase
        .from('claims')
        .select(CLAIMS_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('items').select(ITEMS_SELECT).order('created_at', { ascending: false }).limit(6),
    ])
    if (
      total.error ||
      open.error ||
      resolved.error ||
      pendingClaims.error ||
      users.error ||
      claimsRes.error ||
      itemsRes.error
    ) {
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

  if (!profile) return null

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="page-header__title">Operations Overview</h1>
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
          <section className="stats-grid stats-grid--4">
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
                    <span className="claim-preview__avatar">
                      {initials(claim.claimant?.name ?? '?')}
                    </span>
                    <span className="claim-preview__body">
                      <span className="claim-preview__line">
                        {claim.claimant?.name ?? 'A user'} claimed "{claim.item?.title ?? 'item'}"
                      </span>
                      <span className="claim-preview__meta">
                        {timeAgo(claim.created_at)} ·{' '}
                        {claim.item?.type === 'lost' ? 'Lost' : 'Found'} item
                      </span>
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
