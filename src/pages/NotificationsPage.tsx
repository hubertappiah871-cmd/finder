import { useCallback, useEffect, useState } from 'react'
import { CheckCheck, Inbox, Megaphone } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { NotificationRow } from '../lib/types'
import { cn, timeAgo } from '../lib/utils'

export default function NotificationsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null)
  const [error, setError] = useState('')

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
    // Keep the inbox fresh while it is open (matches the navbar badge poll).
    const id = window.setInterval(() => void load(), 15_000)
    return () => window.clearInterval(id)
  }, [load])

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

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0

  return (
    <div className="container page">
      <PageHeader
        title="Notifications"
        subtitle="Updates on your items, claims, and activity across campus."
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
          message="You will be notified when a claim is decided, a matching item appears, or an admin takes action."
        />
      ) : (
        <ul className="notification-list">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('notification', !n.read && 'notification--unread')}
                onClick={() => void markRead(n)}
              >
                <span className="notification__icon">
                  <Megaphone size={16} aria-hidden="true" />
                </span>
                <span className="notification__body">
                  <span className="notification__message">{n.message}</span>
                  <span className="notification__time">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read && <span className="notification__dot" aria-label="Unread" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
