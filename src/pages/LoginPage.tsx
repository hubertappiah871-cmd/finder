import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Info, TriangleAlert } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { Spinner } from '../components/Feedback'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  useEffect(() => {
    if (session) navigate(from, { replace: true })
  }, [session, navigate, from])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      // The effect above redirects once the session lands.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Campus Lost &amp; Found account."
      footer={
        <p className="auth__switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      }
    >
      <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {error && (
          <div className="alert alert--error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        <FormField label="Email" htmlFor="email" required>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@campus.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? <Spinner size={16} /> : 'Sign in'}
        </button>
      </form>

      <div className="alert alert--info">
        <Info size={16} aria-hidden="true" />
        <div>
          <strong>Demo accounts</strong>
          <p>Admin — admin@campus.edu · admin123</p>
          <p>Student — demo@campus.edu · demo123</p>
        </div>
      </div>
    </AuthLayout>
  )
}
