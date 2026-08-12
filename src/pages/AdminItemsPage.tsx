import { useEffect, useMemo, useState } from 'react'
import { Eye, PackageSearch, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import ConfirmDialog from '../components/ConfirmDialog'
import { TypeBadge } from '../components/StatusBadge'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ItemStatus, ItemWithReporter } from '../lib/types'
import { cn, formatDate, pluralize } from '../lib/utils'

const ITEMS_SELECT = '*, reporter:profiles!items_reported_by_fkey(name, email)'

const STATUS_OPTIONS: ItemStatus[] = ['open', 'claimed', 'resolved']

export default function AdminItemsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<ItemWithReporter[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'lost' | 'found'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ItemStatus>('all')
  const [deleteTarget, setDeleteTarget] = useState<ItemWithReporter | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const { data, error: err } = await supabase
      .from('items')
      .select(ITEMS_SELECT)
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) {
      setError('Could not load items.')
      return
    }
    setItems((data as ItemWithReporter[] | null) ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (!items) return []
    const query = q.trim().toLowerCase()
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (query && !item.title.toLowerCase().includes(query)) return false
      return true
    })
  }, [items, q, typeFilter, statusFilter])

  async function changeStatus(item: ItemWithReporter, status: ItemStatus) {
    const { error: err } = await supabase.from('items').update({ status }).eq('id', item.id)
    if (err) {
      toast('error', 'Could not update the item status.')
      return
    }
    toast('success', `“${item.title}” is now ${status}.`)
    setItems((prev) => prev?.map((it) => (it.id === item.id ? { ...it, status } : it)) ?? null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase.from('items').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) {
      toast('error', 'Could not delete the item.')
      return
    }
    toast('success', 'Item deleted.')
    setItems((prev) => prev?.filter((it) => it.id !== deleteTarget.id) ?? null)
    setDeleteTarget(null)
  }

  return (
    <div className="container page">
      <PageHeader
        title="Manage items"
        subtitle="Review, update, or remove every lost and found item on the platform."
      />

      <div className="toolbar">
        <div className="search-bar search-bar--inline">
          <Search size={16} className="search-bar__icon" aria-hidden="true" />
          <input
            className="search-bar__input"
            type="search"
            placeholder="Filter by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <select className="input input--auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">All types</option>
          <option value="lost">Lost</option>
          <option value="found">Found</option>
        </select>

        <select className="input input--auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">Any status</option>
          <option value="open">Open</option>
          <option value="claimed">Claimed</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items ? (
        <LoadingScreen label="Loading items…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={items.length === 0 ? 'No items yet' : 'No items match your filters'}
          message={items.length === 0 ? 'Items reported by users will appear here.' : 'Try clearing the search or filters.'}
        />
      ) : (
        <>
          <p className="results-count">{pluralize(filtered.length, 'item')}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Reported by</th>
                  <th>Date</th>
                  <th className="table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="table-item">
                        <span className="table-item__thumb">
                          {item.photo_url ? <img src={item.photo_url} alt="" /> : <PackageSearch size={15} />}
                        </span>
                        <div>
                          <Link className="table-item__title" to={`/items/${item.id}`}>
                            {item.title}
                          </Link>
                          <span className="table-item__sub">{item.category} · {item.location}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <TypeBadge type={item.type} />
                    </td>
                    <td>
                      <select
                        className={cn('input input--auto input--status', `input--status-${item.status}`)}
                        value={item.status}
                        onChange={(e) => void changeStatus(item, e.target.value as ItemStatus)}
                        aria-label={`Status of ${item.title}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{item.reporter?.name ?? 'Former member'}</td>
                    <td>{formatDate(item.date)}</td>
                    <td className="table__actions-col">
                      <div className="row row--sm">
                        <Link className="icon-btn" to={`/items/${item.id}`} title="View item" aria-label={`View ${item.title}`}>
                          <Eye size={16} />
                        </Link>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          title="Delete item"
                          aria-label={`Delete ${item.title}`}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete item"
        message={`Delete “${deleteTarget?.title}”? This permanently removes the listing and all of its claims.`}
        confirmLabel="Delete item"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
