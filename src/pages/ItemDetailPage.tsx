import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CircleAlert,
  Clock,
  HandHeart,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Tag,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, ItemWithReporter } from '../lib/types'
import { ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, ItemStatusBadge, TypeBadge } from '../components/StatusBadge'
import ClaimDecisionButtons from '../components/ClaimDecisionButtons'
import FormField from '../components/FormField'
import { cn, formatDate, initials, timeAgo } from '../lib/utils'

const ITEMS_SELECT = '*, reporter:profiles!items_reported_by_fkey(name, email)'
const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'

const OWNER_NAME_RE = /^[A-Za-z\s'-]+$/
const PHONE_RE = /^0\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const { toast } = useToast()

  const [item, setItem] = useState<ItemWithReporter | null>(null)
  const [claims, setClaims] = useState<ClaimWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [ownerName, setOwnerName] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [verification, setVerification] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claimFieldErrors, setClaimFieldErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    const [itemRes, claimsRes] = await Promise.all([
      supabase.from('items').select(ITEMS_SELECT).eq('id', id).maybeSingle(),
      supabase
        .from('claims')
        .select(CLAIMS_SELECT)
        .eq('item_id', id)
        .order('created_at', { ascending: false }),
    ])
    if (itemRes.error) {
      setError('Could not load this item.')
      setLoading(false)
      return
    }
    setItem((itemRes.data as ItemWithReporter | null) ?? null)
    if (!claimsRes.error) setClaims((claimsRes.data as ClaimWithRelations[] | null) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  function validateClaim(): boolean {
    const errs: Record<string, string> = {}

    if (!ownerName.trim() || !OWNER_NAME_RE.test(ownerName.trim())) {
      errs.ownerName = 'Enter your full name (letters, spaces, hyphens, apostrophes only).'
    }

    const contact = contactInfo.trim()
    if (!contact) {
      errs.contactInfo = 'Provide a phone number or email address.'
    } else if (!PHONE_RE.test(contact) && !EMAIL_RE.test(contact)) {
      errs.contactInfo = 'Must be a valid phone (0XXXXXXXXX) or email address.'
    }

    if (verification.trim().length < 15) {
      errs.verification = 'Describe the item in enough detail (at least 15 characters).'
    }

    setClaimFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submitClaim(e: FormEvent) {
    e.preventDefault()
    if (!profile || !item) return
    if (!validateClaim()) return

    // Duplicate claim check
    const { data: existingClaim } = await supabase
      .from('claims')
      .select('id')
      .eq('item_id', item.id)
      .eq('claimant_uid', profile.id)
      .in('status', ['pending', 'meeting_required'])
      .maybeSingle()

    if (existingClaim) {
      setClaimError('You already have an active claim for this item.')
      return
    }

    setClaimError('')
    setClaimBusy(true)
    const { error: err } = await supabase.from('claims').insert({
      item_id: item.id,
      claimant_uid: profile.id,
      owner_name: ownerName.trim(),
      contact_info: contactInfo.trim(),
      verification_details: verification.trim(),
    })
    setClaimBusy(false)
    if (err) {
      setClaimError(err.message)
      return
    }
    toast('success', 'Claim submitted — the admin team has been notified.')
    setOwnerName('')
    setContactInfo('')
    setVerification('')
    setClaimFieldErrors({})
    void load()
  }

  if (loading) return <LoadingScreen label="Loading item…" />
  if (error || !item)
    return (
      <div className="container page">
        <ErrorState title="Item not found" message={error || 'This item may have been removed.'} />
      </div>
    )

  const myClaim = profile ? claims.find((c) => c.claimant_uid === profile.id) ?? null : null
  const isAdmin = profile?.role === 'admin'
  const canClaim =
    item.type === 'found' &&
    item.status === 'open' &&
    profile &&
    profile.role !== 'admin' &&
    profile.id !== item.reported_by &&
    !myClaim
  const showClaims = isAdmin || myClaim || (profile && profile.id === item.reported_by)

  return (
    <div className="container page">
      <Link className="back-link" to="/search">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to search
      </Link>

      <div className="detail-grid">
        <div className="detail-media">
          {item.photo_url ? (
            <img
              src={item.photo_url}
              alt={item.title}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="detail-media__placeholder">
              <HandHeart size={40} aria-hidden="true" />
              <span>No photo provided</span>
            </div>
          )}
        </div>

        <div className="detail-body">
          <div className="row row--wrap">
            <TypeBadge type={item.type} />
            <ItemStatusBadge status={item.status} />
          </div>

          <h1 className="detail-title">{item.title}</h1>
          <p className="detail-description">{item.description}</p>

          <dl className="detail-meta">
            <div className="detail-meta__row">
              <dt>
                <MapPin size={15} aria-hidden="true" />
                Location
              </dt>
              <dd>{item.location}</dd>
            </div>
            <div className="detail-meta__row">
              <dt>
                <Calendar size={15} aria-hidden="true" />
                {item.type === 'lost' ? 'Lost on' : 'Found on'}
              </dt>
              <dd>{formatDate(item.date)}</dd>
            </div>
            <div className="detail-meta__row">
              <dt>
                <Tag size={15} aria-hidden="true" />
                Category
              </dt>
              <dd>{item.category}</dd>
            </div>
            <div className="detail-meta__row">
              <dt>
                <Clock size={15} aria-hidden="true" />
                Listed
              </dt>
              <dd>{timeAgo(item.created_at)}</dd>
            </div>
            <div className="detail-meta__row">
              <dt>
                <UserRound size={15} aria-hidden="true" />
                Reported by
              </dt>
              <dd>{item.reporter?.name ?? 'Former member'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {item.status === 'open' && item.type === 'found' && !isAdmin && !myClaim && profile && profile.id === item.reported_by && (
        <div className="alert alert--info">
          <ShieldCheck size={16} aria-hidden="true" />
          You registered this found item. When someone claims it, you will be notified to verify their
          description.
        </div>
      )}

      {item.status === 'claimed' && (
        <div className="alert alert--info">
          <ShieldCheck size={16} aria-hidden="true" />
          This item has been claimed and is awaiting pickup. The listing will be closed once it is
          resolved.
        </div>
      )}

      {item.status === 'resolved' && (
        <div className="alert alert--success">
          <ShieldCheck size={16} aria-hidden="true" />
          This item has been resolved and returned to its owner. Thank you for using Campus Lost
          &amp; Found.
        </div>
      )}

      {canClaim && (
        <section className="card claim-card">
          <div className="claim-card__head">
            <span className="claim-card__icon">
              <HandHeart size={18} aria-hidden="true" />
            </span>
            <div>
              <h2>Is this yours?</h2>
              <p>
                Submit a claim and describe the item in detail. The admin team compares your
                description with the finder&apos;s listing before approving.
              </p>
            </div>
          </div>

          <form className="form" onSubmit={(e) => void submitClaim(e)} noValidate>
            {claimError && (
              <div className="alert alert--error" role="alert">
                <CircleAlert size={16} aria-hidden="true" />
                {claimError}
              </div>
            )}

            <div className="form-grid">
              <FormField label="Your full name" htmlFor="owner-name" required error={claimFieldErrors.ownerName}>
                <input
                  id="owner-name"
                  className="input"
                  type="text"
                  placeholder="e.g. Kwame Asante"
                  value={ownerName}
                  onChange={(e) => {
                    setOwnerName(e.target.value)
                    setClaimFieldErrors((prev) => {
                      const next = { ...prev }
                      delete next.ownerName
                      return next
                    })
                  }}
                />
              </FormField>

              <FormField label="Contact info" htmlFor="contact-info" required error={claimFieldErrors.contactInfo} hint="Phone (0XXXXXXXXX) or email address.">
                <input
                  id="contact-info"
                  className="input"
                  type="text"
                  placeholder="e.g. 0241234567 or name@campus.edu"
                  value={contactInfo}
                  onChange={(e) => {
                    setContactInfo(e.target.value)
                    setClaimFieldErrors((prev) => {
                      const next = { ...prev }
                      delete next.contactInfo
                      return next
                    })
                  }}
                />
              </FormField>
            </div>

            <FormField
              label="Proof of ownership"
              htmlFor="verification"
              required
              error={claimFieldErrors.verification}
              hint="Color, brand, contents, marks or serial numbers — anything that proves it is yours."
            >
              <textarea
                id="verification"
                className="input"
                rows={4}
                placeholder="e.g. It is a black 15-inch laptop with a small sticker of a wave on the lid, and the charger was inside the pocket…"
                value={verification}
                onChange={(e) => {
                  setVerification(e.target.value)
                  setClaimFieldErrors((prev) => {
                    const next = { ...prev }
                    delete next.verification
                    return next
                  })
                }}
              />
            </FormField>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={claimBusy}>
                {claimBusy ? 'Submitting…' : 'Submit claim'}
              </button>
            </div>
          </form>
        </section>
      )}

      {myClaim && (
        <section className="card claim-card">
          <div className="claim-card__head">
            <span className="claim-card__icon">
              <MessageSquare size={18} aria-hidden="true" />
            </span>
            <div>
              <h2>Your claim</h2>
              <p className="claim-card__status">
                <ClaimStatusBadge status={myClaim.status} />
              </p>
              {myClaim.status === 'rejected' && myClaim.rejection_reason && (
                <p className="muted">Reason: {myClaim.rejection_reason}</p>
              )}
              {myClaim.status === 'meeting_required' && myClaim.meeting_details && (
                <p className="muted">{myClaim.meeting_details}</p>
              )}
            </div>
          </div>
          <blockquote className="claim-verification">"{myClaim.verification_details}"</blockquote>
          {myClaim.owner_name && (
            <p className="muted" style={{ marginTop: '0.5rem' }}>Name: {myClaim.owner_name} · Contact: {myClaim.contact_info}</p>
          )}
        </section>
      )}

      {showClaims && (
        <section className="section">
          <div className="section__head">
            <h2>Claims ({claims.length})</h2>
            <p className="muted">{isAdmin ? 'Review verification details before deciding.' : 'Claim activity on this item.'}</p>
          </div>

          {claims.length === 0 ? (
            <div className="card card--soft">
              <p className="muted">No claims have been submitted for this item yet.</p>
            </div>
          ) : (
            <div className="claim-list">
              {claims.map((claim) => (
                <div key={claim.id} className={cn('claim-row', claim.status === 'pending' && 'claim-row--pending')}>
                  <span className="claim-row__avatar">{initials(claim.claimant?.name ?? '?')}</span>
                  <div className="claim-row__body">
                    <div className="claim-row__head">
                      <strong>{claim.claimant?.name ?? 'Former member'}</strong>
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                    <p className="claim-row__meta">
                      {claim.claimant?.email} · {timeAgo(claim.created_at)}
                    </p>
                    {claim.owner_name && (
                      <p className="claim-row__meta">Name: {claim.owner_name} · Contact: {claim.contact_info}</p>
                    )}
                    <blockquote className="claim-verification">"{claim.verification_details}"</blockquote>
                    {claim.status === 'rejected' && claim.rejection_reason && (
                      <p className="muted">Rejection reason: {claim.rejection_reason}</p>
                    )}
                    {claim.status === 'meeting_required' && claim.meeting_details && (
                      <p className="muted">Meeting: {claim.meeting_details}</p>
                    )}
                    {isAdmin && (claim.status === 'pending' || claim.status === 'meeting_required') && (
                      <div className="claim-row__actions">
                        <ClaimDecisionButtons claim={claim} onDone={() => void load()} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
