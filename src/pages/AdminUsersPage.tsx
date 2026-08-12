import { useEffect, useMemo, useState } from 'react'
import { Search, Shield, Trash2, Users, UserX } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, LoadingScreen } from '../components/Feedback'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { cn, formatDate, initials } from '../lib/utils'

export default function AdminUsersPage() {
  const { toast } = useToast()
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null)
  const [removing, setRemoving] = useState(false)

  async function load() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (err) {
      setError('Could not load users.')
      return
    }
    setProfiles((data as Profile[] | null) ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (!profiles) return []
    const query = q.trim().toLowerCase()
    if (!query) return profiles
    return profiles.filter(
      (p) => p.name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query),
    )
  }, [profiles, q])

  async function toggleActive(profile: Profile) {
    const { error: err } = await supabase
      .from('profiles')
      .update({ active: !profile.active })
      .eq('id', profile.id)
    if (err) {
      toast('error', 'Could not update the account.')
      return
    }
    toast('success', profile.active ? `${profile.name} deactivated.` : `${profile.name} reactivated.`)
    setProfiles((prev) => prev?.map((p) => (p.id === profile.id ? { ...p, active: !p.active } : p)) ?? null)
  }

  async function confirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    const { error: err } = await supabase.from('profiles').delete().eq('id', removeTarget.id)
    setRemoving(false)
    if (err) {
      toast('error', 'Could not remove the account.')
      return
    }
    toast('success', `${removeTarget.name} removed.`)
    setProfiles((prev) => prev?.filter((p) => p.id !== removeTarget.id) ?? null)
    setRemoveTarget(null)
  }

  return (
    <div className="container page">
      <PageHeader
        title="Manage users"
        subtitle="View registered accounts and deactivate or remove members who should not have access."
      />

      <div className="toolbar">
        <div className="search-bar search-bar--inline">
          <Search size={16} className="search-bar__icon" aria-hidden="true" />
          <input
            className="search-bar__input"
            type="search"
            placeholder="Search by name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !profiles ? (
        <LoadingScreen label="Loading users…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={profiles.length === 0 ? 'No users yet' : 'No users match your search'}
          message="Accounts created through sign-up appear here automatically."
        />
      ) : (
        <>
          <p className="results-count">
            {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th className="table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <div className="table-item">
                        <span className="table-item__avatar">{initials(profile.name)}</span>
                        <div>
                          <span className="table-item__title">{profile.name}</span>
                          <span className="table-item__sub">{profile.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={cn('badge', profile.role === 'admin' ? 'badge--type-lost' : 'badge--type-found')}>
                        <Shield size={12} aria-hidden="true" />
                        {profile.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td>
                      <span className={cn('badge', profile.active ? 'badge--green' : 'badge--red')}>
                        {profile.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>{formatDate(profile.created_at)}</td>
                    <td className="table__actions-col">
                      <div className="row row--sm">
                        <button
                          type="button"
                          className={cn('btn btn--small', profile.active ? 'btn--danger-ghost' : 'btn--secondary')}
                          onClick={() => void toggleActive(profile)}
                          disabled={profile.role === 'admin'}
                          title={profile.role === 'admin' ? 'Admin accounts cannot be deactivated' : profile.active ? 'Deactivate' : 'Reactivate'}
                        >
                          <UserX size={14} aria-hidden="true" />
                          {profile.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          title="Remove account"
                          aria-label={`Remove ${profile.name}`}
                          onClick={() => setRemoveTarget(profile)}
                          disabled={profile.role === 'admin'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove account"
        message={`Remove ${removeTarget?.name} (${removeTarget?.email})? Their claims and notifications are deleted, and they will no longer be able to sign in.`}
        confirmLabel="Remove account"
        busy={removing}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
