import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleAlert, CircleCheck, Info, UserCog, UserRound } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { Spinner } from '../components/Feedback'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../lib/types'
import { cn } from '../lib/utils'

export default function SignUpPage() {
  const { session, signUp } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<Profile['role']>('user')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  function validate(): string {
    if (name.trim().length < 2) return 'Please enter your full name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address.'
    if (password.length < 6) return 'Password must be at least 6 characters.'
    if (password !== confirm) return 'Passwords do not match.'
    return ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const { needsEmailConfirmation } = await signUp(name.trim(), email.trim(), password, role)
      if (needsEmailConfirmation) {
        setNotice(
          'Account created — check your inbox to confirm your email before signing in. (For the demo, disable “Confirm email” in Supabase Auth settings.)',
        )
      }
      // Otherwise the session lands and the effect above redirects.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the campus lost &amp; found community in under a minute."
      footer={
        <p className="auth__switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form className="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {error && (
          <div className="alert alert--error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </div>
        )}
        {notice && (
          <div className="alert alert--info" role="status">
            <Info size={16} aria-hidden="true" />
            {notice}
          </div>
        )}

        <FormField label="Full name" htmlFor="name" required>
          <input
            id="name"
            className="input"
            type="text"
            autoComplete="name"
            placeholder="e.g. Jordan Reyes"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Email" htmlFor="signup-email" required>
          <input
            id="signup-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@campus.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>

        <div className="field-grid">
          <FormField label="Password" htmlFor="signup-password" required>
            <input
              id="signup-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>

          <FormField label="Confirm password" htmlFor="confirm" required>
            <input
              id="confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </FormField>
        </div>

        <fieldset className="role-picker">
          <legend className="field__label">Account type</legend>
          <label className={cn('role-option', role === 'user' && 'role-option--selected')}>
            <input
              type="radio"
              name="role"
              value="user"
              className="role-option__radio"
              checked={role === 'user'}
              onChange={() => setRole('user')}
            />
            <span className="role-option__icon">
              <UserRound size={18} aria-hidden="true" />
            </span>
            <span className="role-option__text">
              <strong>Student / Staff</strong>
              <small>Report lost items, register found items, and claim belongings.</small>
            </span>
            <span className="role-option__check">
              <CircleCheck size={18} aria-hidden="true" />
            </span>
          </label>

          <div className="role-option role-option--locked" title="Admin accounts are provisioned by the university">
            <span className="role-option__icon">
              <UserCog size={18} aria-hidden="true" />
            </span>
            <span className="role-option__text">
              <strong>Administrator</strong>
              <small>Provisioned by the university — contact the campus office.</small>
            </span>
            <CircleAlert size={16} className="role-option__lock" aria-hidden="true" />
          </div>
        </fieldset>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? <Spinner size={16} /> : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
