import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface ConversationThread {
  id: string
  lastMessage: MessageWithSender
  unreadCount: number
  otherUserId: string
  otherUserName: string
  otherUserRole?: string
  itemTitle: string
  claim?: ClaimWithRelations | null
  item?: ItemWithReporter | null
}

export default function MyClaimsPage() {
  const { profile } = useAuth()
  const [claims, setClaims] = useState<ClaimWithRelations[] | null>(null)
  const [messages, setMessages] = useState<MessageWithSender[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('claims')
  const [activeMessagingClaim, setActiveMessagingClaim] = useState<ClaimWithRelations | null>(null)
  const [activeMessagingItem, setActiveMessagingItem] = useState<ItemWithReporter | null>(null)
  const [activeRecipientId, setActiveRecipientId] = useState<string | undefined>(undefined)

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

  // Group individual message rows into distinct conversation threads
  const threads = useMemo<ConversationThread[]>(() => {
    if (!messages || !profile) return []

    const map = new Map<string, ConversationThread>()

    for (const m of messages) {
      const isMe = m.sender_id === profile.id
      const otherUserId = isMe ? m.recipient_id : m.sender_id
      const otherUserName = isMe
        ? m.recipient?.name || (m.recipient?.role === 'admin' ? 'Campus Admin' : 'User')
        : m.sender?.name || (m.sender?.role === 'admin' ? 'Campus Admin' : 'User')
      const otherUserRole = isMe ? m.recipient?.role : m.sender?.role

      const threadKey = m.claim_id
        ? `claim_${m.claim_id}`
        : m.item_id
        ? `item_${m.item_id}_${otherUserId}`
        : `direct_${otherUserId}`

      const itemTitle = m.claim?.item?.title || m.item?.title || 'Item'

      if (!map.has(threadKey)) {
        map.set(threadKey, {
          id: threadKey,
          lastMessage: m,
          unreadCount: !isMe && !m.read ? 1 : 0,
          otherUserId,
          otherUserName,
          otherUserRole,
          itemTitle,
          claim: (m.claim as ClaimWithRelations) || null,
          item: (m.item as ItemWithReporter) || null,
        })
      } else {
        const entry = map.get(threadKey)!
        if (!isMe && !m.read) {
          entry.unreadCount += 1
        }
      }
    }

    return Array.from(map.values())
  }, [messages, profile])

  function openChatForClaim(claim: ClaimWithRelations) {
    setActiveMessagingItem(null)
    setActiveRecipientId(profile?.role === 'admin' ? claim.claimant_uid : undefined)
    setActiveMessagingClaim(claim)
  }

  function openChatForThread(thread: ConversationThread) {
    setActiveRecipientId(thread.otherUserId)
    if (thread.claim) {
      setActiveMessagingItem(null)
      setActiveMessagingClaim(thread.claim)
      return
    }
    if (thread.item || thread.lastMessage.item_id) {
      setActiveMessagingClaim(null)
      setActiveMessagingItem(
        thread.item || {
          id: thread.lastMessage.item_id || '',
          title: thread.itemTitle,
          type: 'found',
          category: 'Other',
          location: '',
          date: '',
          description: '',
          photo_url: null,
          status: 'open',
          reported_by: thread.otherUserId,
          created_at: thread.lastMessage.created_at,
          reporter: null,
        },
      )
      return
    }
    const matched = claims?.find((c) => c.id === thread.lastMessage.claim_id)
    if (matched) {
      setActiveMessagingItem(null)
      setActiveMessagingClaim(matched)
    } else {
      setActiveMessagingItem(null)
      setActiveMessagingClaim({
        id: thread.lastMessage.claim_id || '',
        item_id: '',
        claimant_uid: profile?.id ?? '',
        owner_name: '',
        contact_info: '',
        verification_details: '',
        status: 'pending',
        rejection_reason: null,
        admin_notes: null,
        meeting_details: null,
        created_at: thread.lastMessage.created_at,
        item: null,
        claimant: { name: profile?.name ?? 'Me', email: profile?.email ?? '' },
      })
    }
  }

  return (
    <div className="container page">
      <PageHeader
        title="My claims &amp; messages"
        subtitle="Track verification status, view admin feedback, and coordinate handovers in real time."
      />

      {/* Tabs */}
      <div className="tabs" role="tablist" style={{ marginBottom: 'var(--sp-lg)' }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'claims'}
          className={cn('tabs__btn', tab === 'claims' && 'tabs__btn--active')}
          onClick={() => setTab('claims')}
        >
          <FileText size={15} aria-hidden="true" />
          My Claims ({claims?.length ?? 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'messages'}
          className={cn('tabs__btn', tab === 'messages' && 'tabs__btn--active')}
          onClick={() => setTab('messages')}
        >
          <MessageSquare size={15} aria-hidden="true" />
          Conversations ({threads.length})
          {unreadCount > 0 && <span className="filter-count">{unreadCount}</span>}
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void loadClaims()} />
      ) : tab === 'claims' ? (
        !claims ? (
          <LoadingScreen label="Loading your claims…" />
        ) : claims.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No claims yet"
            message="When you submit a claim on a found item, it will show up here along with review updates."
            action={
              <Link to="/search" className="btn btn--primary">
                Search found items
              </Link>
            }
          />
        ) : (
          <div className="claim-cards">
            {claims.map((claim) => (
              <div key={claim.id} className="card claim-card-row">
                {claim.item?.photo_url ? (
                  <img
                    src={claim.item.photo_url}
                    alt={claim.item.title}
                    className="claim-card-row__thumb"
                  />
                ) : (
                  <div className="claim-card-row__thumb claim-card-row__thumb--fallback">
                    {claim.item?.type ? (
                      <TypeBadge type={claim.item.type} />
                    ) : (
                      <FileText size={18} aria-hidden="true" />
                    )}
                  </div>
                )}

                <div className="claim-card-row__content">
                  <div className="claim-card-row__head">
                    <h3 className="claim-card-row__title">
                      {claim.item ? (
                        <Link to={`/item/${claim.item.id}`}>{claim.item.title}</Link>
                      ) : (
                        'Item no longer available'
                      )}
                    </h3>
                    <ClaimStatusBadge status={claim.status} />
                  </div>

                  <p className="claim-card-row__details">
                    Submitted {timeAgo(claim.created_at)}
                    {claim.owner_name ? ` · Name on claim: ${claim.owner_name}` : ''}
                  </p>

                  <blockquote className="claim-card-row__quote">
                    "{claim.verification_details}"
                  </blockquote>

                  {claim.status === 'rejected' && claim.rejection_reason && (
                    <div className="alert alert--error" style={{ marginTop: 'var(--sp-sm)' }}>
                      <strong>Reason for rejection:</strong>
                      <p>{claim.rejection_reason}</p>
                    </div>
                  )}

                  {claim.status === 'meeting_required' && (
                    <div className="alert alert--info" style={{ marginTop: 'var(--sp-sm)' }}>
                      <strong>Action required:</strong>
                      <p>
                        {claim.meeting_details ||
                          'Please visit the Campus Security office or Lost & Found desk to verify this item in person.'}
                      </p>
                    </div>
                  )}

                  {claim.status === 'approved' && (
                    <div className="alert alert--success" style={{ marginTop: 'var(--sp-sm)' }}>
                      <strong>Claim Approved!</strong>
                      <p>
                        Your claim has been verified. You can message the staff below or visit the
                        Lost &amp; Found office with your student ID to collect your item.
                      </p>
                    </div>
                  )}
                </div>

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
          <LoadingScreen label="Loading conversations…" />
        ) : threads.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            message="When you or an admin exchange messages regarding an item or claim, conversations will appear here."
          />
        ) : (
          <ul className="notification-list">
            {threads.map((thread) => {
              const isUnread = thread.unreadCount > 0
              const isMe = thread.lastMessage.sender_id === profile?.id

              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    className={cn(
                      'notification notification--chat-item',
                      isUnread && 'notification--unread',
                    )}
                    onClick={() => openChatForThread(thread)}
                  >
                    <span className="notification__icon">
                      <MessageSquare size={16} aria-hidden="true" />
                    </span>
                    <span className="notification__body">
                      <span className="notification__message">
                        <strong>
                          {thread.otherUserName}
                          {thread.otherUserRole === 'admin' ? ' (Admin)' : ''}:
                        </strong>{' '}
                        {isMe && <span className="muted">You: </span>}
                        {thread.lastMessage.body}
                      </span>
                      <span className="notification__time">
                        <span className="notification__item-tag">
                          Regarding “{thread.itemTitle}” ·{' '}
                        </span>
                        {timeAgo(thread.lastMessage.created_at)}
                      </span>
                    </span>
                    <span className="chat-open-badge">
                      <Send size={12} aria-hidden="true" />
                      Open Chat
                    </span>
                    {isUnread && (
                      <span className="filter-count" style={{ marginLeft: '6px' }}>
                        {thread.unreadCount}
                      </span>
                    )}
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
          defaultRecipientId={activeRecipientId}
          onClose={() => {
            setActiveMessagingClaim(null)
            setActiveMessagingItem(null)
            setActiveRecipientId(undefined)
          }}
          onMessageSent={() => void loadMessages()}
        />
      )}
    </div>
  )
}
