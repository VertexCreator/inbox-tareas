import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { QuickAssign } from '../components/QuickAssign'
import { useSearchParams } from 'react-router-dom'
import { BrandOverview, BrandSummary, BrandTab, NewBrand, NewInitiative } from '../components/BoardParts'
import { BrandChips, brandIdsOf, isMultibrand } from '../components/Brands'
import { AgencyChip, EMPTY_FILTERS, FilterBar, NONE, matches, useStored, useStoredString } from '../components/Filters'
import { ForwardBadge } from '../components/ForwardStatus'
import { InitiativeCard, InitiativeDetail, StickerPill, SuggestedBrand, type BoardCtx } from '../components/Initiative'
import { NewList } from '../components/ListParts'
import { PlanPanel } from '../components/PlanPanel'
import { NewStageColumn, StageHeader } from '../components/Stages'
import { dotClass } from '../components/colors'
import { Avatar, Card, Empty, PriorityBadge, btn, btnDetail, btnPrimary, input } from '../components/ui'
import { useAuth } from '../lib/auth'
import { isOverdue, memberName, shortDate, todayISO, updateTask, useBoard } from '../lib/data'
import { useForwards } from '../lib/forwards'
import { supabase, uniqueChannel } from '../lib/supabase'
import type { ListItem, ListRow, PlanTemplate, Priority, Subtask, Task } from '../lib/types'
import { useUndo } from '../lib/undo'

// Iniciativas: todo el trabajo del equipo en un solo flujo, de la idea a terminada.
// "Por planificar" son las ideas y pedidos de las listas que todavía no tienen responsable; al planificarlas
// pasan a las etapas del tablero. Las vistas y los filtros valen para todo.

const ALL = 'todas'
const MULTI = 'multi'

type View = 'tablero' | 'lista' | 'marca' | 'persona' | 'prioridad' | 'agencia' | 'calendario'
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'tablero', label: 'Tablero', icon: '▥' },
  { id: 'lista', label: 'Lista', icon: '☰' },
  { id: 'marca', label: 'Por marca', icon: '◆' },
  { id: 'persona', label: 'Por persona', icon: '●' },
  { id: 'prioridad', label: 'Por prioridad', icon: '▲' },
  { id: 'agencia', label: 'Por agencia', icon: '■' },
  { id: 'calendario', label: 'Calendario', icon: '▦' },
]

const PLAN_LABEL: Record<string, string> = { sin_planificar: 'Por planificar', planificando: 'Plan listo para revisar', descartado: 'Descartado' }

// Una fila es algo "Por planificar" (de una lista) o una iniciativa (del tablero).
interface Row {
  key: string
  kind: 'plan' | 'iniciativa'
  item?: ListItem
  task?: Task
  title: string
  notes: string | null
  due: string | null
  priority: Priority | null
  brandIds: string[]
  agencyId: string | null
  owner: string | null
  people: string[]
  subs: Subtask[]
  listId: string | null
  done: boolean
  closed: boolean
}

export function Iniciativas() {
  const { isAdmin, member } = useAuth()
  const { tasks, subtasks, members, brands, stickers, agencies, error, reload } = useBoard()
  const { track } = useUndo()
  const [params] = useSearchParams()
  const [lists, setLists] = useState<ListRow[]>([])
  const [items, setItems] = useState<ListItem[]>([])
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [brandTab, setBrandTab] = useState<string>(ALL)
  const [listFilter, setListFilter] = useState<string>(params.get('lista') ?? ALL)
  const [view, setView] = useStoredString('teamflow.iniciativas.vista', 'tablero') as [View, (v: View) => void]
  const [filters, setFilters] = useStored('teamflow.iniciativas.filtros', EMPTY_FILTERS)
  const [showDone, setShowDone] = useState(true)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [openId, setOpenId] = useState<string | null>(params.get('abrir'))
  const [planning, setPlanning] = useState<string | null>(params.get('plan'))
  const [creating, setCreating] = useState(false)
  const [newList, setNewList] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const { byTask: forwards, schedule: forwardSchedule } = useForwards()
  const ctx: BoardCtx = { members, brands, stickers, subtasks, agencies, forwards, forwardSchedule }

  const loadLists = useCallback(async () => {
    const [l, i, t, s] = await Promise.all([
      supabase.from('lists').select('*').eq('archived', false).order('is_inbox', { ascending: false }).order('created_at'),
      supabase.from('list_items').select('*').order('created_at'),
      supabase.from('plan_templates').select('*').order('usage_count', { ascending: false }),
      supabase.from('skills').select('name').order('name'),
    ])
    setLists((l.data ?? []) as ListRow[])
    setItems((i.data ?? []) as ListItem[])
    setTemplates((t.data ?? []) as PlanTemplate[])
    setSkills((s.data ?? []).map((x) => x.name as string))
  }, [])

  useEffect(() => {
    loadLists()
    const channel = supabase
      .channel(uniqueChannel('iniciativas-items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => loadLists())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadLists])

  const reloadAll = () => {
    reload()
    loadLists()
  }

  // Todas las filas: lo por planificar (sin tarea todavía) y todas las iniciativas.
  const allRows: Row[] = useMemo(() => {
    const plan: Row[] = items
      .filter((i) => !i.task_id && (i.status === 'sin_planificar' || i.status === 'planificando' || (i.status === 'descartado' && showDiscarded)))
      .map((i) => ({
        key: `i-${i.id}`,
        kind: 'plan',
        item: i,
        title: i.title,
        notes: i.notes,
        due: i.due_date,
        priority: i.priority,
        brandIds: brandIdsOf(i),
        agencyId: i.agency_id,
        owner: null,
        people: [],
        subs: [],
        listId: i.list_id,
        done: false,
        closed: i.status === 'descartado',
      }))
    const inits: Row[] = tasks.map((t) => {
      const subs = subtasks.filter((s) => s.task_id === t.id)
      const owner = t.assignee_id ?? t.suggested_assignee_id
      const cat = stickers.find((s) => s.id === t.sticker_id)?.category
      return {
        key: `t-${t.id}`,
        kind: 'iniciativa',
        task: t,
        item: items.find((i) => i.id === t.list_item_id),
        title: t.title,
        notes: t.description,
        due: t.due_date,
        priority: t.priority,
        brandIds: brandIdsOf(t),
        agencyId: t.agency_id,
        owner,
        people: [...new Set([owner, ...subs.map((s) => s.assignee_id)].filter((x): x is string => !!x))],
        subs,
        listId: items.find((i) => i.id === t.list_item_id)?.list_id ?? null,
        done: cat === 'terminado',
        closed: cat === 'terminado' || cat === 'cancelado',
      }
    })
    return [...plan, ...inits]
  }, [items, tasks, subtasks, stickers, showDiscarded])

  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (brandTab === 'sin' && r.brandIds.length) return false
        if (brandTab === MULTI && r.brandIds.length < 2) return false
        if (brandTab !== ALL && brandTab !== 'sin' && brandTab !== MULTI && !r.brandIds.includes(brandTab)) return false
        if (listFilter !== ALL && r.listId !== listFilter) return false
        if (!showDone && r.closed && r.kind === 'iniciativa') return false
        return matches(filters, { text: `${r.title} ${r.notes ?? ''} ${r.task?.observation ?? ''}`, brandIds: r.brandIds, agencyId: r.agencyId, priority: r.priority, people: r.people })
      }),
    [allRows, brandTab, listFilter, showDone, filters],
  )

  const planItem = items.find((i) => i.id === planning)
  const open = tasks.find((t) => t.id === openId)
  const liveBrands = brands.filter((b) => !b.archived)
  const planCount = allRows.filter((r) => r.kind === 'plan' && !r.closed).length
  const brandCount = (fn: (r: Row) => boolean) => allRows.filter((r) => !r.closed && fn(r)).length
  const visibleTasks = rows.filter((r) => r.task).map((r) => r.task!)

  const discard = async (item: ListItem) => {
    const { error } = await supabase.from('list_items').update({ status: 'descartado' }).eq('id', item.id)
    if (error) return setMsg(error.message)
    loadLists()
    track(`Descartaste «${item.title}»`, async () => {
      const { error } = await supabase.from('list_items').update({ status: item.status }).eq('id', item.id)
      if (error) throw new Error(error.message)
    }, { after: loadLists })
  }
  const remove = async (item: ListItem) => {
    const { error } = await supabase.from('list_items').delete().eq('id', item.id)
    if (error) setMsg(error.message)
    loadLists()
  }

  const rctx: RowCtx = {
    board: ctx,
    lists,
    isAdmin,
    memberId: member?.id ?? null,
    showList: listFilter === ALL,
    onOpen: (r) => (r.task ? setOpenId(r.task.id) : isAdmin && r.item && setPlanning(r.item.id)),
    onPlan: (id) => setPlanning(id),
    onDiscard: discard,
    onRemove: remove,
    onAccepted: reloadAll,
  }

  const defaultList = (listFilter !== ALL && lists.find((l) => l.id === listFilter)) || lists.find((l) => l.name === 'Tareas manuales') || lists.find((l) => !l.is_inbox) || lists[0]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-medium">Iniciativas</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Todo el trabajo del equipo, de la idea a terminada. Lo nuevo entra en <b>Por planificar</b>.</p>
        </div>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <button className={btnPrimary} onClick={() => setCreating((v) => !v)}>
              {creating ? 'Cerrar' : 'Nueva iniciativa'}
            </button>
          )}
        </div>
      </div>

      {(error || msg) && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{msg ?? error}</div>}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2 dark:border-stone-800">
        <BrandTab active={brandTab === ALL} onClick={() => setBrandTab(ALL)} label="Todas las marcas" count={brandCount(() => true)} />
        {liveBrands.map((b) => (
          <BrandTab key={b.id} active={brandTab === b.id} onClick={() => setBrandTab(b.id)} label={b.name} color={b.color} count={brandCount((r) => r.brandIds.includes(b.id))} />
        ))}
        {brandCount((r) => r.brandIds.length > 1) > 0 && <BrandTab active={brandTab === MULTI} onClick={() => setBrandTab(MULTI)} label="Multimarca" count={brandCount((r) => r.brandIds.length > 1)} />}
        {brandCount((r) => !r.brandIds.length) > 0 && <BrandTab active={brandTab === 'sin'} onClick={() => setBrandTab('sin')} label="Sin marca" count={brandCount((r) => !r.brandIds.length)} />}
        {isAdmin && <NewBrand onCreated={(id) => setBrandTab(id)} />}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-2">
          <FilterBar value={filters} onChange={setFilters} brands={brands} agencies={agencies} members={members} hide={['brands']} placeholder="Buscar…" />
          <select className={`${input} py-1.5 text-xs ${listFilter !== ALL ? 'border-indigo-400 text-indigo-700 dark:text-indigo-300' : ''}`} value={listFilter} onChange={(e) => setListFilter(e.target.value)} aria-label="Lista">
            <option value={ALL}>Todas las listas</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                Lista: {l.is_inbox ? '✉ ' : ''}
                {l.name}
              </option>
            ))}
          </select>
          {isAdmin && (
            <button className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setNewList((v) => !v)}>
              + Lista
            </button>
          )}
        </div>
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

      {newList && isAdmin && (
        <NewList
          onCreated={(id) => {
            setNewList(false)
            setListFilter(id)
            loadLists()
          }}
        />
      )}

      <div className="flex flex-wrap gap-4 text-xs text-stone-500 dark:text-stone-400">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Mostrar terminadas
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
          Mostrar descartadas
        </label>
        {view === 'tablero' && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
            Ocultar columnas vacías
          </label>
        )}
      </div>

      {creating && isAdmin && (
        <NewInitiative
          ctx={ctx}
          defaultBrand={brandTab !== ALL && brandTab !== 'sin' && brandTab !== MULTI ? brandTab : ''}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      {view === 'tablero' &&
        (brandTab === ALL ? (
          <BrandOverview brands={liveBrands} tasks={tasks} ctx={ctx} onPick={setBrandTab} />
        ) : (
          <BrandSummary tasks={visibleTasks} ctx={ctx} brand={brands.find((b) => b.id === brandTab)} label={brandTab === MULTI ? 'Multimarca' : undefined} />
        ))}

      {view === 'tablero' && (
        <Pipeline
          rows={rows}
          rctx={rctx}
          hideEmpty={hideEmpty}
          brandTab={brandTab}
          defaultListId={defaultList?.id ?? null}
          planCount={planCount}
          onAdded={loadLists}
          onChanged={reload}
          onError={setMsg}
        />
      )}
      {view === 'lista' && <ListView rows={rows} rctx={rctx} />}
      {(view === 'marca' || view === 'persona' || view === 'prioridad' || view === 'agencia') && <GroupedView by={view} rows={rows} rctx={rctx} />}
      {view === 'calendario' && <CalendarView rows={rows} rctx={rctx} />}

      {planItem && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={() => setPlanning(null)}>
          <aside className="h-full w-full max-w-3xl overflow-y-auto bg-stone-50 shadow-xl dark:bg-stone-950" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Planificar ${planItem.title}`}>
            <div className="flex items-center justify-between px-4 pt-4">
              <div>
                <div className="text-xs text-stone-500">📝 Por planificar</div>
                <h2 className="font-medium">{planItem.title}</h2>
              </div>
              <button className={btn} onClick={() => setPlanning(null)}>
                Cerrar
              </button>
            </div>
            <PlanPanel
              item={planItem}
              brands={brands}
              members={members}
              templates={templates}
              skills={skills}
              onClose={() => {
                setPlanning(null)
                loadLists()
              }}
              onConfirmed={() => {
                setPlanning(null)
                reloadAll()
              }}
            />
          </aside>
        </div>
      )}

      {open && <InitiativeDetail task={open} ctx={ctx} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

interface RowCtx {
  board: BoardCtx
  lists: ListRow[]
  isAdmin: boolean
  memberId: string | null
  showList: boolean
  onOpen: (r: Row) => void
  onPlan: (itemId: string) => void
  onDiscard: (item: ListItem) => void
  onRemove: (item: ListItem) => void
  onAccepted: () => void
}

// ---------------------------------------------------------------------------
// Tablero: "Por planificar" + las etapas
// ---------------------------------------------------------------------------

function Pipeline({
  rows,
  rctx,
  hideEmpty,
  brandTab,
  defaultListId,
  planCount,
  onAdded,
  onChanged,
  onError,
}: {
  rows: Row[]
  rctx: RowCtx
  hideEmpty: boolean
  brandTab: string
  defaultListId: string | null
  planCount: number
  onAdded: () => void
  onChanged: () => void
  onError: (m: string | null) => void
}) {
  const { board: ctx, isAdmin, memberId } = rctx
  const { stickers } = ctx
  const { track } = useUndo()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [moved, setMoved] = useState<Record<string, string>>({})
  const inits = rows.filter((r) => r.kind === 'iniciativa').map((r) => r.task!)
  const plan = rows.filter((r) => r.kind === 'plan')
  const stageOf = (t: Task) => moved[t.id] ?? t.sticker_id
  const canMove = (t: Task) => isAdmin || (!!memberId && (t.assignee_id ?? t.suggested_assignee_id) === memberId)

  const drop = async (stageId: string) => {
    const t = inits.find((x) => x.id === dragId)
    setDragId(null)
    setOverStage(null)
    if (!t || stageOf(t) === stageId) return
    if (!canMove(t)) return onError('Solo el responsable o el gerente pueden mover esta iniciativa.')
    onError(null)
    setMoved((m) => ({ ...m, [t.id]: stageId }))
    try {
      const prev = t.sticker_id
      await updateTask(t.id, { sticker_id: stageId })
      track(`Moviste «${t.title}» a ${stickers.find((s) => s.id === stageId)?.name ?? 'otra etapa'}`, () => updateTask(t.id, { sticker_id: prev }), { after: onChanged })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo mover.')
    }
    setMoved((m) => {
      const next = { ...m }
      delete next[t.id]
      return next
    })
    onChanged()
  }

  const columns = stickers.filter((s) => !hideEmpty || inits.some((t) => stageOf(t) === s.id))

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex items-start gap-3" style={{ minWidth: `${(columns.length + 1 + (isAdmin ? 1 : 0)) * 252}px` }}>
        <section className="flex min-h-32 w-64 shrink-0 flex-col gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-2.5 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center justify-between px-0.5">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100" title="Ideas y pedidos que todavía no tienen responsable">
              📝 Por planificar
            </span>
            <span className="text-xs text-stone-500">{planCount}</span>
          </div>
          {plan.map((r) => (
            <PlanCard key={r.key} row={r} rctx={rctx} />
          ))}
          {plan.length === 0 && <div className="px-1 py-3 text-center text-[11px] text-stone-500">Nada por planificar.</div>}
          {defaultListId && <QuickAddPlan listId={defaultListId} listName={rctx.lists.find((l) => l.id === defaultListId)?.name ?? ''} onAdded={onAdded} />}
        </section>

        {columns.map((s) => {
          const list = inits.filter((t) => stageOf(t) === s.id)
          return (
            <section
              key={s.id}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                setOverStage(s.id)
              }}
              onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                drop(s.id)
              }}
              className={`flex min-h-32 w-60 shrink-0 flex-col gap-2 rounded-xl p-2.5 transition ${
                overStage === s.id ? 'bg-indigo-50 ring-2 ring-indigo-300 dark:bg-indigo-950/40 dark:ring-indigo-800' : 'bg-stone-100 dark:bg-stone-900/60'
              }`}
            >
              <StageHeader stage={s} stages={stickers} count={list.length} isAdmin={isAdmin} onChanged={onChanged} onError={onError} />
              {list.map((t) => (
                <div
                  key={t.id}
                  draggable={canMove(t)}
                  onDragStart={(e) => {
                    setDragId(t.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverStage(null)
                  }}
                  className={`${canMove(t) ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === t.id ? 'opacity-40' : ''}`}
                >
                  <InitiativeCard task={t} ctx={ctx} onOpen={() => rctx.onOpen({ key: t.id, kind: 'iniciativa', task: t } as Row)} showBrand={brandTab === ALL || brandTab === 'sin' || isMultibrand(t)} />
                </div>
              ))}
              {list.length === 0 && <div className="rounded-lg border border-dashed border-stone-300 px-2 py-4 text-center text-[11px] text-stone-400 dark:border-stone-700">Arrastra aquí</div>}
            </section>
          )
        })}
        {isAdmin && <NewStageColumn nextPosition={stickers.length} onCreated={onChanged} />}
      </div>
    </div>
  )
}

// Agregar algo por planificar sin salir del tablero.
function QuickAddPlan({ listId, listName, onAdded }: { listId: string; listName: string; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const { error } = await supabase.from('list_items').insert({ list_id: listId, title: title.trim() })
    if (error) return setError(error.message)
    setTitle('')
    setError(null)
    onAdded()
  }
  return (
    <form onSubmit={submit} className="pt-1">
      <input
        className={`${input} w-full py-1.5 text-xs`}
        placeholder={`+ Agregar a ${listName || 'la lista'} (Enter)`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Agregar por planificar"
      />
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
    </form>
  )
}

function PlanActions({ row: r, rctx, compact = false }: { row: Row; rctx: RowCtx; compact?: boolean }) {
  const item = r.item!
  const mine = !rctx.isAdmin && item.created_by === rctx.memberId && item.status === 'sin_planificar'
  const small = 'text-[11px] font-medium hover:underline'
  return (
    <span className="flex flex-wrap items-center gap-2">
      {rctx.isAdmin && item.status !== 'descartado' && <QuickAssign item={item} members={rctx.board.members} onDone={rctx.onAccepted} compact={compact} />}
      {rctx.isAdmin && item.status !== 'descartado' && (
        <button className={compact ? `${small} text-indigo-600 dark:text-indigo-400` : item.status === 'planificando' ? btnPrimary : btnDetail} onClick={() => rctx.onPlan(item.id)}>
          {item.status === 'planificando' ? 'Revisar plan' : 'Planificar con subtareas →'}
        </button>
      )}
      {rctx.isAdmin && item.status === 'sin_planificar' && (
        <button className={compact ? `${small} text-stone-500` : btn} onClick={() => rctx.onDiscard(item)}>
          Descartar
        </button>
      )}
      {mine && (
        <button className={compact ? `${small} text-red-600` : `${btn} text-red-600`} onClick={() => rctx.onRemove(item)}>
          Borrar
        </button>
      )}
    </span>
  )
}

function planStatus(item: ListItem) {
  if (item.auto_plan && item.status === 'sin_planificar') return 'Plan en camino ✦'
  return PLAN_LABEL[item.status] ?? item.status
}

function PlanCard({ row: r, rctx }: { row: Row; rctx: RowCtx }) {
  const item = r.item!
  const { board } = rctx
  const overdue = isOverdue(r.due, false)
  const listName = rctx.lists.find((l) => l.id === item.list_id)?.name
  return (
    <div className={`rounded-lg border bg-white p-2.5 text-xs dark:bg-stone-900 ${item.status === 'planificando' ? 'border-indigo-300 dark:border-indigo-800' : 'border-stone-200 dark:border-stone-800'} ${r.closed ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-1">
        {r.priority && <PriorityBadge priority={r.priority} />}
        <BrandChips ids={r.brandIds} brands={board.brands} hideEmpty />
        {item.suggested_brand && <SuggestedBrand itemId={item.id} name={item.suggested_brand} brands={board.brands} isAdmin={rctx.isAdmin} onAccepted={rctx.onAccepted} />}
        <AgencyChip agency={board.agencies?.find((a) => a.id === r.agencyId)} />
      </div>
      <div className={`mt-1 text-[13px] font-medium ${r.closed ? 'line-through' : ''}`}>{r.title}</div>
      {r.notes && <div className="mt-0.5 line-clamp-2 text-stone-500 dark:text-stone-400">{r.notes}</div>}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-stone-500 dark:text-stone-400">
        <span className={item.status === 'planificando' ? 'font-medium text-indigo-700 dark:text-indigo-300' : ''}>{planStatus(item)}</span>
        <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>{r.due ? shortDate(r.due) : ''}</span>
      </div>
      <div className="mt-0.5 truncate text-[10px] text-stone-400">
        {item.created_by ? `De ${memberName(board.members, item.created_by) ?? 'alguien'}` : 'Del agente'}
        {listName ? ` · ${listName}` : ''}
      </div>
      <div className="mt-1.5">
        <PlanActions row={r} rctx={rctx} compact />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vistas para todo (por planificar + iniciativas)
// ---------------------------------------------------------------------------

function StageOf({ row: r, rctx }: { row: Row; rctx: RowCtx }) {
  if (r.kind === 'plan') {
    return <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 dark:bg-amber-900 dark:text-amber-100">📝 {planStatus(r.item!)}</span>
  }
  return <StickerPill sticker={rctx.board.stickers.find((s) => s.id === r.task!.sticker_id)} />
}

function RowCard({ row: r, rctx }: { row: Row; rctx: RowCtx }) {
  if (r.kind === 'plan') return <PlanCard row={r} rctx={rctx} />
  const t = r.task!
  const { board } = rctx
  const overdue = isOverdue(r.due, r.closed)
  const ownerName = memberName(board.members, r.owner)
  const done = r.subs.filter((s) => s.done).length
  return (
    <button onClick={() => rctx.onOpen(r)} className={`w-full rounded-lg border border-stone-200 bg-white p-2.5 text-left text-xs hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900 ${r.closed ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-1">
        {t.recurring_id && <span title="Tarea repetitiva">🔁</span>}
        {r.priority && <PriorityBadge priority={r.priority} />}
        <BrandChips ids={r.brandIds} brands={board.brands} hideEmpty />
        <AgencyChip agency={board.agencies?.find((a) => a.id === r.agencyId)} />
      </div>
      <div className={`mt-1 text-[13px] font-medium ${r.done ? 'line-through' : ''}`}>{r.title}</div>
      {r.notes && <div className="mt-0.5 line-clamp-2 text-stone-500 dark:text-stone-400">{r.notes}</div>}
      {r.subs.length > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / r.subs.length) * 100)}%` }} />
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-stone-500 dark:text-stone-400">
        <span className="flex flex-wrap items-center gap-1.5">
          <StageOf row={r} rctx={rctx} />
          <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>{r.due ? (overdue ? `venció ${shortDate(r.due)}` : shortDate(r.due)) : 'sin fecha'}</span>
          {r.subs.length > 0 && <span>· {done}/{r.subs.length}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          {board.forwardSchedule && <ForwardBadge forward={board.forwards?.[t.id]} schedule={board.forwardSchedule} name={memberName(board.members, board.forwards?.[t.id]?.member_id ?? null)} />}
          {r.owner && ownerName ? <Avatar name={ownerName} id={r.owner} /> : <span>Sin responsable</span>}
        </span>
      </div>
    </button>
  )
}

function ListView({ rows, rctx }: { rows: Row[]; rctx: RowCtx }) {
  const sorted = [...rows].sort((a, b) => (a.kind === b.kind ? (a.due ?? '9999').localeCompare(b.due ?? '9999') : a.kind === 'plan' ? -1 : 1))
  if (!sorted.length) return <Card><Empty>Nada coincide con los filtros.</Empty></Card>
  return (
    <Card className="overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_170px_150px_90px_150px] gap-3 bg-stone-50 px-4 py-2 text-xs text-stone-500 md:grid dark:bg-stone-900/60 dark:text-stone-400">
        <span>Nombre</span>
        <span>Etapa</span>
        <span>Responsable</span>
        <span>Límite</span>
        <span />
      </div>
      {sorted.map((r) => {
        const overdue = isOverdue(r.due, r.closed)
        const ownerName = memberName(rctx.board.members, r.owner)
        const listName = rctx.lists.find((l) => l.id === r.listId)?.name
        return (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-stone-200 px-4 py-2.5 text-sm first:border-t-0 md:grid-cols-[minmax(0,1fr)_170px_150px_90px_150px] dark:border-stone-800">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {r.task?.recurring_id && <span title="Tarea repetitiva">🔁</span>}
                {r.priority && <PriorityBadge priority={r.priority} />}
                <BrandChips ids={r.brandIds} brands={rctx.board.brands} hideEmpty />
                <AgencyChip agency={rctx.board.agencies?.find((a) => a.id === r.agencyId)} />
                <span className={`truncate font-medium ${r.closed ? 'text-stone-400 line-through' : ''}`}>{r.title}</span>
              </div>
              {r.notes && <div className="truncate text-xs text-stone-500 dark:text-stone-400">{r.notes}</div>}
              {rctx.showList && listName && <div className="text-[11px] text-stone-400">{listName}</div>}
            </div>
            <span className="justify-self-end md:justify-self-start">
              <StageOf row={r} rctx={rctx} />
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              {r.owner && ownerName ? (
                <>
                  <Avatar name={ownerName} id={r.owner} />
                  {ownerName}
                </>
              ) : (
                <span className="text-stone-400">—</span>
              )}
            </span>
            <span className={`text-xs ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'}`}>{shortDate(r.due)}</span>
            <span className="col-span-2 flex flex-wrap justify-end gap-1.5 md:col-span-1">
              {r.kind === 'plan' ? (
                <PlanActions row={r} rctx={rctx} />
              ) : (
                <button className={btnDetail} onClick={() => rctx.onOpen(r)}>
                  Ver detalle →
                </button>
              )}
            </span>
          </div>
        )
      })}
    </Card>
  )
}

interface Group {
  key: string
  label: string
  dot?: string
  rows: Row[]
}

function groupsFor(by: 'marca' | 'persona' | 'prioridad' | 'agencia', rows: Row[], ctx: BoardCtx): Group[] {
  const withRows = (g: Group[]) => g.filter((x) => x.rows.length > 0)
  if (by === 'marca') {
    return withRows([
      ...ctx.brands.map((b) => ({ key: b.id, label: b.name, dot: dotClass(b.color), rows: rows.filter((r) => r.brandIds.includes(b.id)) })),
      { key: NONE, label: 'Sin marca', rows: rows.filter((r) => r.brandIds.length === 0) },
    ])
  }
  if (by === 'agencia') {
    return withRows([
      ...(ctx.agencies ?? []).map((a) => ({ key: a.id, label: a.name, dot: dotClass(a.color), rows: rows.filter((r) => r.agencyId === a.id) })),
      { key: NONE, label: 'Sin agencia', rows: rows.filter((r) => !r.agencyId) },
    ])
  }
  if (by === 'persona') {
    return withRows([
      ...ctx.members.map((m) => ({ key: m.id, label: m.name, rows: rows.filter((r) => r.owner === m.id) })),
      { key: NONE, label: 'Sin responsable (incluye lo por planificar)', rows: rows.filter((r) => !r.owner) },
    ])
  }
  return withRows([
    { key: 'P1', label: 'P1 · hoy', dot: 'bg-red-500', rows: rows.filter((r) => r.priority === 'P1') },
    { key: 'P2', label: 'P2 · esta semana', dot: 'bg-amber-500', rows: rows.filter((r) => r.priority === 'P2') },
    { key: 'P3', label: 'P3 · cuando se pueda', dot: 'bg-stone-400', rows: rows.filter((r) => r.priority === 'P3') },
    { key: NONE, label: 'Sin prioridad', rows: rows.filter((r) => !r.priority) },
  ])
}

function GroupedView({ by, rows, rctx }: { by: 'marca' | 'persona' | 'prioridad' | 'agencia'; rows: Row[]; rctx: RowCtx }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const groups = groupsFor(by, rows, rctx.board)
  if (groups.length === 0) return <Card><Empty>Nada coincide con los filtros.</Empty></Card>
  return (
    <div className="space-y-3">
      {by === 'agencia' && !(rctx.board.agencies ?? []).length && (
        <p className="text-xs text-stone-500 dark:text-stone-400">Aún no hay agencias. El gerente las crea en Configuración → Marcas, etapas y agencias.</p>
      )}
      {groups.map((g) => {
        const live = g.rows.filter((r) => !(r.kind === 'plan' && r.closed))
        const done = g.rows.filter((r) => r.done).length
        const plan = g.rows.filter((r) => r.kind === 'plan' && !r.closed).length
        const late = g.rows.filter((r) => isOverdue(r.due, r.closed)).length
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
                {plan > 0 && <span className="text-amber-700 dark:text-amber-300">{plan} por planificar</span>}
                {late > 0 && <span className="text-red-600 dark:text-red-400">{late} vencidas</span>}
                <span>
                  {done}/{live.length} terminadas
                </span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-stone-100 sm:block dark:bg-stone-800">
                  <span className="block h-full bg-emerald-500" style={{ width: `${live.length ? Math.round((done / live.length) * 100) : 0}%` }} />
                </span>
              </span>
            </button>
            {!isClosed && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.rows.map((r) => (
                  <RowCard key={r.key} row={r} rctx={rctx} />
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

function CalendarView({ rows, rctx }: { rows: Row[]; rctx: RowCtx }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [openDay, setOpenDay] = useState<string | null>(null)
  const today = todayISO()
  const start = new Date(month)
  start.setDate(1 - ((month.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const cut = days.findIndex((d, i) => i % 7 === 0 && d.getMonth() !== month.getMonth() && i > 27)
  const shown = cut > 0 ? days.slice(0, cut) : days
  const live = rows.filter((r) => !(r.kind === 'plan' && r.closed))
  const byDay = (day: string) => live.filter((r) => r.due === day)
  const undated = live.filter((r) => !r.due && !r.closed)
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
                className={`min-h-20 border-t border-l border-stone-200 p-1 text-left align-top first:border-l-0 dark:border-stone-800 ${out ? 'bg-stone-50/60 text-stone-400 dark:bg-stone-900/40' : ''} ${openDay === day ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
              >
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${day === today ? 'bg-indigo-600 font-medium text-white' : ''}`}>{d.getDate()}</span>
                <div className="mt-0.5 space-y-0.5">
                  {mine.slice(0, 3).map((r) => (
                    <div
                      key={r.key}
                      className={`truncate rounded px-1 py-0.5 text-[10px] ${
                        r.done
                          ? 'bg-emerald-50 text-emerald-700 line-through dark:bg-emerald-950 dark:text-emerald-300'
                          : r.kind === 'plan'
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                            : day < today
                              ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
                      }`}
                      title={r.title}
                    >
                      {r.kind === 'plan' ? '📝 ' : ''}
                      {r.title}
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
            <RowCard key={r.key} row={r} rctx={rctx} />
          ))}
        </Section>
      )}
      {undated.length > 0 && (
        <Section title={`Sin fecha límite · ${undated.length}`}>
          {undated.map((r) => (
            <RowCard key={r.key} row={r} rctx={rctx} />
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
