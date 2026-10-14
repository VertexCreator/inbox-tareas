import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useUndo } from '../lib/undo'
import { useForwards, type ForwardRow, type ForwardSchedule } from '../lib/forwards'
import { ForwardBadge } from '../components/ForwardStatus'
import { BrandChips, BrandPicker, brandIdsOf } from '../components/Brands'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isOverdue, memberName, shortDate, todayISO, useBoard } from '../lib/data'
import { supabase, uniqueChannel } from '../lib/supabase'
import type { Agency, Brand, ItemStatus, ListItem, ListRow, Member, PlanTemplate, Priority, Subtask, Task } from '../lib/types'
import { SuggestedBrand } from '../components/Initiative'
import { PlanPanel } from '../components/PlanPanel'
import { AgencyChip, EMPTY_FILTERS, FilterBar, NONE, matches, useStored, useStoredString } from '../components/Filters'
import { dotClass } from '../components/colors'
import { Avatar, Card, Empty, PriorityBadge, btn, btnPrimary, input } from '../components/ui'

// Dónde va cada pendiente: su estado en la lista o, si ya es tarea, si se terminó.
type Stage = ItemStatus | 'terminado'

const STAGE: Record<Stage, { label: string; cls: string; dot: string }> = {
  sin_planificar: { label: 'Sin planificar', cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300', dot: 'bg-stone-400' },
  planificando: { label: 'Recomendación lista', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200', dot: 'bg-indigo-500' },
  planificado: { label: 'En tareas', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200', dot: 'bg-sky-500' },
  terminado: { label: 'Terminado', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200', dot: 'bg-emerald-500' },
  descartado: { label: 'Descartado', cls: 'bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500', dot: 'bg-stone-300' },
}
const STAGE_ORDER: Stage[] = ['sin_planificar', 'planificando', 'planificado', 'terminado', 'descartado']

type View = 'lista' | 'kanban' | 'marca' | 'persona' | 'prioridad' | 'agencia' | 'calendario'
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'lista', label: 'Lista', icon: '☰' },
  { id: 'kanban', label: 'Kanban', icon: '▥' },
  { id: 'marca', label: 'Por marca', icon: '◆' },
  { id: 'persona', label: 'Por persona', icon: '●' },
  { id: 'prioridad', label: 'Por prioridad', icon: '▲' },
  { id: 'agencia', label: 'Por agencia', icon: '■' },
  { id: 'calendario', label: 'Calendario', icon: '▦' },
]
const ALL_LISTS = 'todas'

interface Row {
  item: ListItem
  task?: Task
  subs: Subtask[]
  owner: string | null
  due: string | null
  priority: Priority | null
  stage: Stage
  brandIds: string[]
  agencyId: string | null
  people: string[]
}

interface Ctx {
  brands: Brand[]
  agencies: Agency[]
  members: Member[]
  lists: ListRow[]
  isAdmin: boolean
  showList: boolean
  planning: string | null
  onPlan: (id: string | null) => void
  onAccepted: () => void
  forwards: Record<string, ForwardRow>
  forwardSchedule: ForwardSchedule
}

export function Listas() {
  const { isAdmin, member } = useAuth()
  const { tasks, subtasks, members, brands, agencies, reload: reloadBoard } = useBoard()
  const [lists, setLists] = useState<ListRow[]>([])
  const [items, setItems] = useState<ListItem[]>([])
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('lista'))
  const [planning, setPlanning] = useState<string | null>(params.get('plan'))
  const [showClosed, setShowClosed] = useState(false)
  const [view, setView] = useStoredString('teamflow.listas.vista', 'lista') as [View, (v: View) => void]
  const [filters, setFilters] = useStored('teamflow.listas.filtros', EMPTY_FILTERS)
  const [error, setError] = useState<string | null>(null)
  const { byTask: forwards, schedule: forwardSchedule } = useForwards()

  const load = useCallback(async () => {
    const [l, i, t, s] = await Promise.all([
      supabase.from('lists').select('*').eq('archived', false).order('is_inbox', { ascending: false }).order('created_at'),
      supabase.from('list_items').select('*').order('created_at'),
      supabase.from('plan_templates').select('*').order('usage_count', { ascending: false }),
      supabase.from('skills').select('name').order('name'),
    ])
    const err = l.error ?? i.error ?? t.error ?? s.error
    setError(err ? err.message : null)
    setLists((l.data ?? []) as ListRow[])
    setItems((i.data ?? []) as ListItem[])
    setTemplates((t.data ?? []) as PlanTemplate[])
    setSkills((s.data ?? []).map((x) => x.name as string))
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(uniqueChannel('list-items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const allLists = selected === ALL_LISTS
  const current = allLists ? undefined : (lists.find((l) => l.id === selected) ?? lists.find((l) => !l.is_inbox) ?? lists[0])

  const rows: Row[] = useMemo(() => {
    return items
      .filter((i) => allLists || i.list_id === current?.id)
      .map((item) => {
        const task = tasks.find((t) => t.id === item.task_id)
        const subs = subtasks.filter((s) => s.task_id === item.task_id)
        const owner = task ? (task.assignee_id ?? task.suggested_assignee_id) : null
        const people = [...new Set([owner, ...subs.map((s) => s.assignee_id)].filter((x): x is string => !!x))]
        return {
          item,
          task,
          subs,
          owner,
          due: task?.due_date ?? item.due_date,
          priority: task?.priority ?? item.priority,
          stage: task?.status === 'hecho' ? 'terminado' : item.status,
          brandIds: task ? brandIdsOf(task) : brandIdsOf(item),
          agencyId: task?.agency_id ?? item.agency_id,
          people,
        } as Row
      })
      .filter((r) => showClosed || r.stage !== 'descartado')
      .filter((r) =>
        matches(filters, {
          text: `${r.item.title} ${r.item.notes ?? ''} ${r.task?.title ?? ''}`,
          brandIds: r.brandIds,
          agencyId: r.agencyId,
          priority: r.priority,
          people: r.people,
        }),
      )
  }, [items, tasks, subtasks, allLists, current?.id, showClosed, filters])

  const openCount = (listId: string) => items.filter((i) => i.list_id === listId && (i.status === 'sin_planificar' || i.status === 'planificando')).length
  const planItem = items.find((i) => i.id === planning)

  const remove = async (item: ListItem) => {
    const { error } = await supabase.from('list_items').delete().eq('id', item.id)
    if (error) setError(error.message)
    else load()
  }
  const { track } = useUndo()
  const discard = async (item: ListItem) => {
    const { error } = await supabase.from('list_items').update({ status: 'descartado' }).eq('id', item.id)
    if (error) return setError(error.message)
    load()
    track(`Descartaste «${item.title}»`, async () => {
      const { error } = await supabase.from('list_items').update({ status: item.status }).eq('id', item.id)
      if (error) throw new Error(error.message)
    }, { after: load })
  }

  const ctx: Ctx = {
    brands,
    agencies,
    members,
    lists,
    isAdmin,
    showList: allLists,
    planning,
    onPlan: setPlanning,
    onAccepted: () => {
      load()
      reloadBoard()
    },
    forwards,
    forwardSchedule,
  }
  const planPanel = (item: ListItem) => (
    <PlanPanel
      item={item}
      brands={brands}
      members={members}
      templates={templates}
      skills={skills}
      onClose={() => {
        setPlanning(null)
        load()
      }}
      onConfirmed={() => {
        setPlanning(null)
        load()
        reloadBoard()
      }}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Listas de pendientes</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Anota lo que hay que hacer. {isAdmin ? 'Tú lo planificas en tareas y subtareas con ayuda del agente.' : 'El gerente lo convierte en tareas para el equipo.'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Mostrar descartados
        </label>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      <div className="flex flex-wrap items-center gap-1.5">
        <ListTab active={allLists} onClick={() => setSelected(ALL_LISTS)} label="Todas las listas" count={items.filter((i) => i.status === 'sin_planificar' || i.status === 'planificando').length} />
        {lists.map((l) => (
          <ListTab
            key={l.id}
            active={current?.id === l.id}
            onClick={() => {
              setSelected(l.id)
              setPlanning(null)
            }}
            label={`${l.is_inbox ? '✉ ' : ''}${l.name}`}
            count={openCount(l.id)}
          />
        ))}
        {isAdmin && <NewList onCreated={(id) => { setSelected(id); load() }} />}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterBar value={filters} onChange={setFilters} brands={brands} agencies={agencies} members={members} placeholder="Buscar pendiente…" />
        <div className="flex flex-wrap rounded-lg bg-stone-100 p-0.5 dark:bg-stone-900" role="tablist" aria-label="Vista">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${view === v.id ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'}`}
            >
              <span aria-hidden="true" className="mr-1 opacity-60">
                {v.icon}
              </span>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'lista' && (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_150px_90px_150px] gap-3 bg-stone-50 px-4 py-2 text-xs text-stone-500 md:grid dark:bg-stone-900/60 dark:text-stone-400">
            <span>Pendiente</span>
            <span>Estado</span>
            <span>Responsable</span>
            <span>Límite</span>
            <span />
          </div>
          {rows.length === 0 && (
            <Empty>
              {items.length && rows.length === 0 && (filters.q || filters.brands.length || filters.agencies.length || filters.people.length || filters.priorities.length)
                ? 'Ningún pendiente coincide con los filtros.'
                : current?.is_inbox
                  ? 'Aquí aparecen los pendientes que el agente detecta en tus correos.'
                  : 'Esta lista está vacía. Agrega el primer pendiente abajo.'}
            </Empty>
          )}
          {rows.map((r) => (
            <div key={r.item.id} className="border-t border-stone-200 first:border-t-0 md:first:border-t dark:border-stone-800">
              <ItemRow
                row={r}
                ctx={ctx}
                canDelete={!isAdmin && r.item.created_by === member?.id && r.item.status === 'sin_planificar'}
                onDiscard={() => discard(r.item)}
                onRemove={() => remove(r.item)}
              />
              {planning === r.item.id && planPanel(r.item)}
            </div>
          ))}
          {current && <NewItem listId={current.id} brands={brands.filter((b) => !b.archived)} agencies={agencies.filter((a) => !a.archived)} onCreated={load} />}
        </Card>
      )}

      {view === 'kanban' && <KanbanView rows={rows} ctx={ctx} showClosed={showClosed} />}
      {(view === 'marca' || view === 'persona' || view === 'prioridad' || view === 'agencia') && <GroupedView by={view} rows={rows} ctx={ctx} />}
      {view === 'calendario' && <CalendarView rows={rows} ctx={ctx} />}

      {view !== 'lista' && planItem && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={() => setPlanning(null)}>
          <aside className="h-full w-full max-w-3xl overflow-y-auto bg-stone-50 shadow-xl dark:bg-stone-950" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Planificar ${planItem.title}`}>
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 className="font-medium">{planItem.title}</h2>
              <button className={btn} onClick={() => setPlanning(null)}>
                Cerrar
              </button>
            </div>
            {planPanel(planItem)}
          </aside>
        </div>
      )}
    </div>
  )
}

function ListTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        active
          ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
          : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
    </button>
  )
}

function StagePill({ row }: { row: Row }) {
  const label = row.item.auto_plan && row.stage === 'sin_planificar' ? 'Plan en camino ✦' : STAGE[row.stage].label
  return <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] ${STAGE[row.stage].cls}`}>{label}</span>
}

// Botón principal de cada pendiente: planificar, revisar el plan o ver la tarea.
function ItemAction({ row, ctx, compact = false }: { row: Row; ctx: Ctx; compact?: boolean }) {
  const cls = compact ? 'text-xs text-indigo-600 hover:underline dark:text-indigo-400' : ''
  if (ctx.isAdmin && (row.item.status === 'sin_planificar' || row.item.status === 'planificando')) {
    const open = ctx.planning === row.item.id
    return (
      <button className={compact ? cls : row.item.status === 'planificando' ? btnPrimary : btn} onClick={() => ctx.onPlan(open ? null : row.item.id)}>
        {open ? 'Cerrar' : row.item.status === 'planificando' ? 'Revisar plan' : 'Planificar'}
      </button>
    )
  }
  if (row.item.status === 'planificado') {
    return (
      <Link className={compact ? cls : btn} to="/tablero">
        Ver tarea
      </Link>
    )
  }
  return null
}

function ItemRow({ row: r, ctx, canDelete, onDiscard, onRemove }: { row: Row; ctx: Ctx; canDelete: boolean; onDiscard: () => void; onRemove: () => void }) {
  const overdue = isOverdue(r.due, r.stage === 'terminado')
  const listName = ctx.lists.find((l) => l.id === r.item.list_id)?.name
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_150px_150px_90px_150px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.priority && <PriorityBadge priority={r.priority} />}
          <BrandChips ids={r.brandIds} brands={ctx.brands} hideEmpty />
          {r.item.suggested_brand && <SuggestedBrand itemId={r.item.id} name={r.item.suggested_brand} brands={ctx.brands} isAdmin={ctx.isAdmin} onAccepted={ctx.onAccepted} />}
          <AgencyChip agency={ctx.agencies.find((a) => a.id === r.agencyId)} />
          <span className={`truncate font-medium ${r.stage === 'descartado' ? 'text-stone-400 line-through' : ''}`}>{r.item.title}</span>
        </div>
        {r.item.notes && <div className="truncate text-xs text-stone-500 dark:text-stone-400">{r.item.notes}</div>}
        <div className="text-[11px] text-stone-400">
          {ctx.showList && listName ? `${listName} · ` : ''}
          {r.item.created_by ? `Lo agregó ${memberName(ctx.members, r.item.created_by) ?? 'alguien'}` : 'Lo agregó el agente'}
        </div>
      </div>
      <span className="justify-self-end md:justify-self-start">
        <StagePill row={r} />
        {r.task && (
          <span className="ml-1.5">
            <ForwardBadge forward={ctx.forwards[r.task.id]} schedule={ctx.forwardSchedule} name={memberName(ctx.members, ctx.forwards[r.task.id]?.member_id ?? null)} />
          </span>
        )}
        {r.subs.length > 0 && (
          <span className="ml-1.5 text-[11px] text-stone-500 dark:text-stone-400">
            {r.subs.filter((s) => s.done).length}/{r.subs.length}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        {r.owner ? (
          <>
            <Avatar name={memberName(ctx.members, r.owner) ?? '?'} id={r.owner} />
            {memberName(ctx.members, r.owner)}
          </>
        ) : (
          <span className="text-stone-400">—</span>
        )}
      </span>
      <span className={`text-xs ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'}`}>{shortDate(r.due)}</span>
      <span className="col-span-2 flex flex-wrap justify-end gap-1.5 md:col-span-1">
        <ItemAction row={r} ctx={ctx} />
        {ctx.isAdmin && r.item.status === 'sin_planificar' && (
          <button className={btn} onClick={onDiscard} aria-label="Descartar pendiente">
            Descartar
          </button>
        )}
        {canDelete && (
          <button className={`${btn} text-red-600 dark:text-red-400`} onClick={onRemove}>
            Borrar
          </button>
        )}
      </span>
    </div>
  )
}

// Tarjeta compacta para kanban, grupos y calendario.
function ItemCard({ row: r, ctx, hideStage = false }: { row: Row; ctx: Ctx; hideStage?: boolean }) {
  const overdue = isOverdue(r.due, r.stage === 'terminado' || r.stage === 'descartado')
  const ownerName = memberName(ctx.members, r.owner)
  const done = r.subs.filter((s) => s.done).length
  const listName = ctx.lists.find((l) => l.id === r.item.list_id)?.name
  return (
    <div className={`rounded-lg border border-stone-200 bg-white p-2.5 text-xs dark:border-stone-800 dark:bg-stone-900 ${r.stage === 'descartado' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-1">
        {r.priority && <PriorityBadge priority={r.priority} />}
        <BrandChips ids={r.brandIds} brands={ctx.brands} hideEmpty />
        <AgencyChip agency={ctx.agencies.find((a) => a.id === r.agencyId)} />
      </div>
      <div className={`mt-1 text-[13px] font-medium ${r.stage === 'descartado' ? 'line-through' : ''}`}>{r.item.title}</div>
      {r.item.notes && <div className="mt-0.5 line-clamp-2 text-stone-500 dark:text-stone-400">{r.item.notes}</div>}
      {r.subs.length > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / r.subs.length) * 100)}%` }} />
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-stone-500 dark:text-stone-400">
        <span className="flex flex-wrap items-center gap-1.5">
          {!hideStage && <StagePill row={r} />}
          <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>{r.due ? (overdue ? `venció ${shortDate(r.due)}` : shortDate(r.due)) : 'sin fecha'}</span>
          {r.subs.length > 0 && <span>· {done}/{r.subs.length}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          {r.task && <ForwardBadge forward={ctx.forwards[r.task.id]} schedule={ctx.forwardSchedule} name={memberName(ctx.members, ctx.forwards[r.task.id]?.member_id ?? null)} />}
          {r.owner && ownerName ? <Avatar name={ownerName} id={r.owner} /> : <span>Sin asignar</span>}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-stone-400">{ctx.showList ? listName : ''}</span>
        <ItemAction row={r} ctx={ctx} compact />
      </div>
    </div>
  )
}

function KanbanView({ rows, ctx, showClosed }: { rows: Row[]; ctx: Ctx; showClosed: boolean }) {
  const stages = STAGE_ORDER.filter((s) => s !== 'descartado' || showClosed)
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-3" style={{ minWidth: `${stages.length * 264}px` }}>
        {stages.map((s) => {
          const mine = rows.filter((r) => r.stage === s)
          return (
            <section key={s} className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-stone-100 p-2.5 dark:bg-stone-900/60">
              <div className="flex items-center justify-between px-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className={`h-2 w-2 rounded-full ${STAGE[s].dot}`} aria-hidden="true" />
                  {STAGE[s].label}
                </span>
                <span className="text-xs text-stone-500">{mine.length}</span>
              </div>
              {mine.length === 0 && <div className="px-1 py-3 text-xs text-stone-400">Nada aquí.</div>}
              {mine.map((r) => (
                <ItemCard key={r.item.id} row={r} ctx={ctx} hideStage />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

interface Group {
  key: string
  label: string
  dot?: string
  rows: Row[]
}

function groupsFor(by: 'marca' | 'persona' | 'prioridad' | 'agencia', rows: Row[], ctx: Ctx): Group[] {
  const withRows = (g: Group[]) => g.filter((x) => x.rows.length > 0)
  if (by === 'marca') {
    return withRows([
      ...ctx.brands.map((b) => ({ key: b.id, label: b.name, dot: dotClass(b.color), rows: rows.filter((r) => r.brandIds.includes(b.id)) })),
      { key: NONE, label: 'Sin marca', rows: rows.filter((r) => r.brandIds.length === 0) },
    ])
  }
  if (by === 'agencia') {
    return withRows([
      ...ctx.agencies.map((a) => ({ key: a.id, label: a.name, dot: dotClass(a.color), rows: rows.filter((r) => r.agencyId === a.id) })),
      { key: NONE, label: 'Sin agencia', rows: rows.filter((r) => !r.agencyId) },
    ])
  }
  if (by === 'persona') {
    return withRows([
      ...ctx.members.map((m) => ({ key: m.id, label: m.name, rows: rows.filter((r) => r.owner === m.id) })),
      { key: NONE, label: 'Sin responsable', rows: rows.filter((r) => !r.owner) },
    ])
  }
  return withRows([
    { key: 'P1', label: 'P1 · hoy', dot: 'bg-red-500', rows: rows.filter((r) => r.priority === 'P1') },
    { key: 'P2', label: 'P2 · esta semana', dot: 'bg-amber-500', rows: rows.filter((r) => r.priority === 'P2') },
    { key: 'P3', label: 'P3 · cuando se pueda', dot: 'bg-stone-400', rows: rows.filter((r) => r.priority === 'P3') },
    { key: NONE, label: 'Sin prioridad', rows: rows.filter((r) => !r.priority) },
  ])
}

function GroupedView({ by, rows, ctx }: { by: 'marca' | 'persona' | 'prioridad' | 'agencia'; rows: Row[]; ctx: Ctx }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const groups = groupsFor(by, rows, ctx)
  if (groups.length === 0) return <Card><Empty>Ningún pendiente coincide con los filtros.</Empty></Card>
  return (
    <div className="space-y-3">
      {by === 'agencia' && ctx.agencies.length === 0 && (
        <p className="text-xs text-stone-500 dark:text-stone-400">Aún no hay agencias. El gerente las crea en Configuración → Marcas, etapas y agencias.</p>
      )}
      {groups.map((g) => {
        const done = g.rows.filter((r) => r.stage === 'terminado').length
        const live = g.rows.filter((r) => r.stage !== 'descartado').length
        const late = g.rows.filter((r) => isOverdue(r.due, r.stage === 'terminado' || r.stage === 'descartado')).length
        const isClosed = closed[g.key]
        return (
          <Card key={g.key} className="p-3">
            <button className="flex w-full items-center gap-2 text-left" onClick={() => setClosed({ ...closed, [g.key]: !isClosed })} aria-expanded={!isClosed}>
              <span className="text-xs text-stone-400" aria-hidden="true">
                {isClosed ? '▸' : '▾'}
              </span>
              {by === 'persona' && g.key !== NONE ? <Avatar name={g.label} id={g.key} /> : g.dot && <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} aria-hidden="true" />}
              <span className="font-medium">{g.label}</span>
              <span className="text-xs text-stone-500">{g.rows.length}</span>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400">
                {late > 0 && <span className="text-red-600 dark:text-red-400">{late} vencidos</span>}
                <span>
                  {done}/{live} terminados
                </span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-stone-100 sm:block dark:bg-stone-800">
                  <span className="block h-full bg-emerald-500" style={{ width: `${live ? Math.round((done / live) * 100) : 0}%` }} />
                </span>
              </span>
            </button>
            {!isClosed && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.rows.map((r) => (
                  <ItemCard key={r.item.id} row={r} ctx={ctx} />
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthLabel(d: Date) {
  const m = d.toLocaleDateString('es', { month: 'long' })
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`
}

function CalendarView({ rows, ctx }: { rows: Row[]; ctx: Ctx }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [openDay, setOpenDay] = useState<string | null>(null)
  const today = todayISO()
  const start = new Date(month)
  start.setDate(1 - ((month.getDay() + 6) % 7)) // lunes de la primera semana
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const lastWeekUsed = days.findIndex((d, i) => i % 7 === 0 && d.getMonth() !== month.getMonth() && i > 27)
  const shown = lastWeekUsed > 0 ? days.slice(0, lastWeekUsed) : days
  const byDay = (day: string) => rows.filter((r) => r.due === day && r.stage !== 'descartado')
  const undated = rows.filter((r) => !r.due && r.stage !== 'descartado' && r.stage !== 'terminado')
  const move = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const dayRows = openDay ? byDay(openDay) : []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => move(-1)} aria-label="Mes anterior">
          ‹
        </button>
        <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
        <button className={btn} onClick={() => move(1)} aria-label="Mes siguiente">
          ›
        </button>
        <button className={`${btn} text-xs`} onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Hoy
        </button>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 bg-stone-50 text-center text-[11px] text-stone-500 dark:bg-stone-900/60 dark:text-stone-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1.5">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {shown.map((d) => {
            const day = iso(d)
            const mine = byDay(day)
            const out = d.getMonth() !== month.getMonth()
            return (
              <button
                key={day}
                onClick={() => setOpenDay(mine.length ? (openDay === day ? null : day) : null)}
                className={`min-h-20 border-t border-l border-stone-200 p-1 text-left align-top first:border-l-0 dark:border-stone-800 ${out ? 'bg-stone-50/60 text-stone-400 dark:bg-stone-900/40' : ''} ${
                  openDay === day ? 'ring-2 ring-inset ring-indigo-400' : ''
                }`}
              >
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${day === today ? 'bg-indigo-600 font-medium text-white' : ''}`}>{d.getDate()}</span>
                <div className="mt-0.5 space-y-0.5">
                  {mine.slice(0, 3).map((r) => (
                    <div
                      key={r.item.id}
                      className={`truncate rounded px-1 py-0.5 text-[10px] ${
                        r.stage === 'terminado'
                          ? 'bg-emerald-50 text-emerald-700 line-through dark:bg-emerald-950 dark:text-emerald-300'
                          : day < today
                            ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : r.priority === 'P1'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
                      }`}
                      title={r.item.title}
                    >
                      {r.item.title}
                    </div>
                  ))}
                  {mine.length > 3 && <div className="px-1 text-[10px] text-stone-500">+{mine.length - 3} más</div>}
                </div>
              </button>
            )
          })}
        </div>
      </Card>
      {openDay && dayRows.length > 0 && (
        <Section title={`Vencen el ${shortDate(openDay)}`}>
          {dayRows.map((r) => (
            <ItemCard key={r.item.id} row={r} ctx={ctx} />
          ))}
        </Section>
      )}
      {undated.length > 0 && (
        <Section title={`Sin fecha límite · ${undated.length}`}>
          {undated.map((r) => (
            <ItemCard key={r.item.id} row={r} ctx={ctx} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function NewItem({ listId, brands, agencies, onCreated }: { listId: string; brands: Brand[]; agencies: Agency[]; onCreated: () => void }) {
  const { isAdmin } = useAuth()
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [agency, setAgency] = useState('')
  const [autoPlan, setAutoPlan] = useState(true)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Escribe el pendiente.')
    setBusy(true)
    const { error } = await supabase.from('list_items').insert({
      list_id: listId,
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: due || null,
      priority: priority || null,
      brand_ids: brandIds,
      agency_id: agency || null,
      auto_plan: !isAdmin && autoPlan,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setTitle('')
    setNotes('')
    setDue('')
    setPriority('')
    setBrandIds([])
    onCreated()
  }

  return (
    <form onSubmit={submit} className="border-t border-stone-200 bg-stone-50/60 px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900/40" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`new-item-${listId}`}
          className={`${input} min-w-48 flex-1`}
          placeholder="+ Nuevo pendiente, ej. Campaña de lanzamiento en Instagram"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
        />
        <input className={`${input} w-56`} placeholder="Detalles (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Detalles" />
        <BrandPicker value={brandIds} onChange={setBrandIds} brands={brands} />
        {agencies.length > 0 && (
          <select className={input} value={agency} onChange={(e) => setAgency(e.target.value)} aria-label="Agencia">
            <option value="">Agencia</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Prioridad">
          <option value="">Prioridad</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        {!isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400" title="El agente propone tarea, subtareas y personas; la gerente confirma">
            <input type="checkbox" checked={autoPlan} onChange={(e) => setAutoPlan(e.target.checked)} />
            Pedir plan al agente
          </label>
        )}
        <button className={btnPrimary} type="submit" disabled={busy}>
          Agregar
        </button>
      </div>
      {error && <div className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </form>
  )
}

function NewList({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre.')
    const { data, error } = await supabase.from('lists').insert({ name: name.trim() }).select('id').single()
    if (error) return setError(error.message)
    setName('')
    setOpen(false)
    onCreated(data.id)
  }

  if (!open) {
    return (
      <button className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900" onClick={() => setOpen(true)}>
        + Nueva lista
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5" noValidate>
      <input
        id="new-list-name"
        autoFocus
        className={`${input} py-1`}
        placeholder="Lanzamiento Expo Clean"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
      />
      <button className={btnPrimary} type="submit">
        Crear
      </button>
      <button className={btn} type="button" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
    </form>
  )
}
