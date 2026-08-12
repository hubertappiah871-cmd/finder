import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface FormFieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

export default function FormField({ label, htmlFor, hint, error, required, children }: FormFieldProps) {
  return (
    <div className={cn('field', error && 'field--error')}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field__required"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && <p className="field__error">{error}</p>}
    </div>
  )
}
