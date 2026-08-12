import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import FormField from '../components/FormField'
import PhotoUpload from '../components/PhotoUpload'
import { Spinner } from '../components/Feedback'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import type { ItemType } from '../lib/types'

interface FormState {
  title: string
  category: string
  description: string
  location: string
  date: string
  photoUrl: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

export default function ItemFormPage({ kind }: { kind: ItemType }) {
  const { profile } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const isFound = kind === 'found'
  const [form, setForm] = useState<FormState>({
    title: '',
    category: '',
    description: '',
    location: '',
    date: today(),
    photoUrl: null,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (form.title.trim().length < 3) next.title = 'Please give the item a short title.'
    if (!form.category) next.category = 'Choose a category.'
    if (form.description.trim().length < 10) next.description = 'Describe the item (at least 10 characters).'
    if (form.location.trim().length < 2) next.location = `Where was it ${isFound ? 'found' : 'lost'}?`
    if (!form.date) next.date = 'Choose a date.'
    if (isFound && !form.photoUrl) next.photoUrl = 'A photo is required when registering a found item.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!validate()) return

    setBusy(true)
    setSubmitError('')
    try {
      const { data, error } = await supabase
        .from('items')
        .insert({
          type: kind,
          title: form.title.trim(),
          category: form.category,
          description: form.description.trim(),
          location: form.location.trim(),
          date: form.date,
          photo_url: form.photoUrl,
          status: 'open',
          reported_by: profile.id,
        })
        .select('id')
        .single()
      if (error) throw error

      toast('success', isFound ? 'Found item registered — matching owners are notified.' : 'Lost item reported. We will let you know if it turns up.')
      navigate(`/items/${data.id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save the item. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container page">
      <PageHeader
        title={isFound ? 'Register a Found Item' : 'Report a Lost Item'}
        subtitle={
          isFound
            ? 'Help someone recover what they lost. Found listings require a photo.'
            : 'Tell us what you lost and we will watch for matches across campus.'
        }
      />

      <form className="card form-card" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {submitError && (
          <div className="alert alert--error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {submitError}
          </div>
        )}

        <div className="form-grid">
          <FormField label="Item title" htmlFor="title" required error={errors.title}>
            <input
              id="title"
              className="input"
              type="text"
              placeholder={isFound ? 'e.g. Black Acer laptop' : 'e.g. Navy blue backpack'}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </FormField>

          <FormField label="Category" htmlFor="category" required error={errors.category}>
            <select
              id="category"
              className="input"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              <option value="">Choose a category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Description" htmlFor="description" required error={errors.description}>
          <textarea
            id="description"
            className="input"
            rows={4}
            placeholder={isFound ? 'Where exactly was it, and what does it look like?' : 'Distinguishing features, contents, brand, color…'}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </FormField>

        <div className="form-grid">
          <FormField label={isFound ? 'Where was it found?' : 'Where was it lost?'} htmlFor="location" required error={errors.location}>
            <input
              id="location"
              className="input"
              type="text"
              placeholder="e.g. Main Library, 2nd floor"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </FormField>

          <FormField label={isFound ? 'When was it found?' : 'When was it lost?'} htmlFor="date" required error={errors.date}>
            <input
              id="date"
              className="input"
              type="date"
              max={today()}
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </FormField>
        </div>

        <FormField
          label="Photo"
          required={isFound}
          error={errors.photoUrl}
          hint={isFound ? 'A clear photo makes the item much easier to identify.' : 'Optional, but a photo helps people recognize it.'}
        >
          <PhotoUpload value={form.photoUrl} onChange={(url) => set('photoUrl', url)} required={isFound} />
        </FormField>

        <div className="form-actions">
          <Link className="btn btn--secondary" to="/dashboard">
            Cancel
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? <Spinner size={16} /> : isFound ? 'Register found item' : 'Report lost item'}
          </button>
        </div>
      </form>
    </div>
  )
}
