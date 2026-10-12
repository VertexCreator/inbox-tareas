import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY (revisa web/.env.local)')
}

export const supabase = createClient(url, key)

// Cada componente abre su propio canal de tiempo real. Si dos usaran el mismo nombre, Supabase devolvería
// el canal ya suscrito y agregarle escuchas fallaría ("cannot add callbacks after subscribe"); además, al
// cerrarse uno se cortaría el del otro.
let channelSeq = 0
export const uniqueChannel = (base: string) => `${base}-${++channelSeq}-${Math.random().toString(36).slice(2, 8)}`

export const workspaceDomain: string | undefined = import.meta.env.VITE_WORKSPACE_DOMAIN || undefined

// El login con Google queda listo para activarse cuando exista el cliente OAuth de Workspace.
export const googleLoginEnabled = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true'
