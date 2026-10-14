import { useMemo, useState, type ReactNode } from 'react'
import { useUndo } from '../lib/undo'
import { useSearchParams } from 'react-router-dom'
import { BrandChips, brandIdsOf, hasBrand } from '../components/Brands'
import { ForwardBadge } from '../components/ForwardStatus'
import { InitiativeDetail, StickerPill, SubtaskEditor, type BoardCtx } from '../components/Initiative'
import { chipClass } from '../components/colors'
import { Card, btn, btnDetail as detailBtn, input } from '../components/ui'
import { EmailModal } from '../components/TaskEmail'
import { useAuth } from '../lib/auth'
import { memberName, shortDate, todayISO, updateSubtask, updateTask, useBoard } from '../lib/data'
import { useForwards } from '../lib/forwards'
import type { Sticker, Subtask, Task } from '../lib/types'

// Todo lo que le toca a una persona, en dos listas: lo pendiente (por urgencia) y lo que ya terminó.
// Cuenta: las iniciativas de las que es responsable y sus subtareas en iniciativas de otros.

type Tab = 'pendientes' | 'terminadas'

type Item =
  | { kind: 'iniciativa'; id: string; task: Task; due: string | null; doneAt: string | null; cancelled: boolean }
  | { kind: 'subtarea'; id: string; task: Task; sub: Subtask; due: string | null; doneAt: string | null; cancelled: false }


function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localDay(ts: string) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeOf(ts: string) {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

// Etapas a las que pasa una iniciativa al terminarla o reabrirla.
function doneStage(stickers: Sticker[]) {
  return stickers.find((s) => s.category === 'terminado')
}
function reopenStage(stickers: Sticker[]) {
  return stickers.find((s) => s.category === 'en_curso') ?? stickers.find((s) => s.category === 'abierto') ?? stickers[0]
}

const PENDING_GROUPS: { key: string; label: string; tone: string; test: (due: string | null, today: string) => boolean }[] = [
  { key: 'vencidas', label: 'Vencidas', tone: 'text-red-600 dark:text-red-400', test: (d, t) => !!d && d < t },
  { key: 'hoy', label: 'Hoy', tone: 'text-amber-700 dark:text-amber-300', test: (d, t) => d === t },
  { key: 'manana', label: 'Mañana', tone: 'text-stone-700 dark:text-stone-200', test: (d, t) => d === addDays(t, 1) },
  { key: 'semana', label: 'Próximos 7 días', tone: 'text-stone-700 dark:text-stone-200', test: (d, t) => !!d && d > addDays(t, 1) && d <= addDays(t, 7) },
  { key: 'despues', label: 'Más adelante', tone: 'text-stone-500 dark:text-stone-400', test: (d, t) => !!d && d > addDays(t, 7) },
  { key: 'sinfecha', label: 'Sin fecha límite', tone: 'text-stone-500 dark:text-stone-400', test: (d) => !d },
]

export function MisTareas() {
  const { member, isAdmin } = useAuth()
  const { tasks, subtasks, members, brands, stickers, agencies, reload } = useBoard()
  const [params] = useSearchParams()
  const [who, setWho] = useState<string>('')
  const [brand, setBrand] = useState('')
  const [tab, setTab] = useState<Tab>(params.get('ver') === 'terminadas' ? 'terminadas' : 'pendientes')
  // El correo de asignación enlaza aquí con ?abrir=<iniciativa>.
  const [openId, setOpenId] = useState<string | null>(params.get('abrir'))
  const [showOlder, setShowOlder] = useState(false)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { track } = useUndo()
  const { byTask: forwards, schedule: forwardSchedule } = useForwards()
  const ctx: BoardCtx = { members, brands, stickers, subtasks, agencies, forwards, forwardSchedule }

  const personId = (isAdmin && who) || member?.id || ''
  const person = members.find((m) => m.id === personId)
  const isMe = personId === member?.id
  const today = todayISO()
  const cat = (t: Task) => stickers.find((s) => s.id === t.sticker_id)?.category
  const ownerOf = (t: Task) => t.assignee_id ?? t.suggested_assignee_id

  const items: Item[] = useMemo(() => {
    const own: Item[] = tasks
      .filter((t) => ownerOf(t) === personId)
      .map((t) => ({
        kind: 'iniciativa',
        id: `t-${t.id}`,
        task: t,
        due: t.due_date,
        doneAt: cat(t) === 'terminado' || cat(t) === 'cancelado' ? (t.completed_at ?? t.updated_at) : null,
        cancelled: cat(t) === 'cancelado',
      }))
    const subs: Item[] = subtasks
      .filter((s) => s.assignee_id === personId)
      .map((s) => ({ s, t: tasks.find((t) => t.id === s.task_id) }))
      .filter((x): x is { s: Subtask; t: Task } => !!x.t && ownerOf(x.t) !== personId)
      .map(({ s, t }) => ({ kind: 'subtarea', id: `s-${s.id}`, task: t, sub: s, due: s.due_date, doneAt: s.done ? (s.done_at ?? t.updated_at) : null, cancelled: false }))
    return [...own, ...subs].filter((i) => !brand || hasBrand(i.task, brand))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, subtasks, stickers, personId, brand])

  const pending = items.filter((i) => !i.doneAt).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const done = items.filter((i) => i.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const overdue = pending.filter((i) => i.due && i.due < today).length
  const weekAgo = addDays(today, -6)
  const doneThisWeek = done.filter((i) => localDay(i.doneAt!) >= weekAgo && !i.cancelled).length

  const allMine = [...tasks.filter((t) => ownerOf(t) === personId), ...subtasks.filter((s) => s.assignee_id === personId).map((s) => tasks.find((t) => t.id === s.task_id)).filter((t): t is Task => !!t)]
  const myBrands = brands.filter((b) => allMine.some((t) => hasBrand(t, b.id)))
  const open = tasks.find((t) => t.id === openId)

  // Aviso global con "↶ Deshacer" (y "Ver terminadas" al terminar algo).
  const notify = (text: string, undoFn: () => Promise<void>, toDone = false) => {
    track(text, undoFn, { after: reload, action: toDone ? { label: 'Ver terminadas', onClick: () => setTab('terminadas') } : undefined })
    if (toDone) {
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
    }
  }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      reload()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      return false
    }
  }

  const complete = async (i: Item) => {
    if (i.kind === 'subtarea') {
      if (await run(() => updateSubtask(i.sub.id, { done: true })))
        notify(`Marcaste «${i.sub.title}» como terminada`, () => updateSubtask(i.sub.id, { done: false }), true)
      return
    }
    const target = doneStage(stickers)
    if (!target) return setError('No hay ninguna etapa que cuente como "Terminado". El gerente puede crearla en el tablero.')
    const prev = i.task.sticker_id
    if (await run(() => updateTask(i.task.id, { sticker_id: target.id })))
      notify(`Marcaste «${i.task.title}» como terminada (${target.name})`, () => updateTask(i.task.id, { sticker_id: prev }), true)
  }

  const reopen = async (i: Item) => {
    if (i.kind === 'subtarea') {
      if (await run(() => updateSubtask(i.sub.id, { done: false }))) notify(`Reabriste «${i.sub.title}»`, () => updateSubtask(i.sub.id, { done: true }))
      return
    }
    const target = reopenStage(stickers)
    const prev = i.task.sticker_id
    if (target && (await run(() => updateTask(i.task.id, { sticker_id: target.id }))))
      notify(`Reabriste «${i.task.title}» (${target.name})`, () => updateTask(i.task.id, { sticker_id: prev }))
  }

  const canAct = (i: Item) => isAdmin || (i.kind === 'subtarea' ? i.sub.assignee_id === member?.id : i.task.assignee_id === member?.id)

  // Terminadas, por cuándo se terminaron.
  const doneGroups = [
    { label: 'Hoy', rows: done.filter((i) => localDay(i.doneAt!) === today) },
    { label: 'Ayer', rows: done.filter((i) => localDay(i.doneAt!) === addDays(today, -1)) },
    { label: 'Esta semana', rows: done.filter((i) => localDay(i.doneAt!) < addDays(today, -1) && localDay(i.doneAt!) >= weekAgo) },
    { label: 'Antes', rows: done.filter((i) => localDay(i.doneAt!) < weekAgo) },
  ].filter((g) => g.rows.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">{isMe ? 'Mis tareas' : `Tareas de ${person?.name ?? ''}`}</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Las iniciativas de las que {isMe ? 'eres' : 'es'} responsable y {isMe ? 'tus' : 'sus'} subtareas en iniciativas de otros.
          </p>
        </div>
        {isAdmin && (
          <select className={input} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Ver las tareas de">
            <option value="">Mis tareas</option>
            {members
              .filter((m) => m.active && m.id !== member?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  Tareas de {m.name}
                </option>
              ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Counter label="Pendientes" value={pending.length} active={tab === 'pendientes'} onClick={() => setTab('pendientes')} />
        <Counter label="Vencidas" value={overdue} tone={overdue ? 'danger' : 'neutral'} active={false} onClick={() => setTab('pendientes')} />
        <Counter label="Terminadas esta semana" value={doneThisWeek} tone="ok" active={tab === 'terminadas'} flash={flash} onClick={() => setTab('terminadas')} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg bg-stone-100 p-1 dark:bg-stone-900" role="tablist" aria-label="Qué ver">
          <TabButton active={tab === 'pendientes'} onClick={() => setTab('pendientes')} label="Pendientes" count={pending.length} />
          <TabButton active={tab === 'terminadas'} onClick={() => setTab('terminadas')} label="✓ Terminadas" count={done.length} flash={flash} />
        </div>
        {myBrands.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setBrand('')} className={`rounded-lg px-3 py-1 text-xs ${!brand ? 'bg-stone-200 font-medium dark:bg-stone-700' : 'bg-stone-100 dark:bg-stone-900'}`}>
              Todas las marcas
            </button>
            {myBrands.map((b) => (
              <button key={b.id} onClick={() => setBrand(brand === b.id ? '' : b.id)} className={`rounded-lg px-3 py-1 text-xs ${brand === b.id ? `${chipClass(b.color)} font-medium` : 'bg-stone-100 dark:bg-stone-900'}`}>
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {tab === 'pendientes' && (
        <div className="space-y-5">
          {pending.length === 0 && (
            <Card className="p-8 text-center">
              <div className="text-3xl" aria-hidden="true">
                🎉
              </div>
              <div className="mt-2 font-medium">{isMe ? 'No tienes nada pendiente' : 'No tiene nada pendiente'}{brand ? ' en esta marca' : ''}.</div>
              {done.length > 0 && (
                <button className="mt-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setTab('terminadas')}>
                  Ver lo terminado ({done.length})
                </button>
              )}
            </Card>
          )}
          {PENDING_GROUPS.map((g) => {
            const rows = pending.filter((i) => g.test(i.due, today))
            if (rows.length === 0) return null
            return (
              <Group key={g.key} title={g.label} tone={g.tone} count={rows.length}>
                {rows.map((i) => (
                  <PendingRow key={i.id} item={i} ctx={ctx} canAct={canAct(i)} onComplete={() => complete(i)} onOpen={() => setOpenId(i.task.id)} onChanged={reload} />
                ))}
              </Group>
            )
          })}
        </div>
      )}

      {tab === 'terminadas' && (
        <div className="space-y-5">
          {done.length === 0 && (
            <Card className="p-8 text-center text-sm text-stone-500 dark:text-stone-400">
              Aquí aparece todo lo que {isMe ? 'marques' : 'marque'} como terminado, para tenerlo a la mano.
            </Card>
          )}
          {doneGroups.map((g) =>
            g.label === 'Antes' && !showOlder ? (
              <button key={g.label} className={btn} onClick={() => setShowOlder(true)}>
                Ver {g.rows.length} terminadas antes de esta semana
              </button>
            ) : (
              <Group key={g.label} title={g.label} tone="text-emerald-700 dark:text-emerald-300" count={g.rows.length}>
                {g.rows.map((i) => (
                  <DoneRow key={i.id} item={i} ctx={ctx} canAct={canAct(i)} onReopen={() => reopen(i)} onOpen={() => setOpenId(i.task.id)} />
                ))}
              </Group>
            ),
          )}
        </div>
      )}

      {open && <InitiativeDetail task={open} ctx={ctx} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

function Counter({ label, value, tone = 'neutral', active, flash = false, onClick }: { label: string; value: number; tone?: 'neutral' | 'danger' | 'ok'; active: boolean; flash?: boolean; onClick: () => void }) {
  const color = tone === 'danger' ? 'text-red-600 dark:text-red-400' : tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : ''
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white p-3 text-left transition dark:bg-stone-900 ${active ? 'border-indigo-400 dark:border-indigo-700' : 'border-stone-200 hover:border-stone-300 dark:border-stone-800'} ${
        flash ? 'scale-[1.03] ring-2 ring-emerald-400' : ''
      }`}
    >
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-stone-500 dark:text-stone-400">{label}</div>
    </button>
  )
}

function TabButton({ active, onClick, label, count, flash = false }: { active: boolean; onClick: () => void; label: string; count: number; flash?: boolean }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm transition ${active ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'}`}
    >
      {label}
      <span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${flash ? 'bg-emerald-500 text-white' : 'bg-stone-200 dark:bg-stone-800'}`}>{count}</span>
    </button>
  )
}

function Group({ title, tone, count, children }: { title: string; tone: string; count: number; children: ReactNode }) {
  return (
    <section>
      <div className={`mb-1.5 flex items-center gap-2 text-sm font-medium ${tone}`}>
        {title}
        <span className="text-xs font-normal text-stone-400">{count}</span>
      </div>
      <Card className="divide-y divide-stone-200 dark:divide-stone-800">{children}</Card>
    </section>
  )
}

function KindTag({ item, ctx }: { item: Item; ctx: BoardCtx }) {
  if (item.kind === 'iniciativa') {
    return <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Responsable</span>
  }
  return (
    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600 dark:bg-stone-800 dark:text-stone-300">
      Subtarea · responsable {memberName(ctx.members, item.task.assignee_id ?? item.task.suggested_assignee_id) ?? '—'}
    </span>
  )
}

function DueText({ due }: { due: string | null }) {
  const today = todayISO()
  if (!due) return <span className="text-xs text-stone-400">Sin fecha</span>
  if (due < today) return <span className="text-xs font-medium text-red-600 dark:text-red-400">Venció {shortDate(due)}</span>
  if (due === today) return <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Vence hoy</span>
  return <span className="text-xs text-stone-500 dark:text-stone-400">Vence {shortDate(due)}</span>
}

function PendingRow({ item: i, ctx, canAct, onComplete, onOpen, onChanged }: { item: Item; ctx: BoardCtx; canAct: boolean; onComplete: () => void; onOpen: () => void; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [moreText, setMoreText] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = i.task
  const subs = ctx.subtasks.filter((s) => s.task_id === t.id)
  const openSubs = subs.filter((s) => !s.done).length
  const sticker = ctx.stickers.find((s) => s.id === t.sticker_id)
  const title = i.kind === 'subtarea' ? i.sub.title : t.title

  const finish = async () => {
    if (i.kind === 'iniciativa' && openSubs > 0 && !confirm) return setConfirm(true)
    setBusy(true)
    setConfirm(false)
    await onComplete()
    setBusy(false)
  }

  const runSub = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex items-start gap-3">
        <button
          onClick={finish}
          disabled={!canAct || busy}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs transition ${
            canAct ? 'border-stone-300 text-transparent hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:border-stone-600 dark:hover:bg-emerald-950' : 'cursor-not-allowed border-stone-200 dark:border-stone-800'
          }`}
          title={canAct ? 'Marcar como terminada' : 'Solo la persona asignada o el gerente pueden marcarla'}
          aria-label={`Marcar "${title}" como terminada`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <KindTag item={i} ctx={ctx} />
            <BrandChips ids={brandIdsOf(t)} brands={ctx.brands} hideEmpty />
            {i.kind === 'iniciativa' && <StickerPill sticker={sticker} />}
            {i.kind === 'iniciativa' && ctx.forwardSchedule && (
              <ForwardBadge forward={ctx.forwards?.[t.id]} schedule={ctx.forwardSchedule} name={memberName(ctx.members, ctx.forwards?.[t.id]?.member_id ?? null)} />
            )}
          </div>
          <div className="mt-1 font-medium">{title}</div>
          {i.kind === 'subtarea' ? (
            <button className="text-xs text-stone-500 hover:underline dark:text-stone-400" onClick={onOpen}>
              en «{t.title}»
            </button>
          ) : (
            t.description && (
              <div className="text-sm text-stone-600 dark:text-stone-300">
                <div className={moreText ? 'whitespace-pre-line' : 'line-clamp-2'}>{t.description}</div>
                {t.description.length > 140 && (
                  <button className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setMoreText((v) => !v)}>
                    {moreText ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
              </div>
            )
          )}
          {t.observation && i.kind === 'iniciativa' && <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">💬 {t.observation}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <DueText due={i.due} />
            {i.kind === 'iniciativa' && subs.length > 0 && (
              <button className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? '▾' : '▸'} Subtareas {subs.length - openSubs}/{subs.length}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className={detailBtn} onClick={onOpen}>
              Ver detalle →
            </button>
            {t.email_id && (
              <button className={`${btn} px-3 py-1.5 text-xs`} onClick={() => setEmailOpen(true)}>
                ✉ Ver correo
              </button>
            )}
          </div>
          {confirm && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              {openSubs === 1 ? 'Queda 1 subtarea abierta' : `Quedan ${openSubs} subtareas abiertas`}. ¿Terminar la iniciativa igual?
              <button className={`${btn} px-2 py-0.5 text-xs`} onClick={finish}>
                Sí, terminar
              </button>
              <button className={`${btn} px-2 py-0.5 text-xs`} onClick={() => setConfirm(false)}>
                No
              </button>
            </div>
          )}
          {error && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</div>}
          {expanded && i.kind === 'iniciativa' && (
            <div className="mt-2">
              <SubtaskEditor task={t} subtasks={subs} members={ctx.members} canEdit={canAct} run={runSub} />
            </div>
          )}
          {emailOpen && <EmailModal task={t} members={ctx.members} schedule={ctx.forwardSchedule} onClose={() => setEmailOpen(false)} />}
        </div>
      </div>
    </div>
  )
}

function DoneRow({ item: i, ctx, canAct, onReopen, onOpen }: { item: Item; ctx: BoardCtx; canAct: boolean; onReopen: () => void; onOpen: () => void }) {
  const t = i.task
  const title = i.kind === 'subtarea' ? i.sub.title : t.title
  const day = localDay(i.doneAt!)
  const today = todayISO()
  const when = day === today ? `hoy ${timeOf(i.doneAt!)}` : day === addDays(today, -1) ? `ayer ${timeOf(i.doneAt!)}` : shortDate(day)
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${i.cancelled ? 'bg-stone-200 text-stone-500 dark:bg-stone-800' : 'bg-emerald-500 text-white'}`}
        aria-hidden="true"
      >
        {i.cancelled ? '–' : '✓'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindTag item={i} ctx={ctx} />
          <BrandChips ids={brandIdsOf(t)} brands={ctx.brands} hideEmpty />
        </div>
        <div className={`mt-0.5 ${i.cancelled ? 'text-stone-400 line-through' : 'text-stone-700 dark:text-stone-200'}`}>{title}</div>
        <div className="text-xs text-stone-500 dark:text-stone-400">
          {i.cancelled ? 'Cancelada' : 'Terminada'} {when}
          {i.kind === 'subtarea' && (
            <>
              {' · '}
              <button className="hover:underline" onClick={onOpen}>
                en «{t.title}»
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button className={detailBtn} onClick={onOpen}>
          Ver detalle →
        </button>
        {canAct && !i.cancelled && (
          <button className={`${btn} px-2 py-1 text-xs`} onClick={onReopen} title="Volver a Pendientes">
            Reabrir
          </button>
        )}
      </div>
    </div>
  )
}
