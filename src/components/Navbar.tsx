import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Bell,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageSearch,
  Search,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cn, initials } from '../lib/utils'

const USER_LINKS = [
  { to: '/search', label: 'Search', icon: Search },
  { to: '/report-lost', label: 'Report Lost', icon: Package },
  { to: '/register-found', label: 'Register Found', icon: PackageSearch },
  { to: '/my-claims', label: 'My Claims', icon: ClipboardList },
]

const ADMIN_LINKS = [
  { to: '/admin/items', label: 'Manage Items', icon: Package },
  { to: '/admin/claims', label: 'Manage Claims', icon: ClipboardList },
  { to: '/admin/reports', label: 'Reports', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Manage Users', icon: Users },
]

function useUnreadCount(): number {
  const { profile } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!profile) return
    const uid = profile.id
    let cancelled = false
    async function fetchCount() {
      const { count: c } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('read', false)
      if (!cancelled) setCount(c ?? 0)
    }
    void fetchCount()
    const id = window.setInterval(() => void fetchCount(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [profile])

  return count
}

export default function Navbar() {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const unread = useUnreadCount()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  if (!profile) return null

  const links = profile.role === 'admin' ? ADMIN_LINKS : USER_LINKS

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Link to="/dashboard" className="navbar__brand">
          <span className="navbar__logo">
            <GraduationCap size={20} aria-hidden="true" />
          </span>
          <span className="navbar__wordmark">
            <span className="navbar__name">Campus Lost &amp; Found</span>
            <span className="navbar__tagline">Found &amp; Returned</span>
          </span>
        </Link>

        <nav className={cn('navbar__links', menuOpen && 'navbar__links--open')} aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/search'}
              className={({ isActive }) => cn('navbar__link', isActive && 'navbar__link--active')}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="navbar__actions">
          <Link
            to="/notifications"
            className="navbar__bell"
            aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
            title="Notifications"
          >
            <Bell size={19} aria-hidden="true" />
            {unread > 0 && <span className="navbar__badge">{unread > 9 ? '9+' : unread}</span>}
          </Link>

          <div className="navbar__user">
            <span className="navbar__avatar">{initials(profile.name)}</span>
            <span className="navbar__user-meta">
              <span className="navbar__user-name">{profile.name}</span>
              <span className="navbar__user-role">{profile.role === 'admin' ? 'Administrator' : 'Student'}</span>
            </span>
          </div>

          <button
            type="button"
            className="navbar__icon-btn"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="navbar__icon-btn navbar__menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}
