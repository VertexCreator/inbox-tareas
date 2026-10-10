import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { gmailThreadUrl, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import { PRIORITY_ORDER, type AgentRun, type Email } from '../lib/types'
import { TaskCard } from '../components/TaskCard'
import { Card, Empty, Metric, PriorityBadge, SectionTitle, Tag, btn, relativeDate } from '../components/ui'

export function Hoy() {
  const { isAdmin } = useAuth()
  return isAdmin ? <HoyAdmin /> : <HoyMiembro />
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function HoyAdmin() {
  const { member } = useAuth()
  const { tasks, members, reload } = useBoard()
  const [emails, setEmails] = useState<Email[]>([])
  const [todayEmails, setTodayEmails] = useState<Email[]>([])
  const [run, setRun] = useState<AgentRun | null>(null)
  const [lastIngest, setLastIngest] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const loadInbox = useCallback(async () => {
    const [pending, today, lastRun, ingest] = await Promise.all([
      supabase.from('emails').select('*').eq('needs_reply', true).eq('status', 'pendiente').limit(200),
      supabase.from('emails').select('*').gte('received_at', startOfToday()).limit(1000),
      supabase.from('agent_runs').select('*').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ingest_state').select('last_ingest_at').eq('id', 1).maybeSingle(),
    ])
    setLastIngest(ingest.data?.last_ingest_at ?? null)
    const err = pending.error ?? today.error ?? lastRun.error
    setError(err ? err.message : null)
    setEmails(((pending.data ?? []) as Email[]).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]))
    setTodayEmails((today.data ?? []) as Email[])
    setRun(lastRun.data as AgentRun | null)
  }, [])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  const markEmail = async (id: string, status: Email['status']) => {
    const { error } = await supabase.from('emails').update({ status }).eq('id', id)
    if (error) setError(error.message)
    else loadInbox()
  }

  const approvals = tasks.filter((t) => t.needs_approval && !t.assignee_id && t.status !== 'hecho')
  const openTasks = tasks.filter((t) => t.status !== 'hecho')
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of todayEmails) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [todayEmails])
  const p1 = emails.filter((e) => e.priority === 'P1').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Tu día</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {run ? `Último análisis: ${relativeDate(run.ran_at)}${run.slot ? ` (${run.slot})` : ''}` : 'El agente todavía no ha hecho su primer análisis.'}
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {lastIngest !== undefined && (!lastIngest || Date.now() - new Date(lastIngest).getTime() > 2 * 3600 * 1000) && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {lastIngest
            ? `El script de Gmail no envía correos desde ${relativeDate(lastIngest)}. Revisa el Apps Script (Reglas → Script de Gmail).`
            : 'El script de Gmail aún no está conectado. Sigue la sección "Script de Gmail" de INSTALACION.md.'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Correos hoy" value={todayEmails.length} />
        <Metric label="Responder (P1)" value={p1} tone="danger" />
        <Metric label="Por responder" value={emails.length} tone="warning" />
        <Metric label="Sugerencias por aprobar" value={approvals.length} tone="accent" />
      </div>

      {run?.summary && (
        <Card className="p-4">
          <SectionTitle>Resumen de prioridades</SectionTitle>
          <div className="whitespace-pre-line text-sm leading-relaxed">{run.summary}</div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <SectionTitle right={<button className={btn} onClick={loadInbox}>Actualizar</button>}>
            Correos por responder, en orden
          </SectionTitle>
          <Card>
            {emails.length === 0 ? (
              <Empty>Nada pendiente de responder.</Empty>
            ) : (
              emails.map((e, i) => {
                const url = gmailThreadUrl(e.gmail_thread_id, member?.email)
                return (
                  <div key={e.id} className={`flex items-start gap-3 px-4 py-3 ${i ? 'border-t border-stone-200 dark:border-stone-800' : ''}`}>
                    <PriorityBadge priority={e.priority} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {e.from_name || e.from_email} · {e.subject}
                      </div>
                      {e.summary && <div className="text-xs text-stone-500 dark:text-stone-400">{e.summary}</div>}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Tag>{e.category}</Tag>
                        {e.reply_by && <Tag tone="warning">responder antes del {e.reply_by}</Tag>}
                        {e.draft_created && <Tag tone="accent">borrador listo</Tag>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {url && (
                        <a className={`${btn} text-center`} href={url} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      )}
                      <button className={btn} onClick={() => markEmail(e.id, 'respondido')}>
                        Listo
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </Card>

          {categories.length > 0 && (
            <div className="mt-4">
              <SectionTitle>Correos de hoy por categoría</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {categories.map(([cat, n]) => (
                  <span key={cat} className="rounded-lg bg-stone-100 px-3 py-1 text-xs dark:bg-stone-900">
                    {cat} <span className="font-medium">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionTitle right={<Link className="text-xs text-indigo-600 dark:text-indigo-400" to="/tablero">Ver tablero</Link>}>
            Sugerencias de reparto ({approvals.length})
          </SectionTitle>
          <div className="space-y-2">
            {approvals.length === 0 ? (
              <Card>
                <Empty>No hay sugerencias pendientes. {openTasks.length} tareas abiertas en el equipo.</Empty>
              </Card>
            ) : (
              approvals.map((t) => <TaskCard key={t.id} task={t} members={members} isAdmin onChanged={reload} />)
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function HoyMiembro() {
  const { member } = useAuth()
  const { tasks, members, reload } = useBoard()
  const mine = tasks
    .filter((t) => t.assignee_id === member?.id && t.status !== 'hecho')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const me = members.find((m) => m.id === member?.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Hola, {member?.name}</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {mine.length} tareas abiertas{me ? ` · carga ${Math.round(me.load_ratio * 100)}%` : ''}
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {mine.length === 0 ? (
          <Card className="md:col-span-2">
            <Empty>No tienes tareas abiertas.</Empty>
          </Card>
        ) : (
          mine.map((t) => <TaskCard key={t.id} task={t} members={members} isAdmin={false} onChanged={reload} />)
        )}
      </div>
    </div>
  )
}
