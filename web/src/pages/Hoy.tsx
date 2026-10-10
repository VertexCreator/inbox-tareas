import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { gmailThreadUrl, isOverdue, memberName, progress, shortDate, todayISO, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import { PRIORITY_ORDER, type Activity, type AgentRun, type Brand, type Email, type Member, type Sticker, type Subtask, type Task } from '../lib/types'
import { dotClass } from '../components/colors'
import { BrandChip } from '../components/Initiative'
import { TaskCard } from '../components/TaskCard'
import { SummaryBoard } from '../components/SummaryBoard'
import { Avatar, Card, Empty, LoadBar, PriorityBadge, SectionTitle, Tag, btn, relativeDate } from '../components/ui'

// Horario del análisis: lunes a viernes 8:00, 13:00 y 18:00; domingo 21:00.
function nextRun(now = new Date()) {
  for (let d = 0; d < 8; d++) {
    const day = new Date(now)
    day.setDate(now.getDate() + d)
    const dow = day.getDay()
    const hours = dow >= 1 && dow <= 5 ? [8, 13, 18] : dow === 0 ? [21] : []
    for (const h of hours) {
      const t = new Date(day)
      t.setHours(h, 0, 0, 0)
      if (t > now) {
        const sameDay = d === 0
        return `${sameDay ? '' : t.toLocaleDateString('es', { weekday: 'long' }) + ' '}${String(h).padStart(2, '0')}:00`
      }
    }
  }
  return null
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function weekRange() {
  const d = startOfToday()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { from: iso(monday), to: iso(sunday), fromDate: monday }
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function Hoy() {
  const { isAdmin } = useAuth()
  return isAdmin ? <HoyGerente /> : <HoyMiembro />
}

// ---------------------------------------------------------------------------
// Vista del gerente: qué necesita de ti, tu bandeja, cómo va el equipo.
// ---------------------------------------------------------------------------

function HoyGerente() {
  const { member } = useAuth()
  const { tasks, subtasks, members, brands, stickers, reload } = useBoard()
  const [emails, setEmails] = useState<Email[]>([])
  const [todayCount, setTodayCount] = useState(0)
  const [run, setRun] = useState<AgentRun | null>(null)
  const [lastIngest, setLastIngest] = useState<string | null | undefined>(undefined)
  const [threshold, setThreshold] = useState(0.9)
  const [openPlans, setOpenPlans] = useState<{ id: string; title: string }[]>([])
  const [category, setCategory] = useState<string>('')
  const [created, setCreated] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadInbox = useCallback(async () => {
    const [pending, today, lastRun, ingest, settings, plans] = await Promise.all([
      supabase.from('emails').select('*').eq('status', 'pendiente').neq('priority', 'ninguna').order('received_at', { ascending: false }).limit(200),
      supabase.from('emails').select('id', { count: 'exact', head: true }).gte('received_at', startOfToday().toISOString()),
      supabase.from('agent_runs').select('*').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ingest_state').select('last_ingest_at').eq('id', 1).maybeSingle(),
      supabase.from('settings').select('saturation_threshold').eq('id', 1).maybeSingle(),
      supabase.from('list_items').select('id, title').eq('status', 'planificando').order('created_at'),
    ])
    const err = pending.error ?? today.error ?? lastRun.error ?? plans.error
    setError(err ? err.message : null)
    setEmails((pending.data ?? []) as Email[])
    setTodayCount(today.count ?? 0)
    setRun(lastRun.data as AgentRun | null)
    setLastIngest(ingest.data?.last_ingest_at ?? null)
    setThreshold(Number(settings.data?.saturation_threshold ?? 0.9))
    setOpenPlans((plans.data ?? []) as { id: string; title: string }[])
  }, [])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  const today = todayISO()
  const approvals = tasks.filter((t) => t.needs_approval && !t.assignee_id && t.status !== 'hecho')
  const closed = (t?: Task) => t?.status === 'hecho' || t?.status === 'cancelado'
  const overdueTasks = tasks.filter((t) => isOverdue(t.due_date, closed(t)))
  const overdueSubs = subtasks.filter((s) => {
    const parent = tasks.find((t) => t.id === s.task_id)
    return isOverdue(s.due_date, s.done || closed(parent))
  })
  const active = members.filter((m) => m.active)
  const saturated = active.filter((m) => m.load_ratio >= threshold)
  const p1 = emails.filter((e) => e.priority === 'P1')
  const categories = [...new Set(emails.map((e) => e.category))].sort()
  const shown = category ? emails.filter((e) => e.category === category) : emails
  const stale = lastIngest !== undefined && (!lastIngest || Date.now() - new Date(lastIngest).getTime() > 2 * 3600 * 1000)
  const firstName = (member?.name ?? '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0]
  const next = nextRun()

  const markEmail = async (id: string) => {
    const { error } = await supabase.from('emails').update({ status: 'respondido' }).eq('id', id)
    if (error) setError(error.message)
    else loadInbox()
  }

  const toPending = async (e: Email) => {
    const { data: inbox } = await supabase.from('lists').select('id').eq('is_inbox', true).maybeSingle()
    if (!inbox) return setError('No encontré la lista "Desde correos".')
    const { error } = await supabase.from('list_items').insert({
      list_id: inbox.id,
      title: e.summary?.split(/[;.]/)[0]?.slice(0, 80) || e.subject || 'Pendiente desde correo',
      notes: `${e.from_name || e.from_email}: ${e.subject ?? ''}`,
      priority: e.priority === 'ninguna' ? null : e.priority,
      due_date: e.reply_by,
      email_id: e.id,
      brand_id: e.brand_id,
      suggested_brand: e.brand_id ? null : e.suggested_brand,
    })
    if (error) setError(error.message)
    else setCreated((c) => [...c, e.id])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">Hola{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            {next ? ` · próxima revisión del agente ${next}` : ''}
          </p>
        </div>
        {lastIngest !== undefined &&
          (stale ? (
            <Tag tone="warning">
              {lastIngest ? `Script sin enviar desde ${relativeDate(lastIngest)}` : 'Script de Gmail sin conectar'}
            </Tag>
          ) : (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">● Script al día</span>
          ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {run && (run.summary || run.summary_data) && (
        <SummaryBoard run={run} todayCount={todayCount} emails={emails} brands={brands} account={member?.email} onSeeInbox={() => scrollTo('bandeja')} />
      )}

      <section>
        <div className="mb-2 text-xs text-stone-500 dark:text-stone-400">Necesita tu atención</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <AttentionTile tone="danger" icon="✉" value={p1.length} label="Responder hoy" onClick={() => scrollTo('bandeja')} />
          <AttentionTile tone="accent" icon="⇄" value={approvals.length + openPlans.length} label="Repartos por decidir" onClick={() => scrollTo('decidir')} />
          <AttentionTile tone="warning" icon="⏱" value={overdueTasks.length + overdueSubs.length} label="Vencidas" onClick={() => scrollTo('vencidas')} />
          <AttentionTile tone="neutral" icon="▮" value={saturated.length} label={saturated.length === 1 ? 'Persona saturada' : 'Personas saturadas'} onClick={() => scrollTo('equipo')} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <section id="bandeja" className="scroll-mt-20">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="text-sm font-medium">Tu bandeja priorizada</div>
                <div className="flex flex-wrap gap-1">
                  {['', ...categories].map((c) => (
                    <button
                      key={c || 'todo'}
                      onClick={() => setCategory(c)}
                      className={`rounded-md px-2 py-0.5 text-[11px] ${
                        category === c ? 'bg-stone-200 font-medium dark:bg-stone-700' : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                      }`}
                    >
                      {c || 'Todo'}
                    </button>
                  ))}
                </div>
              </div>
              {shown.length === 0 && <Empty>Nada pendiente en tu bandeja.</Empty>}
              {(['P1', 'P2', 'P3'] as const).map((p) => {
                const group = shown.filter((e) => e.priority === p)
                if (!group.length) return null
                return (
                  <Group key={p} priority={p} count={group.length} defaultOpen={p !== 'P3'}>
                    {group.map((e) => (
                      <EmailRow
                        key={e.id}
                        email={e}
                        brands={brands}
                        account={member?.email}
                        created={created.includes(e.id)}
                        onDone={() => markEmail(e.id)}
                        onPending={() => toPending(e)}
                      />
                    ))}
                  </Group>
                )
              })}
            </Card>
          </section>

          <section id="decidir" className="scroll-mt-20">
            <SectionTitle right={<Link className="text-xs text-indigo-600 dark:text-indigo-400" to="/listas">Ir a Listas</Link>}>
              Repartos por decidir
            </SectionTitle>
            <div className="space-y-2">
              {openPlans.length === 0 && approvals.length === 0 && (
                <Card>
                  <Empty>No hay repartos esperando tu decisión.</Empty>
                </Card>
              )}
              {openPlans.length > 0 && (
                <Card className="divide-y divide-stone-200 dark:divide-stone-800">
                  {openPlans.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="text-indigo-600 dark:text-indigo-400">✦</span>
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <Tag tone="accent">Plan recomendado</Tag>
                      <Link className={btn} to="/listas">
                        Revisar
                      </Link>
                    </div>
                  ))}
                </Card>
              )}
              {approvals.map((t) => (
                <TaskCard key={t.id} task={t} members={members} isAdmin onChanged={reload} subtasks={subtasks.filter((s) => s.task_id === t.id)} />
              ))}
            </div>
          </section>

          <section id="vencidas" className="scroll-mt-20">
            <SectionTitle>Vencidas</SectionTitle>
            <Card className="divide-y divide-stone-200 dark:divide-stone-800">
              {overdueTasks.length + overdueSubs.length === 0 && <Empty>Nada vencido. Todo en fecha.</Empty>}
              {overdueTasks.map((t) => (
                <OverdueRow key={t.id} title={t.title} who={t.assignee_id} due={t.due_date} members={members} kind="Tarea" />
              ))}
              {overdueSubs.map((s) => (
                <OverdueRow
                  key={s.id}
                  title={s.title}
                  who={s.assignee_id}
                  due={s.due_date}
                  members={members}
                  kind={`Subtarea de "${tasks.find((t) => t.id === s.task_id)?.title ?? ''}"`}
                />
              ))}
            </Card>
          </section>
        </div>

        <div className="space-y-5">
          <section id="equipo" className="scroll-mt-20">
            <TeamToday members={active} tasks={tasks.filter((t) => t.status !== 'cancelado')} subtasks={subtasks} threshold={threshold} today={today} />
          </section>
          <BrandProgress brands={brands.filter((b) => !b.archived)} tasks={tasks} stickers={stickers} />
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}

function AttentionTile({
  tone,
  icon,
  value,
  label,
  onClick,
}: {
  tone: 'danger' | 'accent' | 'warning' | 'neutral'
  icon: string
  value: number
  label: string
  onClick: () => void
}) {
  const quiet = value === 0
  const styles = {
    danger: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
    accent: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
    warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    neutral: 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-stone-300 dark:hover:border-stone-700 ${
        quiet ? 'bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-500' : styles[tone]
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block text-2xl font-medium tabular-nums leading-tight">{value}</span>
        <span className="block text-[11px]">{label}</span>
      </span>
    </button>
  )
}

function Group({ priority, count, defaultOpen, children }: { priority: 'P1' | 'P2' | 'P3'; count: number; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const label = { P1: 'Responder hoy', P2: 'Esta semana', P3: 'Cuando puedas' }[priority]
  return (
    <div className="border-t border-stone-200 dark:border-stone-800">
      <button
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800/40"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="w-3 text-stone-400">{open ? '▾' : '▸'}</span>
        <PriorityBadge priority={priority} />
        {label}
        <span className="font-normal text-stone-400">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function EmailRow({
  email: e,
  brands,
  account,
  created,
  onDone,
  onPending,
}: {
  email: Email
  brands: Brand[]
  account?: string
  created: boolean
  onDone: () => void
  onPending: () => void
}) {
  const url = gmailThreadUrl(e.gmail_thread_id, account)
  const who = e.from_name || e.from_email || '?'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-stone-100 py-2.5 pl-9 pr-4 text-sm dark:border-stone-800/60">
      <Avatar name={who} id={e.from_email ?? who} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {who} · <span className="font-normal">{e.subject}</span>
        </div>
        {e.summary && <div className="text-xs text-stone-500 dark:text-stone-400">{e.summary}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {e.mentioned && (
          <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white" title="Te mencionan con @ en este correo">
            @ Te mencionan
          </span>
        )}
        {!e.mentioned && e.addressed && e.addressed !== 'para' && <Tag>{e.addressed === 'copia' ? 'En copia' : 'Por lista'}</Tag>}
        {e.brand_id ? (
          <BrandChip brand={brands.find((b) => b.id === e.brand_id)} />
        ) : (
          e.suggested_brand && (
            <span className="rounded border border-dashed border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 dark:border-violet-700 dark:text-violet-300">
              ✦ ¿Marca: {e.suggested_brand}?
            </span>
          )
        )}
        {e.draft_created && <Tag tone="accent">Borrador listo</Tag>}
        {e.reply_by && <Tag tone="warning">antes del {shortDate(e.reply_by)}</Tag>}
        {created ? (
          <Tag>En "Desde correos"</Tag>
        ) : (
          <button className={`${btn} px-2 py-0.5 text-xs`} onClick={onPending}>
            Crear pendiente
          </button>
        )}
        {url && (
          <a className={`${btn} px-2 py-0.5 text-xs`} href={url} target="_blank" rel="noreferrer">
            Abrir
          </a>
        )}
        <button className={`${btn} px-2 py-0.5 text-xs`} onClick={onDone}>
          Listo
        </button>
      </div>
    </div>
  )
}

function OverdueRow({ title, who, due, members, kind }: { title: string; who: string | null; due: string | null; members: Member[]; kind: string }) {
  const name = memberName(members, who)
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      {who && name ? <Avatar name={name} id={who} /> : <span className="h-6 w-6" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-stone-500 dark:text-stone-400">
          {kind} · {name ?? 'sin asignar'}
        </div>
      </div>
      <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-200">venció {shortDate(due)}</span>
    </div>
  )
}

function TeamToday({
  members,
  tasks,
  subtasks,
  threshold,
  today,
}: {
  members: Member[]
  tasks: Task[]
  subtasks: Subtask[]
  threshold: number
  today: string
}) {
  const doneToday = (id: string) =>
    tasks.filter((t) => t.assignee_id === id && t.completed_at?.slice(0, 10) === today).length +
    subtasks.filter((s) => s.assignee_id === id && s.done_at && new Date(s.done_at).toDateString() === new Date().toDateString()).length

  const { from, to, fromDate } = weekRange()
  const week = tasks.filter(
    (t) => (t.due_date && t.due_date >= from && t.due_date <= to) || (t.completed_at && new Date(t.completed_at) >= fromDate),
  )
  const seg = {
    hecho: week.filter((t) => t.status === 'hecho').length,
    vencido: week.filter((t) => isOverdue(t.due_date, t.status === 'hecho')).length,
    en_curso: week.filter((t) => t.status === 'en_curso' && !isOverdue(t.due_date, false)).length,
  }
  const porHacer = week.length - seg.hecho - seg.vencido - seg.en_curso
  const pct = (n: number) => (week.length ? `${(n / week.length) * 100}%` : '0%')

  return (
    <Card className="p-4">
      <SectionTitle right={<span className="text-[11px] text-stone-400">hechas hoy</span>}>Equipo hoy</SectionTitle>
      <div className="space-y-2.5">
        {members.length === 0 && <div className="text-sm text-stone-500">Agrega a tu equipo en la página Equipo.</div>}
        {members
          .slice()
          .sort((a, b) => b.load_ratio - a.load_ratio)
          .map((m) => (
            <div key={m.id} className={`flex items-center gap-2 text-xs ${m.available ? '' : 'opacity-60'}`}>
              <Avatar name={m.name} id={m.id} />
              <span className="w-20 truncate">{m.name}</span>
              <div className="flex-1">
                {m.available ? <LoadBar ratio={m.load_ratio} /> : <Tag>No disponible</Tag>}
              </div>
              {m.load_ratio >= threshold && m.available && <span className="text-[10px] text-red-600 dark:text-red-400">saturada</span>}
              <span className="w-5 text-right tabular-nums">{doneToday(m.id)}</span>
            </div>
          ))}
      </div>
      <div className="mt-4 border-t border-stone-200 pt-3 dark:border-stone-800">
        <div className="mb-1.5 flex justify-between text-xs">
          <span>Progreso del equipo esta semana</span>
          <span className="text-stone-500 dark:text-stone-400">
            {seg.hecho} de {week.length}
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="bg-emerald-500" style={{ width: pct(seg.hecho) }} />
          <div className="bg-indigo-500" style={{ width: pct(seg.en_curso) }} />
          <div className="bg-red-500" style={{ width: pct(seg.vencido) }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-stone-500 dark:text-stone-400">
          <span><span className="text-emerald-600">●</span> Hecho {seg.hecho}</span>
          <span><span className="text-indigo-600">●</span> En curso {seg.en_curso}</span>
          <span><span className="text-red-600">●</span> Vencido {seg.vencido}</span>
          <span>○ Por hacer {porHacer}</span>
        </div>
      </div>
    </Card>
  )
}

function BrandProgress({ brands, tasks, stickers }: { brands: Brand[]; tasks: Task[]; stickers: Sticker[] }) {
  if (brands.length === 0) return null
  return (
    <Card className="p-4">
      <SectionTitle right={<Link className="text-xs text-indigo-600 dark:text-indigo-400" to="/tablero">Ver tablero</Link>}>Avance por marca</SectionTitle>
      <div className="space-y-2.5">
        {brands.map((b) => {
          const mine = tasks.filter((t) => t.brand_id === b.id)
          const p = progress(mine, stickers)
          const late = mine.filter((t) => isOverdue(t.due_date, t.status === 'hecho' || t.status === 'cancelado')).length
          return (
            <div key={b.id} className="text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${dotClass(b.color)}`} aria-hidden="true" />
                  {b.name}
                </span>
                <span className="tabular-nums text-stone-500">
                  {p.done}/{p.total}
                  {late > 0 && <span className="text-red-600 dark:text-red-400"> · {late} vencidas</span>}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full bg-emerald-500" style={{ width: `${p.pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const ACTIVITY_ICON: Record<string, { icon: string; cls: string }> = {
  estado: { icon: '✓', cls: 'text-emerald-600' },
  subtarea: { icon: '✓', cls: 'text-emerald-600' },
  plan: { icon: '✦', cls: 'text-indigo-600 dark:text-indigo-400' },
  sugerencia: { icon: '✦', cls: 'text-indigo-600 dark:text-indigo-400' },
  asignacion: { icon: '→', cls: 'text-indigo-600 dark:text-indigo-400' },
  correccion: { icon: '⇄', cls: 'text-amber-600' },
  observacion: { icon: '💬', cls: 'text-amber-600' },
  pendiente: { icon: '+', cls: 'text-stone-500' },
}

function ActivityFeed() {
  const [items, setItems] = useState<Activity[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(15)
    setItems((data ?? []) as Activity[])
  }, [])
  useEffect(() => {
    load()
    const channel = supabase
      .channel('activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  return (
    <Card className="p-4">
      <SectionTitle>Actividad reciente</SectionTitle>
      {items.length === 0 && <div className="text-sm text-stone-500 dark:text-stone-400">Aquí verás lo que hace el equipo y el agente.</div>}
      <div className="space-y-2.5">
        {items.map((a) => {
          const ic = ACTIVITY_ICON[a.kind] ?? { icon: '•', cls: 'text-stone-400' }
          const actor = a.actor === 'agente' ? 'Agente' : a.actor
          return (
            <div key={a.id} className="flex gap-2 text-xs">
              <span className={`w-3 shrink-0 ${ic.cls}`} aria-hidden="true">
                {ic.icon}
              </span>
              <div className="min-w-0">
                <span className="font-medium">{actor}</span> {a.message}
                <div className="text-stone-400">{relativeDate(a.created_at)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Vista del miembro: mis tareas y subtareas por fecha (al estilo Asana).
// ---------------------------------------------------------------------------

function HoyMiembro() {
  const { member } = useAuth()
  const { tasks, subtasks, members, reload } = useBoard()
  const me = members.find((m) => m.id === member?.id)
  const today = todayISO()
  const { to } = weekRange()

  const myTasks = tasks.filter((t) => t.assignee_id === member?.id && t.status !== 'hecho' && t.status !== 'cancelado')
  const mySubs = subtasks.filter((s) => {
    const parent = tasks.find((t) => t.id === s.task_id)
    return s.assignee_id === member?.id && !s.done && parent && parent.assignee_id !== member?.id && parent.status !== 'hecho' && parent.status !== 'cancelado'
  })

  type Entry = { key: string; due: string | null; node: ReactNode; priority: string }
  const entries: Entry[] = [
    ...myTasks.map((t) => ({
      key: t.id,
      due: t.due_date,
      priority: t.priority,
      node: <TaskCard task={t} members={members} isAdmin={false} onChanged={reload} subtasks={subtasks.filter((s) => s.task_id === t.id)} />,
    })),
    ...mySubs.map((s) => ({
      key: s.id,
      due: s.due_date,
      priority: 'P2',
      node: <MySubtask subtask={s} parent={tasks.find((t) => t.id === s.task_id)!} members={members} onChanged={reload} />,
    })),
  ].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

  const buckets = [
    { label: 'Vencidas', items: entries.filter((e) => e.due && e.due < today), tone: 'text-red-600 dark:text-red-400' },
    { label: 'Hoy', items: entries.filter((e) => e.due === today), tone: '' },
    { label: 'Esta semana', items: entries.filter((e) => e.due && e.due > today && e.due <= to), tone: '' },
    { label: 'Más adelante', items: entries.filter((e) => !e.due || e.due > to), tone: 'text-stone-500' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium">Hola, {(member?.name ?? '').split(/\s+/)[0]}</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {entries.length} pendientes tuyos{me ? ` · carga ${Math.round(me.load_ratio * 100)}%` : ''}
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {entries.length === 0 && (
            <Card>
              <Empty>No tienes nada pendiente. Puedes proponer ideas en Listas.</Empty>
            </Card>
          )}
          {buckets.map(
            (b) =>
              b.items.length > 0 && (
                <section key={b.label}>
                  <SectionTitle>
                    <span className={b.tone}>
                      {b.label} · {b.items.length}
                    </span>
                  </SectionTitle>
                  <div className="space-y-2">
                    {b.items.map((e) => (
                      <div key={e.key}>{e.node}</div>
                    ))}
                  </div>
                </section>
              ),
          )}
        </div>
        <ActivityFeed />
      </div>
    </div>
  )
}

function MySubtask({ subtask: s, parent, members, onChanged }: { subtask: Subtask; parent: Task; members: Member[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const owner = memberName(members, parent.assignee_id)
  const overdue = isOverdue(s.due_date, s.done)
  const toggle = async (done: boolean) => {
    const { error } = await supabase.from('subtasks').update({ done }).eq('id', s.id)
    if (error) setError(error.message)
    else onChanged()
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-900">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={s.done} onChange={(e) => toggle(e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{s.title}</span>
          <span className="block text-xs text-stone-500 dark:text-stone-400">
            Subtarea de "{parent.title}"{owner ? ` · responsable ${owner}` : ''}
          </span>
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[11px] ${overdue ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'}`}>
          {s.due_date ? `${overdue ? 'venció' : 'vence'} ${shortDate(s.due_date)}` : 'sin fecha'}
        </span>
      </label>
      {error && <div className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}
