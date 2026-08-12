import type { ReactNode } from 'react'
import { Bell, GraduationCap, HandHeart, Package, Search } from 'lucide-react'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth">
      <aside className="auth__side">
        <div className="auth__brand">
          <span className="auth__logo">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span>Campus Lost &amp; Found</span>
        </div>

        <div className="auth__copy">
          <h1>Reuniting the campus, one item at a time.</h1>
          <p>
            Report what you lose, register what you find, and let the campus community help bring
            everything back home.
          </p>
          <ul className="auth__points">
            <li>
              <Search size={16} aria-hidden="true" /> Browse every found item on campus
            </li>
            <li>
              <Package size={16} aria-hidden="true" /> Report a lost item in under a minute
            </li>
            <li>
              <HandHeart size={16} aria-hidden="true" /> Claim belongings with proof of ownership
            </li>
            <li>
              <Bell size={16} aria-hidden="true" /> Get notified the moment something matches
            </li>
          </ul>
        </div>

        <p className="auth__foot">Systems Analysis &amp; Design · Course project</p>
      </aside>

      <main className="auth__main">
        <div className="auth__card">
          <h2>{title}</h2>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
          {footer}
        </div>
      </main>
    </div>
  )
}
