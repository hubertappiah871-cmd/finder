import { useEffect, useRef } from 'react'
import { cn } from '../lib/utils'
import { Spinner } from './Feedback'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  inputLabel?: string
  inputValue?: string
  inputPlaceholder?: string
  onInputChange?: (value: string) => void
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  inputLabel,
  inputValue,
  inputPlaceholder,
  onInputChange,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const focus = inputLabel ? document.getElementById('dialog-input') : primaryRef.current
    focus?.focus()
  }, [open, inputLabel])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title" className="modal__title">
          {title}
        </h3>
        <p className="modal__message">{message}</p>

        {inputLabel && (
          <div className="field">
            <label className="field__label" htmlFor="dialog-input">
              {inputLabel}
            </label>
            <textarea
              id="dialog-input"
              className="input"
              rows={3}
              placeholder={inputPlaceholder}
              value={inputValue ?? ''}
              onChange={(e) => onInputChange?.(e.target.value)}
            />
          </div>
        )}

        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={primaryRef}
            type="button"
            className={cn('btn', tone === 'danger' ? 'btn--danger' : 'btn--primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Spinner size={16} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
