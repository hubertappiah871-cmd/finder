import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * True once real credentials are in .env. Until then the app shows a
 * setup screen instead of routing.
 */
export const isSupabaseConfigured = Boolean(
  url && publishableKey && !url.includes('PASTE') && !publishableKey.includes('PASTE'),
)

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  publishableKey ?? 'placeholder-publishable-key',
)
