import { useRef, useState } from 'react'
import { CloudUpload, ImagePlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Spinner } from './Feedback'

interface PhotoUploadProps {
  value: string | null
  onChange: (url: string | null) => void
  required?: boolean
}

export default function PhotoUpload({ value, onChange, required }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const { profile } = useAuth()
  const { toast } = useToast()

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('error', 'Please choose an image file (JPG, PNG, WEBP…).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('error', 'The image must be smaller than 5 MB.')
      return
    }
    if (!profile) {
      toast('error', 'You need to be signed in to upload a photo.')
      return
    }

    setUploading(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const path = `${profile.id}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('item-photos').upload(path, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('item-photos').getPublicUrl(path)
      onChange(data.publicUrl)
      toast('success', 'Photo uploaded.')
    } catch {
      toast('error', 'Photo upload failed — check your storage permissions and try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="photo-upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {value ? (
        <div className="photo-upload__preview">
          <img src={value} alt="Item photo preview" />
          <button
            type="button"
            className="photo-upload__remove"
            title="Remove photo"
            onClick={() => onChange(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`photo-upload__dropzone${dragOver ? ' photo-upload__dropzone--over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFile(e.dataTransfer.files?.[0])
          }}
        >
          {uploading ? (
            <Spinner size={26} />
          ) : dragOver ? (
            <CloudUpload size={26} />
          ) : (
            <ImagePlus size={26} />
          )}
          <span className="photo-upload__title">
            {uploading ? 'Uploading…' : dragOver ? 'Drop the image here' : required ? 'Add a photo (required)' : 'Add a photo (optional)'}
          </span>
          <span className="photo-upload__hint">Click to browse or drag &amp; drop · JPG, PNG, WEBP · max 5 MB</span>
        </button>
      )}
    </div>
  )
}
