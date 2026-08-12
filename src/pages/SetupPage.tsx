import { GraduationCap } from 'lucide-react'

const STEPS = [
  <>
    Create a free project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>.
  </>,
  <>
    Open the <strong>SQL Editor</strong> and run the setup script: <code>supabase/schema.sql</code> (creates tables, security policies, demo accounts, and sample data).
  </>,
  <>
    Go to    <strong>Project Settings → API</strong> and copy the <strong>Project URL</strong> and <strong>publishable key</strong>.
  </>,
  <>
    Paste both values into <code>.env</code> as <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
  </>,
  <>
    Restart the dev server with <code>npm run dev</code> — this screen will disappear.
  </>,
]

export default function SetupPage() {
  return (
    <div className="setup">
      <div className="setup__card">
        <div className="setup__brand">
          <span className="setup__logo">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span>Campus Lost &amp; Found</span>
        </div>

        <h1>Connect your Supabase project</h1>
        <p className="setup__intro">
          This app reads your Supabase credentials from a <code>.env</code> file. Follow these steps
          to finish the setup:
        </p>

        <ol className="setup__steps">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        <div className="setup__hint">
          Seeded demo accounts after setup: <strong>admin@campus.edu / admin123</strong> (Admin) and{' '}
          <strong>demo@campus.edu / demo123</strong> (Student).
        </div>
      </div>
    </div>
  )
}
