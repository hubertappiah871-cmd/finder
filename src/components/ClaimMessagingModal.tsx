import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, MessageSquare, Phone, Send, User, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, ItemWithReporter, MessageWithSender } from '../lib/types'
import { cn, initials, timeAgo } from '../lib/utils'
import { Spinner } from './Feedback'

interface ClaimMessagingModalProps {
  claim?: ClaimWithRelations | null
  item?: ItemWithReporter | null
  onClose: () => void
  onMessageSent?: () => void
  defaultRecipientId?: string
}

const MESSAGES_SELECT =
  '*, sender:profiles!messages_sender_id_fkey(name, role), recipient:profiles!messages_recipient_id_fkey(name, role)'

export default function ClaimMessagingModal({
  claim,
  item,
  onClose,
  onMessageSent,
  defaultRecipientId,
}: ClaimMessagingModalProps) {
  const { profile } = useAuth()
  const { toast } = useToast()

  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sharingContact, setSharingContact] = useState(false)
  const [resolvedRecipientId, setResolvedRecipientId] = useState<string | null>(
    defaultRecipientId ?? null,
  )
  const [resolvedRecipientName, setResolvedRecipientName] = useState<string>('')

  const threadEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const itemTitle = claim?.item?.title || item?.title || 'Item'
  const claimId = claim?.id ?? null
  const itemId = item?.id ?? claim?.item?.id ?? claim?.item_id ?? null

  // Reset conversation state when switching to a different claim, item, or recipient
  useEffect(() => {
    setMessages([])
    setResolvedRecipientId(defaultRecipientId ?? null)
    setResolvedRecipientName('')
  }, [claimId, itemId, defaultRecipientId])

  const scrollToBottom = useCallback(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Resolve who the current user is messaging
  const resolveRecipient = useCallback(
    async (currentMessages: MessageWithSender[]) => {
      if (!profile) return

      // 1. If explicit default recipient was passed and isn't current user
      if (defaultRecipientId && defaultRecipientId !== profile.id) {
        setResolvedRecipientId(defaultRecipientId)
        const { data: recProf } = await supabase
          .from('profiles')
          .select('name, role')
          .eq('id', defaultRecipientId)
          .maybeSingle()
        if (recProf) {
          setResolvedRecipientName(recProf.name || (recProf.role === 'admin' ? 'Campus Admin' : 'User'))
        }
        return
      }

      // 2. If current user is Admin:
      if (profile.role === 'admin') {
        if (claim?.claimant_uid && claim.claimant_uid !== profile.id) {
          setResolvedRecipientId(claim.claimant_uid)
          setResolvedRecipientName(claim.claimant?.name ?? 'Claimant')
          return
        }
        if (item?.reported_by && item.reported_by !== profile.id) {
          setResolvedRecipientId(item.reported_by)
          setResolvedRecipientName(item.reporter?.name ?? 'Item Finder / Reporter')
          return
        }
      }

      // 3. If there's an existing message from someone else in this specific thread, message them back
      const otherMsg = [...currentMessages]
        .reverse()
        .find((m) => m.sender_id !== profile.id)
      if (otherMsg) {
        setResolvedRecipientId(otherMsg.sender_id)
        setResolvedRecipientName(otherMsg.sender?.name ?? (otherMsg.sender?.role === 'admin' ? 'Campus Admin' : 'User'))
        return
      }

      // 4. If current user is a Finder or Claimant messaging an Admin:
      const { data: adminData } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'admin')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (adminData) {
        setResolvedRecipientId(adminData.id)
        setResolvedRecipientName(adminData.name || 'Campus Admin')
      } else if (item?.reported_by && item.reported_by !== profile.id) {
        setResolvedRecipientId(item.reported_by)
        setResolvedRecipientName(item.reporter?.name || 'Item Finder')
      }
    },
    [profile, defaultRecipientId, claim, item],
  )

  const loadMessages = useCallback(
    async (showLoading = false) => {
      if (!profile || (!claimId && !itemId)) return
      if (showLoading) setLoading(true)

      let query = supabase.from('messages').select(MESSAGES_SELECT)

      if (claimId) {
        query = query.eq('claim_id', claimId)
      } else if (itemId) {
        query = query.eq('item_id', itemId)
      }

      const { data, error } = await query
        .order('created_at', { ascending: true })
        .limit(100)

      if (showLoading) setLoading(false)

      if (error) {
        console.error('Failed to load messages:', error.message)
        return
      }

      const msgs = (data as MessageWithSender[] | null) ?? []

      // Strictly isolate conversation between current user and target recipient
      let filteredMsgs = msgs
      const otherUserId = defaultRecipientId || resolvedRecipientId
      if (!claimId && itemId && otherUserId) {
        filteredMsgs = msgs.filter(
          (m) =>
            (m.sender_id === profile.id && m.recipient_id === otherUserId) ||
            (m.sender_id === otherUserId && m.recipient_id === profile.id),
        )
      } else if (!claimId && itemId && profile.role !== 'admin') {
        filteredMsgs = msgs.filter(
          (m) => m.sender_id === profile.id || m.recipient_id === profile.id,
        )
      }

      setMessages(filteredMsgs)
      void resolveRecipient(filteredMsgs)

      // Mark unread incoming messages as read
      const unreadIds = filteredMsgs
        .filter((m) => m.recipient_id === profile.id && !m.read)
        .map((m) => m.id)

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .in('id', unreadIds)
      }
    },
    [claimId, itemId, profile, resolveRecipient, defaultRecipientId, resolvedRecipientId],
  )

  useEffect(() => {
    void loadMessages(true)

    const channelFilter = claimId ? `claim_id=eq.${claimId}` : `item_id=eq.${itemId}`
    const channelName = claimId ? `claim-messages-${claimId}` : `item-messages-${itemId}`

    // Realtime channel for instantaneous chat delivery
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: channelFilter,
        },
        () => {
          void loadMessages(false)
        },
      )
      .subscribe()

    // Fallback heartbeat poll
    const interval = setInterval(() => {
      void loadMessages(false)
    }, 8000)

    return () => {
      void supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [claimId, itemId, loadMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSendMessage() {
    const text = body.trim()
    if (!text || !profile || (!claimId && !itemId) || sending) return

    let targetRecipient = resolvedRecipientId

    // If still unresolved, fetch active admin
    if (!targetRecipient) {
      const { data: admin } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      targetRecipient = admin?.id ?? null
    }

    if (!targetRecipient) {
      toast('error', 'Could not find a recipient for this message.')
      return
    }

    setSending(true)
    const payload: {
      claim_id?: string | null
      item_id?: string | null
      sender_id: string
      recipient_id: string
      body: string
    } = {
      sender_id: profile.id,
      recipient_id: targetRecipient,
      body: text,
    }

    if (claimId) {
      payload.claim_id = claimId
    } else if (itemId) {
      payload.item_id = itemId
    }

    const { error } = await supabase.from('messages').insert(payload)
    setSending(false)

    if (error) {
      console.error('Failed to send message:', error.message)
      toast('error', `Could not send message: ${error.message}`)
      return
    }

    setBody('')
    toast('success', 'Message sent.')
    onMessageSent?.()
    await loadMessages(false)
    setTimeout(scrollToBottom, 50)
  }

  async function handleShareContact() {
    if (!profile || (!claimId && !itemId) || sharingContact) return
    setSharingContact(true)

    const contactText = `My contact details: ${profile.name} (${profile.email}). Please use this to coordinate regarding this item.`
    let targetRecipient = resolvedRecipientId

    if (!targetRecipient) {
      const { data: admin } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      targetRecipient = admin?.id ?? null
    }

    if (!targetRecipient) {
      setSharingContact(false)
      toast('error', 'Could not find recipient.')
      return
    }

    const payload: {
      claim_id?: string | null
      item_id?: string | null
      sender_id: string
      recipient_id: string
      body: string
    } = {
      sender_id: profile.id,
      recipient_id: targetRecipient,
      body: contactText,
    }

    if (claimId) {
      payload.claim_id = claimId
    } else if (itemId) {
      payload.item_id = itemId
    }

    const { error } = await supabase.from('messages').insert(payload)
    setSharingContact(false)

    if (error) {
      toast('error', `Failed to share contact: ${error.message}`)
      return
    }

    toast('success', 'Contact info shared in chat!')
    onMessageSent?.()
    await loadMessages(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendMessage()
    }
  }

  const otherPartyTitle =
    resolvedRecipientName ||
    (profile?.role === 'admin'
      ? (claim?.claimant?.name || item?.reporter?.name || 'User')
      : 'Campus Admin')

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div
        className="modal chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-modal-title"
      >
        <div className="chat-modal__header">
          <div className="chat-modal__header-info">
            <span className="chat-modal__avatar">
              <MessageSquare size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 id="chat-modal-title" className="chat-modal__title">
                Conversation with {otherPartyTitle}
              </h3>
              <p className="chat-modal__subtitle">
                Regarding item: <strong>{itemTitle}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close conversation"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="chat-modal__body">
          {loading ? (
            <div className="chat-modal__loading">
              <Spinner size={24} />
              <span>Loading messages…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty-state">
              <span className="chat-empty-state__icon">
                <User size={24} aria-hidden="true" />
              </span>
              <h4>No messages yet</h4>
              <p>
                Send a message to {otherPartyTitle} regarding this item. All messages
                are delivered in real time.
              </p>
            </div>
          ) : (
            <div className="chat-stream">
              {messages.map((m) => {
                const isMe = m.sender_id === profile?.id
                const senderRole = m.sender?.role === 'admin' ? 'Admin' : ''

                return (
                  <div
                    key={m.id}
                    className={cn('chat-row', isMe ? 'chat-row--me' : 'chat-row--them')}
                  >
                    {!isMe && (
                      <span className="chat-avatar" title={m.sender?.name ?? 'User'}>
                        {initials(m.sender?.name ?? '?')}
                      </span>
                    )}

                    <div className={cn('chat-bubble', isMe ? 'chat-bubble--me' : 'chat-bubble--them')}>
                      <div className="chat-bubble__meta">
                        <span className="chat-bubble__sender">
                          {isMe ? 'You' : m.sender?.name ?? 'User'}
                        </span>
                        {senderRole && !isMe && (
                          <span className="chat-bubble__role-badge">{senderRole}</span>
                        )}
                        <span className="chat-bubble__time">{timeAgo(m.created_at)}</span>
                      </div>
                      <div className="chat-bubble__text">{m.body}</div>
                      {isMe && (
                        <span className="chat-bubble__status">
                          {m.read ? (
                            <span className="chat-read-badge" title="Read by recipient">
                              <Check size={12} aria-hidden="true" /> Read
                            </span>
                          ) : (
                            <span className="chat-sent-badge" title="Sent">
                              Sent
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={threadEndRef} />
            </div>
          )}
        </div>

        <div className="chat-modal__footer">
          <div className="chat-quick-actions">
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => void handleShareContact()}
              disabled={sharingContact || sending}
            >
              <Phone size={13} aria-hidden="true" />
              Share my contact info
            </button>
          </div>

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSendMessage()
            }}
          >
            <textarea
              ref={inputRef}
              className="input chat-textarea"
              rows={2}
              placeholder={`Write a message to ${otherPartyTitle}… (Press Enter to send)`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              type="submit"
              className="btn btn--primary chat-send-btn"
              disabled={sending || !body.trim()}
              title="Send message"
            >
              {sending ? <Spinner size={16} /> : <Send size={16} aria-hidden="true" />}
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
