import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PackageSearch, RotateCcw, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ItemCard from '../components/ItemCard'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import type { ItemStatus, ItemType, ItemWithReporter } from '../lib/types'
import { cn, pluralize } from '../lib/utils'

const ITEMS_SELECT = '*, reporter:profiles!items_reported_by_fkey(name, email)'

interface Filters {
  q: string
  type: 'all' | ItemType
  category: string
  status: 'all' | ItemStatus
  location: string
  dateFrom: string
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  type: 'all',
  category: 'all',
  status: 'all',
  location: '',
  dateFrom: '',
}

const TYPE_OPTIONS: Array<{ value: Filters['type']; label: string }> = [
  { value: 'all', label: 'All Items' },
  { value: 'lost', label: 'Lost' },
  { value: 'found', label: 'Found' },
]

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState<ItemWithReporter[] | null>(null)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>(() => {
    const q = searchParams.get('q') || ''
    const t = searchParams.get('type') as ItemType | null
    const c = searchParams.get('category') || 'all'
    return {
      ...DEFAULT_FILTERS,
      q,
      type: t === 'lost' || t === 'found' ? t : 'all',
      category: c,
    }
  })
  const [showFilters, setShowFilters] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce search query to keep typing responsive
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(filters.q)
    }, 200)
    return () => clearTimeout(handler)
  }, [filters.q])

  useEffect(() => {
    const qParam = searchParams.get('q')
    const typeParam = searchParams.get('type') as ItemType | null
    const catParam = searchParams.get('category')
    if (qParam !== null || typeParam !== null || catParam !== null) {
      setFilters((prev) => ({
        ...prev,
        q: qParam !== null ? qParam : prev.q,
        type: typeParam === 'lost' || typeParam === 'found' ? typeParam : prev.type,
        category: catParam !== null ? catParam : prev.category,
      }))
    }
  }, [searchParams])

  useEffect(() => {
    let active = true
    async function load() {
      const { data, error: err } = await supabase
        .from('items')
        .select(ITEMS_SELECT)
        .order('created_at', { ascending: false })
        .limit(300)
      if (!active) return
      if (err) {
        setError('Could not load items. Please try again.')
        return
      }
      setItems((data as ItemWithReporter[] | null) ?? [])
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = debouncedQuery.trim().toLowerCase()
    const location = filters.location.trim().toLowerCase()
    return items.filter((item) => {
      if (filters.type !== 'all' && item.type !== filters.type) return false
      if (filters.category !== 'all' && item.category !== filters.category) return false
      if (filters.status !== 'all' && item.status !== filters.status) return false
      if (location && !item.location.toLowerCase().includes(location)) return false
      if (filters.dateFrom && item.date < filters.dateFrom) return false
      if (
        q &&
        ![item.title, item.description, item.location, item.category].some((field) =>
          field.toLowerCase().includes(q),
        )
      ) {
        return false
      }
      return true
    })
  }, [items, filters, debouncedQuery])

  const hasActiveFilters =
    filters.q.trim() !== '' ||
    filters.type !== 'all' ||
    filters.category !== 'all' ||
    filters.status !== 'all' ||
    filters.location.trim() !== '' ||
    filters.dateFrom !== ''

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  return (
    <div className="container page">
      <PageHeader
        title="Search campus lost &amp; found"
        subtitle="Browse all reported lost and registered found items with dynamic filtering."
      />

      <div className="search-bar">
        <Search size={18} className="search-bar__icon" aria-hidden="true" />
        <input
          className="search-bar__input"
          type="search"
          placeholder="Search by title, description, category or location…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        {filters.q && (
          <button
            type="button"
            className="search-bar__clear"
            onClick={() => setFilters((f) => ({ ...f, q: '' }))}
            aria-label="Clear search query"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="filter-row">
        <div className="segmented">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn('segmented__btn', filters.type === opt.value && 'segmented__btn--active')}
              onClick={() => setFilters((f) => ({ ...f, type: opt.value }))}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={cn('btn btn--secondary btn--small', hasActiveFilters && 'btn--filtered')}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          More Filters
          {hasActiveFilters && (
            <span className="filter-count">
              {Object.values(filters).filter((v) => v !== 'all' && v !== '').length}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="filter-chips">
          {filters.type !== 'all' && (
            <span className="filter-chip">
              Type: {filters.type === 'lost' ? 'Lost' : 'Found'}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, type: 'all' }))}
                aria-label="Remove type filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.category !== 'all' && (
            <span className="filter-chip">
              Category: {filters.category}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, category: 'all' }))}
                aria-label="Remove category filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.status !== 'all' && (
            <span className="filter-chip">
              Status: {filters.status}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, status: 'all' }))}
                aria-label="Remove status filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.location.trim() !== '' && (
            <span className="filter-chip">
              Location: “{filters.location}”
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, location: '' }))}
                aria-label="Remove location filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.dateFrom !== '' && (
            <span className="filter-chip">
              Since: {filters.dateFrom}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, dateFrom: '' }))}
                aria-label="Remove date filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          <button type="button" className="btn btn--small btn--ghost filter-reset-btn" onClick={clearFilters}>
            <RotateCcw size={12} aria-hidden="true" />
            Reset all
          </button>
        </div>
      )}

      {showFilters && (
        <div className="card filter-panel">
          <div className="filter-panel__grid">
            <label className="field__label" htmlFor="f-category">
              Category
            </label>
            <select
              id="f-category"
              className="input"
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="field__label" htmlFor="f-status">
              Status
            </label>
            <select
              id="f-status"
              className="input"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
            >
              <option value="all">Any status</option>
              <option value="open">Open</option>
              <option value="claimed">Claimed</option>
              <option value="resolved">Resolved</option>
            </select>

            <label className="field__label" htmlFor="f-location">
              Location
            </label>
            <input
              id="f-location"
              className="input"
              type="text"
              placeholder="e.g. Library, Science Bldg…"
              value={filters.location}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            />

            <label className="field__label" htmlFor="f-date">
              Lost/found on or after
            </label>
            <input
              id="f-date"
              className="input"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>
          <div className="filter-panel__footer">
            <button type="button" className="btn btn--ghost btn--small" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : !items ? (
        <LoadingScreen label="Loading items…" />
      ) : (
        <>
          <p className="results-count">
            {pluralize(filtered.length, 'item')} match{hasActiveFilters ? ' your filters' : ''}
          </p>

          {filtered.length === 0 ? (
            <EmptyState
              icon={items.length === 0 ? PackageSearch : SearchX}
              title={items.length === 0 ? 'Nothing here yet' : 'No matches found'}
              message={
                items.length === 0
                  ? 'Items reported and registered across campus will appear here.'
                  : 'Try removing a filter or searching with different keywords.'
              }
            />
          ) : (
            <div className="item-grid">
              {filtered.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
