import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, FileText, MessageSquare } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { ClaimStatusBadge, TypeBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, MessageWithSender } from '../lib/types'
import { cn, timeAgo } from '../lib/utils'

const CLAIMS_SELECT =
  '*, item:items!claims_item_id_fkey(id, title, type, photo_url, status), claimant:profiles!claims_claimant_uid_fkey(name, email)'
const MESSAGES_SELECT = '*, sender:profiles!messages_sender_id_fkey(name, role)'

type Tab = 'claims' | 'messages'

export default function MyClaimsPage() {
  const { profile } = useAuth()
  const [claims, setClaims] = useState<ClaimWithRelations[] | null>(null)
  const [messages, setMessages] = useState<MessageWithSender[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('claims')

  const loadClaims = useCallback(async () => {
    if (!profile) return
    const { data, error: err } = await supabase
      .from('claims')
      .select(CLAIMS_SELECT)
      .eq('claimant_uid', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) {
      setError('Could not load your claims.')
      return
    }
    setClaims((data as ClaimWithRelations[] | null) ?? [])
  }, [profile])

  const loadMessages = useCallback(async () => {
    if (!profile) return
    const { data, error: err } = await supabase
      .from('messages')
      .select(MESSAGES_SELECT)
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) {
      setError('Could not load messages.')
      return
    }
    setMessages((data as MessageWithSender[] | null) ?? [])

    // Mark unread messages as read
    const unread = (data as MessageWithSender[] | null)?.filter((m) => !m.read) ?? []
    if (unread.length > 0) {
      await supabase
        .from('messages')
        .update({ read: true })
        .in(
          'id',
          unread.map((m) => m.id),
        )
    }
  }, [profile])

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
  }, [profile, loadClaims, loadMessages])

  async function markMessageRead(msg: MessageWithSender) {
    if (msg.read) return
    setMessages((prev) => prev?.map((m) => (m.id === msg.id ? { ...m, read: true } : m)) ?? null)
    await supabase.from('messages').update({ read: true }).eq('id', msg.id)
  }

  return (
    <div className="container page">
      <PageHeader
        title="My claims"
        subtitle="Track every item you have claimed, from submission to resolution."
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
          <span className="tabs__count">{messages?.filter((m) => !m.read).length ?? 0}</span>
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
              <Link key={claim.id} to={`/items/${claim.item_id}`} className="claim-card-row">
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
            message="When an admin contacts you about a claim, it will appear here."
          />
        ) : (
          <ul className="notification-list">
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={cn('notification', !m.read && 'notification--unread')}
                  onClick={() => void markMessageRead(m)}
                >
                  <span className="notification__icon">
                    <MessageSquare size={16} aria-hidden="true" />
                  </span>
                  <span className="notification__body">
                    <span className="notification__message">
                      <strong>{m.sender?.name ?? 'Admin'}:</strong> {m.body}
                    </span>
                    <span className="notification__time">{timeAgo(m.created_at)}</span>
                  </span>
                  {!m.read && <span className="notification__dot" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
