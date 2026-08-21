import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  CircleAlert,
  Clock,
  HandHeart,
  MapPin,
  MessageSquare,
  PackageSearch,
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
import ClaimMessagingModal from '../components/ClaimMessagingModal'
import FormField from '../components/FormField'
import { cn, formatDate, initials, timeAgo } from '../lib/utils'

const ITEMS_SELECT = '*, reporter:profiles!items_reported_by_fkey(name, email)'
const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status, reported_by), claimant:profiles!claims_claimant_uid_fkey(name, email)'

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
  const [activeMessagingClaim, setActiveMessagingClaim] = useState<ClaimWithRelations | null>(null)
  const [messagingItem, setMessagingItem] = useState<ItemWithReporter | null>(null)

  // Claim form state
  const [ownerName, setOwnerName] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [verification, setVerification] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claimFieldErrors, setClaimFieldErrors] = useState<Record<string, string>>({})

  // "I Found This" modal state
  const [foundItOpen, setFoundItOpen] = useState(false)
  const [foundItContact, setFoundItContact] = useState('')
  const [foundItLocation, setFoundItLocation] = useState('')
  const [foundItMessage, setFoundItMessage] = useState('')
  const [foundItBusy, setFoundItBusy] = useState(false)
  const [foundItErrors, setFoundItErrors] = useState<Record<string, string>>({})
  const [foundItSent, setFoundItSent] = useState(false)

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

  // ── Claim form ──────────────────────────────────────────────────────────────

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

  // ── "I Found This" form ─────────────────────────────────────────────────────

  function validateFoundIt(): boolean {
    const errs: Record<string, string> = {}

    const contact = foundItContact.trim()
    if (!contact) {
      errs.contact = 'Provide a phone number or email so the owner can reach you.'
    } else if (!PHONE_RE.test(contact) && !EMAIL_RE.test(contact)) {
      errs.contact = 'Must be a valid phone (0XXXXXXXXX) or email address.'
    }

    if (foundItLocation.trim().length < 2) {
      errs.location = 'Where did you find it?'
    }

    setFoundItErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submitFoundIt(e: FormEvent) {
    e.preventDefault()
    if (!profile || !item || !item.reported_by) return
    if (!validateFoundIt()) return

    // Don't let someone notify themselves
    if (profile.id === item.reported_by) {
      toast('info', 'You reported this item — no need to notify yourself.')
      setFoundItOpen(false)
      return
    }

    setFoundItBusy(true)

    // Build the notification message
    const finderName = profile.name
    const contact = foundItContact.trim()
    const location = foundItLocation.trim()
    const msg = foundItMessage.trim()

    let notification = `${finderName} found your lost “${item.title}”!`
    notification += ` They found it at: ${location}.`
    notification += ` Contact them at: ${contact}.`
    if (msg) {
      notification += ` Message: ${msg}`
    }

    // Attempt direct RPC call first
    const { error: rpcErr } = await supabase.rpc('notify_item_found', {
      target_item_id: item.id,
      finder_contact: contact,
      found_location: location,
      finder_note: msg || null,
    })

    if (rpcErr) {
      // Fallback to direct notifications table insert
      const { error: insertErr } = await supabase.from('notifications').insert({
        user_id: item.reported_by,
        message: notification,
      })

      if (insertErr) {
        console.error('Failed to notify owner:', insertErr.message)
        setFoundItBusy(false)
        toast('error', `Could not send notification: ${insertErr.message}`)
        return
      }
    }

    setFoundItBusy(false)
    setFoundItSent(true)
    toast('success', 'The item owner has been notified!')
    setFoundItContact('')
    setFoundItLocation('')
    setFoundItMessage('')
    setFoundItErrors({})
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen label="Loading item…" />
  if (error || !item)
    return (
      <div className="container page">
        <ErrorState title="Item not found" message={error || 'This item may have been removed.'} />
      </div>
    )

  const myClaim = profile ? claims.find((c) => c.claimant_uid === profile.id) ?? null : null
  const isAdmin = profile?.role === 'admin'
  const isOwner = profile?.id === item.reported_by

  // Can the current user claim this found item?
  const canClaim =
    item.type === 'found' &&
    item.status === 'open' &&
    profile &&
    !isAdmin &&
    !isOwner &&
    !myClaim

  // Can the current user report finding this lost item?
  const canReportFound =
    item.type === 'lost' &&
    item.status === 'open' &&
    profile &&
    !isAdmin &&
    !isOwner

  const showClaims = isAdmin || myClaim || isOwner

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

      {/* ── Info banners & Actions ────────────────────────────────────────── */}

      {item.status === 'open' && item.type === 'found' && !isAdmin && isOwner && (
        <section className="card claim-card">
          <div className="claim-card__head">
            <span className="claim-card__icon found-it-icon">
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <div>
              <h2>You registered this found item</h2>
              <p>
                When a student or staff claims this item, you will be notified. You can also chat directly with the campus admin team at any time.
              </p>
            </div>
          </div>
          <div className="claim-row__actions" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setMessagingItem(item)}
            >
              <MessageSquare size={15} aria-hidden="true" />
              Chat with Admin about this item
            </button>
          </div>
        </section>
      )}

      {isAdmin && item.reported_by && (
        <div
          className="card"
          style={{
            padding: '12px 18px',
            marginBottom: 'var(--sp-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <span className="muted">
            Reported by: <strong>{item.reporter?.name || 'User'}</strong> ({item.reporter?.email || 'No email'})
          </span>
          <button
            type="button"
            className="btn btn--small btn--secondary"
            onClick={() => setMessagingItem(item)}
          >
            <MessageSquare size={14} aria-hidden="true" />
            Message {item.type === 'found' ? 'Finder' : 'Reporter'}
          </button>
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

      {/* ── "I Found This" banner for lost items ──────────────────────────── */}

      {canReportFound && (
        <section className="card claim-card">
          <div className="claim-card__head">
            <span className="claim-card__icon found-it-icon">
              <PackageSearch size={18} aria-hidden="true" />
            </span>
            <div>
              <h2>Found this item?</h2>
              <p>
                If you have this item, let the owner know! Leave your contact details and where you
                found it — they will be notified immediately.
              </p>
            </div>
          </div>
          <div className="form-actions found-it-actions">
            <button
              type="button"
              className="btn btn--success"
              onClick={() => { setFoundItOpen(true); setFoundItSent(false) }}
            >
              <PackageSearch size={16} aria-hidden="true" />
              I Found This Item
            </button>
          </div>
        </section>
      )}

      {/* ── "Is this yours?" claim form for found items ──────────────────── */}

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

      {/* ── My claim status ───────────────────────────────────────────────── */}

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
            <p className="muted claim-details">Name: {myClaim.owner_name} · Contact: {myClaim.contact_info}</p>
          )}
          <div className="claim-row__actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn--small btn--secondary"
              onClick={() => setActiveMessagingClaim(myClaim)}
            >
              <MessageSquare size={14} aria-hidden="true" />
              Chat / Message Staff
            </button>
          </div>
        </section>
      )}

      {/* ── Claims list (admin / reporter / claimant) ─────────────────────── */}

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
                    <div className="claim-row__actions">
                      {isAdmin && (claim.status === 'pending' || claim.status === 'meeting_required') && (
                        <ClaimDecisionButtons claim={claim} onDone={() => void load()} />
                      )}
                      <button
                        type="button"
                        className="btn btn--small btn--secondary"
                        onClick={() => setActiveMessagingClaim(claim)}
                      >
                        <MessageSquare size={14} aria-hidden="true" />
                        Message
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── "I Found This" modal ──────────────────────────────────────────── */}

      {foundItOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !foundItBusy) setFoundItOpen(false)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            {foundItSent ? (
              <>
                <div className="modal-success">
                  <CheckCircle size={48} className="modal-success__icon" />
                  <h3 className="modal__title">Owner notified!</h3>
                  <p className="modal__message">
                    {item.reporter?.name ?? 'The owner'} has been notified that you found their
                    item. They will reach out to you at the contact details you provided.
                  </p>
                </div>
                <div className="modal__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setFoundItOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="modal__title">I Found This Item</h3>
                <p className="modal__message">
                  Tell <strong>{item.reporter?.name ?? 'the owner'}</strong> where you found
                  their <strong>{item.title}</strong> and how to reach you.
                </p>

                <form className="form" onSubmit={(e) => void submitFoundIt(e)} noValidate>
                  {foundItErrors.contact && (
                    <div className="alert alert--error" role="alert">
                      <CircleAlert size={16} aria-hidden="true" />
                      {foundItErrors.contact}
                    </div>
                  )}

                  <FormField label="Your contact info" htmlFor="found-contact" required error={foundItErrors.contact} hint="Phone (0XXXXXXXXX) or email — the owner will use this to reach you.">
                    <input
                      id="found-contact"
                      className="input"
                      type="text"
                      placeholder="e.g. 0241234567 or name@campus.edu"
                      value={foundItContact}
                      onChange={(e) => {
                        setFoundItContact(e.target.value)
                        setFoundItErrors((prev) => {
                          const next = { ...prev }
                          delete next.contact
                          return next
                        })
                      }}
                    />
                  </FormField>

                  <FormField label="Where did you find it?" htmlFor="found-location" required error={foundItErrors.location}>
                    <input
                      id="found-location"
                      className="input"
                      type="text"
                      placeholder="e.g. Main Library, 2nd floor near the window"
                      value={foundItLocation}
                      onChange={(e) => {
                        setFoundItLocation(e.target.value)
                        setFoundItErrors((prev) => {
                          const next = { ...prev }
                          delete next.location
                          return next
                        })
                      }}
                    />
                  </FormField>

                  <FormField label="Optional message" htmlFor="found-message" hint="Any extra details that might help the owner identify the item.">
                    <textarea
                      id="found-message"
                      className="input"
                      rows={3}
                      placeholder="e.g. It looks exactly like the one in the photo. I left it with the library front desk."
                      value={foundItMessage}
                      onChange={(e) => setFoundItMessage(e.target.value)}
                    />
                  </FormField>

                  <div className="modal__actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setFoundItOpen(false)}
                      disabled={foundItBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn--success"
                      disabled={foundItBusy}
                    >
                      {foundItBusy ? 'Sending…' : 'Notify Owner'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {(activeMessagingClaim || messagingItem) && (
        <ClaimMessagingModal
          claim={activeMessagingClaim}
          item={messagingItem}
          defaultRecipientId={
            activeMessagingClaim
              ? (profile?.role === 'admin' ? activeMessagingClaim.claimant_uid : undefined)
              : (messagingItem?.reported_by || undefined)
          }
          onClose={() => {
            setActiveMessagingClaim(null)
            setMessagingItem(null)
          }}
        />
      )}
    </div>
  )
}
