import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, MessageSquare, Phone, Send, User, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, MessageWithSender } from '../lib/types'
import { cn, initials, timeAgo } from '../lib/utils'
import { Spinner } from './Feedback'

interface ClaimMessagingModalProps {
  claim: ClaimWithRelations
  onClose: () => void
  onMessageSent?: () => void
  defaultRecipientId?: string
}

const MESSAGES_SELECT =
  '*, sender:profiles!messages_sender_id_fkey(name, role), recipient:profiles!messages_recipient_id_fkey(name, role)'

export default function ClaimMessagingModal({
  claim,
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
        return
      }

      // 2. If current user is Admin -> recipient is the claimant
      if (profile.role === 'admin') {
        setResolvedRecipientId(claim.claimant_uid)
        setResolvedRecipientName(claim.claimant?.name ?? 'Claimant')
        return
      }

      // 3. If current user is Claimant:
      // If there's an existing message from someone else, message them back
      const otherMsg = [...currentMessages]
        .reverse()
        .find((m) => m.sender_id !== profile.id)
      if (otherMsg) {
        setResolvedRecipientId(otherMsg.sender_id)
        setResolvedRecipientName(otherMsg.sender?.name ?? 'Admin / Staff')
        return
      }

      // 4. Otherwise, route message to an active admin
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
      } else if (claim.item?.reported_by && claim.item.reported_by !== profile.id) {
        setResolvedRecipientId(claim.item.reported_by)
        setResolvedRecipientName('Item Reporter')
      }
    },
    [profile, defaultRecipientId, claim],
  )

  const loadMessages = useCallback(
    async (showLoading = false) => {
      if (!claim.id || !profile) return
      if (showLoading) setLoading(true)

      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGES_SELECT)
        .eq('claim_id', claim.id)
        .order('created_at', { ascending: true })
        .limit(100)

      if (showLoading) setLoading(false)

      if (error) {
        console.error('Failed to load messages:', error.message)
        return
      }

      const msgs = (data as MessageWithSender[] | null) ?? []
      setMessages(msgs)
      void resolveRecipient(msgs)

      // Mark unread incoming messages as read
      const unreadIds = msgs
        .filter((m) => m.recipient_id === profile.id && !m.read)
        .map((m) => m.id)

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .in('id', unreadIds)
      }
    },
    [claim.id, profile, resolveRecipient],
  )

  useEffect(() => {
    void loadMessages(true)

    // Realtime channel for instantaneous chat delivery
    const channel = supabase
      .channel(`claim-messages-${claim.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `claim_id=eq.${claim.id}`,
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
  }, [claim.id, loadMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSendMessage() {
    const text = body.trim()
    if (!text || !profile || !claim.id || sending) return

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
    const { error } = await supabase.from('messages').insert({
      claim_id: claim.id,
      sender_id: profile.id,
      recipient_id: targetRecipient,
      body: text,
    })
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
    if (!profile || !claim.id || sharingContact) return
    setSharingContact(true)

    const contactText = `My contact details: ${profile.name} (${profile.email}). Please use this to coordinate regarding this claim.`
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

    const { error } = await supabase.from('messages').insert({
      claim_id: claim.id,
      sender_id: profile.id,
      recipient_id: targetRecipient,
      body: contactText,
    })
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
    profile?.role === 'admin'
      ? claim.claimant?.name || 'Claimant'
      : resolvedRecipientName || 'Admin / Campus Team'

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
                Regarding item: <strong>{claim.item?.title ?? 'Claimed Item'}</strong>
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
                Start the conversation regarding this claim. All messages are securely delivered
                in-app.
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
