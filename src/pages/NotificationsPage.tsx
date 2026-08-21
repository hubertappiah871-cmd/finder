import { useCallback, useEffect, useState } from 'react'
import { CheckCheck, Inbox, Megaphone, MessageSquare, Send } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import ClaimMessagingModal from '../components/ClaimMessagingModal'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { ClaimWithRelations, ItemWithReporter, NotificationRow } from '../lib/types'
import { cn, timeAgo } from '../lib/utils'

interface ReplyContext {
  notification: NotificationRow
  item?: ItemWithReporter | null
  claim?: ClaimWithRelations | null
  recipientId?: string
}

export default function NotificationsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null)
  const [error, setError] = useState('')
  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null)
  const [loadingReply, setLoadingReply] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const { data, error: err } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) {
      setError('Could not load your notifications.')
      return
    }
    setNotifications((data as NotificationRow[] | null) ?? [])
  }, [profile])

  useEffect(() => {
    void load()

    if (!profile) return

    // Realtime subscription for instant notification updates
    const channel = supabase
      .channel(`page-notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, profile])

  async function markRead(n: NotificationRow) {
    if (n.read) return
    setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null)
    await supabase.from('notifications').update({ read: true }).eq('id', n.id)
  }

  async function markAllRead() {
    if (!profile || !notifications?.some((n) => !n.read)) return
    setNotifications((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null)
    const { error: err } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', profile.id)
      .eq('read', false)
    if (err) toast('error', 'Could not mark notifications as read.')
  }

  async function handleOpenReply(n: NotificationRow) {
    if (!profile) return
    await markRead(n)
    setLoadingReply(true)

    try {
      // 1. Extract item title in quotes if present (e.g. “MacBook Pro” or "Keys")
      const quoteMatch = n.message.match(/[“"']([^“”"']+)["”']/)
      const title = quoteMatch ? quoteMatch[1] : null

      let targetItem: ItemWithReporter | null = null
      let targetClaim: ClaimWithRelations | null = null
      let targetRecipientId: string | undefined

      // 2. Extract sender name if message format is "[Name] sent you a message" or "[Name] found your lost"
      const senderMatch = n.message.match(/^(.+?)\s+(?:sent you a message|found your lost)/i)
      if (senderMatch) {
        const senderName = senderMatch[1].trim()
        if (senderName && senderName.toLowerCase() !== 'someone' && senderName.toLowerCase() !== 'a user') {
          const { data: senderProf } = await supabase
            .from('profiles')
            .select('id, name, role')
            .ilike('name', senderName)
            .limit(1)
            .maybeSingle()
          if (senderProf) {
            targetRecipientId = senderProf.id
          }
        }
      }

      if (title) {
        const { data: itemRows } = await supabase
          .from('items')
          .select('*, reporter:profiles!items_reported_by_fkey(name, email)')
          .ilike('title', title)
          .limit(1)

        if (itemRows && itemRows.length > 0) {
          targetItem = itemRows[0] as ItemWithReporter

          // Check if there is a specific claim for this item involving this user
          const { data: claimRows } = await supabase
            .from('claims')
            .select('*, item:items!claims_item_id_fkey(*), claimant:profiles!claims_claimant_uid_fkey(*)')
            .eq('item_id', targetItem.id)
            .or(`claimant_uid.eq.${profile.id}${targetRecipientId ? `,claimant_uid.eq.${targetRecipientId}` : ''}`)
            .order('created_at', { ascending: false })
            .limit(1)

          if (claimRows && claimRows.length > 0) {
            targetClaim = claimRows[0] as unknown as ClaimWithRelations
          }
        }
      }

      // If sender was not in text, and targetItem exists, fallback to item reporter or admin
      if (!targetRecipientId && targetItem?.reported_by && targetItem.reported_by !== profile.id) {
        targetRecipientId = targetItem.reported_by
      }

      setReplyContext({
        notification: n,
        item: targetItem,
        claim: targetClaim,
        recipientId: targetRecipientId,
      })
    } catch (e) {
      console.error('Failed to resolve reply context:', e)
      setReplyContext({
        notification: n,
      })
    } finally {
      setLoadingReply(false)
    }
  }

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0

  return (
    <div className="container page">
      <PageHeader
        title="Notifications"
        subtitle="Updates on your items, messages, claims, and activity across campus."
        actions={
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
          >
            <CheckCheck size={15} aria-hidden="true" />
            Mark all as read
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !notifications ? (
        <LoadingScreen label="Loading notifications…" />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="You're all caught up"
          message="You will be notified when someone messages you, a claim is updated, or a matching item appears."
        />
      ) : (
        <ul className="notification-list">
          {notifications.map((n) => {
            const isMsg = n.message.toLowerCase().includes('message') || n.message.toLowerCase().includes('found your')
            return (
              <li key={n.id}>
                <div className={cn('notification notification--interactive', !n.read && 'notification--unread')}>
                  <span className="notification__icon">
                    {isMsg ? (
                      <MessageSquare size={16} aria-hidden="true" />
                    ) : (
                      <Megaphone size={16} aria-hidden="true" />
                    )}
                  </span>
                  <div className="notification__body" onClick={() => void markRead(n)}>
                    <span className="notification__message">{n.message}</span>
                    <span className="notification__time">{timeAgo(n.created_at)}</span>
                  </div>

                  <div className="notification__actions">
                    <button
                      type="button"
                      className="btn btn--small btn--secondary notif-reply-btn"
                      onClick={() => void handleOpenReply(n)}
                      disabled={loadingReply}
                      title="Reply and open chat conversation"
                    >
                      <Send size={12} aria-hidden="true" />
                      Reply / Chat
                    </button>
                  </div>

                  {!n.read && <span className="notification__dot" aria-label="Unread" />}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {replyContext && (
        <ClaimMessagingModal
          claim={replyContext.claim}
          item={replyContext.item}
          defaultRecipientId={replyContext.recipientId}
          onClose={() => setReplyContext(null)}
          onMessageSent={() => {
            toast('success', 'Reply sent successfully.')
          }}
        />
      )}
    </div>
  )
}
