import { Link, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { CircleX, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { LoadingScreen } from './Feedback'

function DeactivatedScreen() {
  const { signOut } = useAuth()
  return (
    <div className="screen-state">
      <span className="screen-state__icon screen-state__icon--error">
        <CircleX size={22} aria-hidden="true" />
      </span>
      <h3 className="screen-state__title">Account deactivated</h3>
      <p className="screen-state__label">
        This account has been deactivated by an administrator. Please contact the campus office if
        you believe this is a mistake.
      </p>
      <button type="button" className="btn btn--secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}

function MissingProfileScreen() {
  const { signOut } = useAuth()
  return (
    <div className="screen-state">
      <span className="screen-state__icon screen-state__icon--error">
        <CircleX size={22} aria-hidden="true" />
      </span>
      <h3 className="screen-state__title">Account not found</h3>
      <p className="screen-state__label">
        We could not find a profile for this sign-in. The account may have been removed by an
        administrator. Please contact the campus office if you believe this is a mistake.
      </p>
      <button type="button" className="btn btn--secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!profile) return <MissingProfileScreen />
  if (!profile.active) return <DeactivatedScreen />
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile } = useAuth()

  if (profile && profile.role !== 'admin') {
    return (
      <div className="screen-state">
        <span className="screen-state__icon">
          <Shield size={22} aria-hidden="true" />
        </span>
        <h3 className="screen-state__title">Restricted area</h3>
        <p className="screen-state__label">This page is only available to administrators.</p>
        <Link className="btn btn--primary" to="/dashboard">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return <RequireAuth>{children}</RequireAuth>
}
