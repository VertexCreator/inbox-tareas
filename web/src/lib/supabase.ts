import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY (revisa web/.env.local)')
}

export const supabase = createClient(url, key)

export const workspaceDomain: string | undefined = import.meta.env.VITE_WORKSPACE_DOMAIN || undefined

// El login con Google queda listo para activarse cuando exista el cliente OAuth de Workspace.
export const googleLoginEnabled = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true'
