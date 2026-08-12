import { Outlet } from 'react-router-dom'
import { LibraryBig } from 'lucide-react'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer__inner">
          <span className="footer__brand">
            <LibraryBig size={15} aria-hidden="true" />
            Campus Lost &amp; Found
          </span>
          <span>Systems Analysis &amp; Design · Course project</span>
        </div>
      </footer>
    </div>
  )
}
