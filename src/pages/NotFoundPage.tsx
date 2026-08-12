import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="container page">
      <div className="screen-state">
        <span className="screen-state__icon">
          <Compass size={26} aria-hidden="true" />
        </span>
        <h3 className="screen-state__title">Page not found</h3>
        <p className="screen-state__label">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link className="btn btn--primary" to="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
