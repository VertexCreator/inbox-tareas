import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { gmailThreadUrl, relativeShort } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Task } from '../lib/types'
import { btn, btnPrimary, input } from './ui'

interface LinkedRow {
  subject: string | null
  from_name: string | null
  from_email: string | null
  received_at: string | null
  gmail_thread_id: string | null
  gmail_message_id: string
}
interface SearchRow {
  id: string
  query: string
  status: 'pendiente' | 'vinculado' | 'revisar' | 'sin_coincidencia' | 'cancelado'
  created_at: string
  searched_at: string | null
}
interface ResultRow {
  id: number
  gmail_message_id: string
  gmail_thread_id: string | null
  from_name: string | null
  subject: string | null
  received_at: string | null
  snippet: string | null
  score: number
}

const STATUS_TEXT: Record<SearchRow['status'], string> = {
  pendiente: 'Buscando en Gmail… el script revisa cada 5 minutos.',
  vinculado: 'Vinculado automáticamente.',
  revisar: 'Hay varios parecidos: revisa si es el correcto.',
  sin_coincidencia: 'No encontré correos con estos parámetros.',
  cancelado: 'Búsqueda reemplazada.',
}

// Correo de Gmail vinculado a una iniciativa (solo el gerente: el equipo no ve el inbox).
export function LinkedEmail({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { member } = useAuth()
  const [linked, setLinked] = useState<LinkedRow | null>(null)
  const [search, setSearch] = useState<SearchRow | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([
      task.email_id
        ? supabase.from('emails').select('subject, from_name, from_email, received_at, gmail_thread_id, gmail_message_id').eq('id', task.email_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('email_search_requests').select('id, query, status, created_at, searched_at').eq('task_id', task.id).neq('status', 'cancelado').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setLinked((e.data as LinkedRow | null) ?? null)
    const req = (s.data as SearchRow | null) ?? null
    setSearch(req)
    if (req) {
      setQuery(req.query)
      const { data } = await supabase.from('email_search_results').select('*').eq('request_id', req.id).order('score', { ascending: false })
      setResults((data ?? []) as ResultRow[])
    } else setResults([])
  }, [task.id, task.email_id])

  useEffect(() => {
    load()
  }, [load])

  // Mientras el script busca, se vuelve a mirar cada 30 segundos.
  useEffect(() => {
    if (search?.status !== 'pendiente') return
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [search?.status, load])

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) return setError(error.message)
    setEditing(false)
    await load()
    onChanged()
  }

  const research = () => run(() => supabase.rpc('request_email_search', { p_task_id: task.id, p_item_id: null, p_query: query || null }))
  const others = results.filter((r) => r.gmail_message_id !== linked?.gmail_message_id).slice(0, 4)

  return (
    <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-indigo-800 dark:text-indigo-200">✉ Correo vinculado</span>
        <span className="text-stone-400">Solo lo ves tú</span>
      </div>

      {linked ? (
        <div className="flex items-start gap-2 rounded-md bg-white p-2 text-sm dark:bg-stone-900">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{linked.subject}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              {linked.from_name || linked.from_email}
              {linked.received_at ? ` · ${relativeShort(linked.received_at)}` : ''}
            </div>
          </div>
          {gmailThreadUrl(linked.gmail_thread_id, member?.email) && (
            <a className={`${btn} px-2 py-0.5 text-xs`} href={gmailThreadUrl(linked.gmail_thread_id, member?.email)!} target="_blank" rel="noreferrer">
              Abrir ↗
            </a>
          )}
          <button className={`${btn} px-2 py-0.5 text-xs`} disabled={busy} onClick={() => run(() => supabase.rpc('unlink_task_email', { p_task_id: task.id }))}>
            Desvincular
          </button>
        </div>
      ) : (
        !search && <p className="text-sm text-stone-500 dark:text-stone-400">Esta iniciativa no tiene correo vinculado.</p>
      )}

      {search && (
        <p className={`mt-1.5 text-xs ${search.status === 'revisar' ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400'}`}>
          {STATUS_TEXT[search.status]}
        </p>
      )}

      {others.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[11px] text-stone-500 dark:text-stone-400">{linked ? 'Otros candidatos' : 'Candidatos encontrados'}</div>
          <div className="space-y-1">
            {others.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs dark:bg-stone-900">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.subject}</div>
                  <div className="truncate text-stone-500 dark:text-stone-400">
                    {r.from_name}
                    {r.received_at ? ` · ${relativeShort(r.received_at)}` : ''}
                  </div>
                </div>
                <span className="tabular-nums text-stone-400" title="Coincidencia">{Math.round(r.score)}</span>
                <button className={`${btn} px-2 py-0.5 text-xs`} disabled={busy} onClick={() => run(() => supabase.rpc('choose_search_result', { p_result_id: r.id }))}>
                  Usar este
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2">
        {editing ? (
          <div className="space-y-1.5">
            <input id={`query-${task.id}`} className={`${input} w-full font-mono text-xs`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Parámetros de búsqueda" />
            <div className="flex gap-1.5">
              <button className={btnPrimary} disabled={busy} onClick={research}>
                Buscar
              </button>
              <button className={btn} onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button className={`${btn} px-2 py-0.5 text-xs`} disabled={busy} onClick={() => (search ? setEditing(true) : research())}>
              {search ? 'Buscar de nuevo / editar parámetros' : 'Buscar correo en Gmail'}
            </button>
            {search?.status === 'pendiente' && (
              <button className={`${btn} px-2 py-0.5 text-xs`} onClick={load}>
                Actualizar
              </button>
            )}
          </div>
        )}
      </div>
      {error && <div className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </section>
  )
}
