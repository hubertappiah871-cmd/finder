import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ClipboardCheck, FileText, MessageSquare, Send } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import ClaimMessagingModal from '../components/ClaimMessagingModal'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, ItemWithReporter, MessageWithSender } from '../lib/types'
import { cn, timeAgo } from '../lib/utils'

const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status, reported_by), claimant:profiles!claims_claimant_uid_fkey(name, email)'
const MESSAGES_SELECT =
  '*, sender:profiles!messages_sender_id_fkey(name, role), recipient:profiles!messages_recipient_id_fkey(name, role), item:items!messages_item_id_fkey(id, title, type, photo_url), claim:claims!messages_claim_id_fkey(id, item_id, claimant_uid, status, item:items!claims_item_id_fkey(id, title, type, photo_url, status, reported_by), claimant:profiles!claims_claimant_uid_fkey(name, email))'

type Tab = 'claims' | 'messages'

export default function MyClaimsPage() {
  const { profile } = useAuth()
  const [claims, setClaims] = useState<ClaimWithRelations[] | null>(null)
  const [messages, setMessages] = useState<MessageWithSender[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('claims')
  const [activeMessagingClaim, setActiveMessagingClaim] = useState<ClaimWithRelations | null>(null)
  const [activeMessagingItem, setActiveMessagingItem] = useState<ItemWithReporter | null>(null)

  const loadClaims = useCallback(async () => {
    if (!profile) return
    const { data, error: err } = await supabase
      .from('claims')
      .select(CLAIMS_SELECT)
      .eq('claimant_uid', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) {
      setError('Could not load claims.')
      return
    }
    setClaims((data as ClaimWithRelations[] | null) ?? [])
  }, [profile])

  const loadMessages = useCallback(async () => {
    if (!profile) return
    const { data, error: err } = await supabase
      .from('messages')
      .select(MESSAGES_SELECT)
      .or(`recipient_id.eq.${profile.id},sender_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (err) {
      console.error('Could not load messages:', err.message)
      // Fallback query in case foreign key path differs
      const { data: fallbackData } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(name, role), recipient:profiles!messages_recipient_id_fkey(name, role)')
        .or(`recipient_id.eq.${profile.id},sender_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
        .limit(100)
      setMessages((fallbackData as MessageWithSender[] | null) ?? [])
      return
    }
    setMessages((data as MessageWithSender[] | null) ?? [])
  }, [profile])

  const location = useLocation()

  useEffect(() => {
    if (!profile) return
    let active = true
    async function load() {
      await Promise.all([loadClaims(), loadMessages()])
      if (!active) return
    }
    void load()
    return () => {
      active = false
    }
  }, [profile, loadClaims, loadMessages, location.pathname])

  const unreadCount =
    messages?.filter((m) => m.recipient_id === profile?.id && !m.read).length ?? 0

  function openChatForClaim(claim: ClaimWithRelations) {
    setActiveMessagingItem(null)
    setActiveMessagingClaim(claim)
  }

  function openChatForMessage(msg: MessageWithSender) {
    if (msg.claim) {
      setActiveMessagingItem(null)
      setActiveMessagingClaim(msg.claim as ClaimWithRelations)
      return
    }
    if (msg.item || msg.item_id) {
      setActiveMessagingClaim(null)
      setActiveMessagingItem(
        (msg.item as ItemWithReporter) || {
          id: msg.item_id || '',
          title: 'Item',
          type: 'found',
          category: 'Other',
          location: '',
          date: '',
          description: '',
          photo_url: null,
          status: 'open',
          reported_by: null,
          created_at: msg.created_at,
          reporter: null,
        },
      )
      return
    }
    // If claim wasn't embedded, find from loaded claims or create minimal object
    const matched = claims?.find((c) => c.id === msg.claim_id)
    if (matched) {
      setActiveMessagingItem(null)
      setActiveMessagingClaim(matched)
    } else {
      setActiveMessagingItem(null)
      setActiveMessagingClaim({
        id: msg.claim_id || '',
        item_id: '',
        claimant_uid: profile?.id ?? '',
        owner_name: '',
        contact_info: '',
        verification_details: '',
        status: 'pending',
        rejection_reason: null,
        admin_notes: null,
        meeting_details: null,
        created_at: msg.created_at,
        item: null,
        claimant: { name: profile?.name ?? 'Me', email: profile?.email ?? '' },
      })
    }
  }

  return (
    <div className="container page">
      <PageHeader
        title="My claims"
        subtitle="Track every item you have claimed, message staff/admin, and resolve handovers."
      />

      <div className="tabs">
        <button
          type="button"
          className={cn('tabs__btn', tab === 'claims' && 'tabs__btn--active')}
          onClick={() => setTab('claims')}
        >
          Claims
          <span className="tabs__count">{claims?.length ?? 0}</span>
        </button>
        <button
          type="button"
          className={cn('tabs__btn', tab === 'messages' && 'tabs__btn--active')}
          onClick={() => setTab('messages')}
        >
          Messages
          {unreadCount > 0 && <span className="tabs__count tabs__count--unread">{unreadCount}</span>}
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : tab === 'claims' ? (
        !claims ? (
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
              <div key={claim.id} className="claim-card-row-wrapper">
                <Link to={`/items/${claim.item_id}`} className="claim-card-row">
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
                    {claim.status === 'meeting_required' && claim.meeting_details && (
                      <span className="claim-card-row__reason">Meeting: {claim.meeting_details}</span>
                    )}
                  </span>
                </Link>

                <div className="claim-card-actions">
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    onClick={() => openChatForClaim(claim)}
                  >
                    <MessageSquare size={14} aria-hidden="true" />
                    Chat / Message Admin
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Messages tab */
        !messages ? (
          <LoadingScreen label="Loading messages…" />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            message="When you or an admin exchange messages regarding a claim, conversations will appear here."
          />
        ) : (
          <ul className="notification-list">
            {messages.map((m) => {
              const isMe = m.sender_id === profile?.id
              const otherName = isMe
                ? (m.recipient?.name || 'Admin / Staff')
                : (m.sender?.name || 'Admin / Staff')
              const isUnread = !isMe && !m.read

              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={cn(
                      'notification notification--chat-item',
                      isUnread && 'notification--unread',
                    )}
                    onClick={() => openChatForMessage(m)}
                  >
                    <span className="notification__icon">
                      <MessageSquare size={16} aria-hidden="true" />
                    </span>
                    <span className="notification__body">
                      <span className="notification__message">
                        <strong>{isMe ? `You → ${otherName}` : otherName}:</strong> {m.body}
                      </span>
                      <span className="notification__time">
                        {m.claim?.item?.title && (
                          <span className="notification__item-tag">
                            Regarding “{m.claim.item.title}” ·{' '}
                          </span>
                        )}
                        {timeAgo(m.created_at)}
                      </span>
                    </span>
                    <span className="chat-open-badge">
                      <Send size={12} aria-hidden="true" />
                      Reply
                    </span>
                    {isUnread && <span className="notification__dot" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )
      )}

      {(activeMessagingClaim || activeMessagingItem) && (
        <ClaimMessagingModal
          claim={activeMessagingClaim}
          item={activeMessagingItem}
          onClose={() => {
            setActiveMessagingClaim(null)
            setActiveMessagingItem(null)
          }}
          onMessageSent={() => void loadMessages()}
        />
      )}
    </div>
  )
}
