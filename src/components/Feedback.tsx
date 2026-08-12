import type { ReactNode } from 'react'
import { LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react'

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={`spin${className ? ` ${className}` : ''}`} aria-hidden="true" />
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="screen-state">
      <Spinner size={26} />
      <p className="screen-state__label">{label}</p>
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="screen-state">
      <span className="screen-state__icon screen-state__icon--error">
        <TriangleAlert size={22} />
      </span>
      <h3 className="screen-state__title">{title}</h3>
      {message && <p className="screen-state__label">{message}</p>}
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  message?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="screen-state">
      <span className="screen-state__icon">
        <Icon size={22} />
      </span>
      <h3 className="screen-state__title">{title}</h3>
      {message && <p className="screen-state__label">{message}</p>}
      {action}
    </div>
  )
}

