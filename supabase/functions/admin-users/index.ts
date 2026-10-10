// Da acceso (o restablece la contraseña) a un miembro del equipo.
// Solo la puede usar un administrador: se valida con su propio JWT vía la RPC is_admin.
// La persona queda confirmada y con password_set=false, así el dashboard le pide cambiarla al entrar.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: isAdmin, error: adminError } = await caller.rpc('is_admin')
  if (adminError || isAdmin !== true) return json({ error: 'Solo un administrador puede dar acceso' }, 403)

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Correo inválido' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: member } = await admin.from('team_members').select('id').eq('email', email).eq('active', true).maybeSingle()
  if (!member) return json({ error: 'Primero agrega a esta persona en el equipo' }, 400)

  const { data: existingId, error: lookupError } = await admin.rpc('auth_user_id_by_email', { p_email: email })
  if (lookupError) return json({ error: lookupError.message }, 500)

  const attrs = { password, email_confirm: true, user_metadata: { password_set: false } }
  const { error } = existingId
    ? await admin.auth.admin.updateUserById(existingId as string, attrs)
    : await admin.auth.admin.createUser({ email, ...attrs })
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true, created: !existingId })
})
