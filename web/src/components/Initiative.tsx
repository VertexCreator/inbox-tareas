import { useEffect, useState, type FormEvent } from 'react'
import { useUndo } from '../lib/undo'
import { ForwardBadge } from './ForwardStatus'
import type { ForwardRow, ForwardSchedule } from '../lib/forwards'
import { TaskEmail } from './TaskEmail'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  addSubtask,
  approveTask,
  deleteSubtask,
  isOverdue,
  memberName,
  memberOption,
  relativeShort,
  shortDate,
  updateSubtask,
  updateTask,
} from '../lib/data'
import type { Agency, Brand, Member, Sticker, Subtask, Task } from '../lib/types'
import { AgencyChip } from './Filters'
import { chipClass } from './colors'
import { LinkedEmail } from './LinkedEmail'
import { BrandChips, BrandPicker, brandIdsOf } from './Brands'
import { Avatar, PriorityBadge, btn, btnPrimary, input } from './ui'

export interface BoardCtx {
  members: Member[]
  brands: Brand[]
  stickers: Sticker[]
  subtasks: Subtask[]
  agencies?: Agency[]
  forwards?: Record<string, ForwardRow>
  forwardSchedule?: ForwardSchedule
}

export function StickerPill({ sticker }: { sticker?: Sticker | null }) {
  if (!sticker) return null
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${chipClass(sticker.color)}`}>{sticker.name}</span>
}

export { BrandChip } from './Brands'

// Tarjeta compacta del tablero.
export function InitiativeCard({ task, ctx, onOpen, showBrand = true }: { task: Task; ctx: BoardCtx; onOpen: () => void; showBrand?: boolean }) {
  const subs = ctx.subtasks.filter((s) => s.task_id === task.id)
  const done = subs.filter((s) => s.done).length
  const owner = task.assignee_id ?? task.suggested_assignee_id
  const ownerName = memberName(ctx.members, owner)
  const sticker = ctx.stickers.find((s) => s.id === task.sticker_id)
  const closed = sticker?.category === 'terminado' || sticker?.category === 'cancelado'
  const overdue = isOverdue(task.due_date, closed)
  const pending = task.needs_approval && !task.assignee_id

  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-lg border bg-white p-2.5 text-left text-xs transition hover:border-stone-400 dark:bg-stone-900 dark:hover:border-stone-600 ${
        pending ? 'border-amber-300 dark:border-amber-800' : 'border-stone-200 dark:border-stone-800'
      } ${closed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1">
          {showBrand && <BrandChips ids={brandIdsOf(task)} brands={ctx.brands} />}
          <AgencyChip agency={ctx.agencies?.find((a) => a.id === task.agency_id)} />
        </span>
        {task.priority === 'P1' && <PriorityBadge priority="P1" />}
      </div>
      <div className={`mt-1 text-[13px] font-medium ${sticker?.category === 'cancelado' ? 'line-through' : ''}`}>{task.title}</div>
      {task.description && <div className="mt-0.5 line-clamp-2 text-stone-500 dark:text-stone-400">{task.description}</div>}
      {task.observation && (
        <div className="mt-1.5 rounded bg-amber-50 px-1.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">💬 {task.observation}</div>
      )}
      {subs.length > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / subs.length) * 100)}%` }} />
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-stone-500 dark:text-stone-400">
        <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>
          {subs.length > 0 && `${done}/${subs.length} · `}
          {task.due_date ? (overdue ? `venció ${shortDate(task.due_date)}` : shortDate(task.due_date)) : 'sin fecha'}
        </span>
        <span className="flex items-center gap-1.5">
          {ctx.forwardSchedule && <ForwardBadge forward={ctx.forwards?.[task.id]} schedule={ctx.forwardSchedule} name={memberName(ctx.members, ctx.forwards?.[task.id]?.member_id ?? null)} />}
          {pending ? (
            <span className="text-amber-700 dark:text-amber-300">Sugerido: {ownerName ?? '—'}</span>
          ) : owner && ownerName ? (
            <Avatar name={ownerName} id={owner} />
          ) : (
            <span>Sin responsable</span>
          )}
        </span>
      </div>
    </button>
  )
}

// Panel lateral con todo el detalle. Cada campo se guarda al cambiarlo.
export function InitiativeDetail({ task, ctx, onClose, onChanged }: { task: Task; ctx: BoardCtx; onClose: () => void; onChanged: () => void }) {
  const { isAdmin, member } = useAuth()
  const owner = task.assignee_id ?? task.suggested_assignee_id
  const isOwner = !!member && owner === member.id
  const canStatus = isAdmin || isOwner
  const subs = ctx.subtasks.filter((s) => s.task_id === task.id)
  const pending = task.needs_approval && !task.assignee_id
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [observation, setObservation] = useState(task.observation ?? '')

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setObservation(task.observation ?? '')
  }, [task.id, task.title, task.description, task.observation])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  // Cada cambio queda con "↶ Deshacer": se guarda el valor anterior de lo que se cambió.
  const { track } = useUndo()
  const change = (patch: Parameters<typeof updateTask>[1], label: string) =>
    run(async () => {
      const current = task as unknown as Record<string, unknown>
      const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, current[k] ?? null])) as Parameters<typeof updateTask>[1]
      await updateTask(task.id, patch)
      track(label, () => updateTask(task.id, prev), { after: onChanged })
    })
  const owners = ctx.members.filter((m) => m.active && m.can_own)

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-stone-50 p-5 shadow-xl dark:bg-stone-950"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Iniciativa ${task.title}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          {isAdmin ? (
            <BrandPicker
              value={brandIdsOf(task)}
              brands={ctx.brands}
              onChange={(ids) => change({ brand_ids: ids }, `Cambiaste las marcas de «${task.title}»`)}
            />
          ) : (
            <BrandChips ids={brandIdsOf(task)} brands={ctx.brands} />
          )}
          <button className={btn} onClick={onClose} aria-label="Cerrar">
            Cerrar
          </button>
        </div>

        {isAdmin ? (
          <input
            id={`ini-title-${task.id}`}
            className="w-full bg-transparent text-xl font-medium outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && change({ title: title.trim() }, `Renombraste «${task.title}»`)}
            aria-label="Nombre de la iniciativa"
          />
        ) : (
          <h2 className="text-xl font-medium">{task.title}</h2>
        )}

        {error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-[13px] text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

        <section className="mt-4">
          <div className="mb-1.5 text-xs text-stone-500 dark:text-stone-400">Etapa{!canStatus && ' (la cambia el responsable o el gerente)'}</div>
          <div className="flex flex-wrap gap-1.5">
            {ctx.stickers.map((s) => {
              const active = s.id === task.sticker_id
              return (
                <button
                  key={s.id}
                  disabled={!canStatus || active}
                  onClick={() => change({ sticker_id: s.id }, `Moviste «${task.title}» a ${s.name}`)}
                  className={`rounded-full px-2.5 py-1 text-xs transition ${chipClass(s.color)} ${
                    active ? 'ring-2 ring-stone-800 ring-offset-1 dark:ring-stone-200 dark:ring-offset-stone-950' : canStatus ? 'opacity-60 hover:opacity-100' : 'opacity-40'
                  }`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-stone-500 dark:text-stone-400">Responsable</span>
            {isAdmin ? (
              <select
                className={`${input} w-full`}
                value={task.assignee_id ?? ''}
                onChange={(e) => e.target.value && change({ assignee_id: e.target.value }, `Asignaste «${task.title}» a ${memberName(ctx.members, e.target.value) ?? 'otra persona'}`)}
              >
                {!task.assignee_id && <option value="">{pending ? `Sugerido: ${memberName(ctx.members, owner) ?? '—'}` : 'Elige…'}</option>}
                {owners.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberOption(m, task.specialty)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex items-center gap-2">
                {owner && <Avatar name={memberName(ctx.members, owner) ?? '?'} id={owner} />}
                {memberName(ctx.members, owner) ?? 'Sin responsable'}
              </span>
            )}
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-stone-500 dark:text-stone-400">Fecha límite</span>
            {isAdmin ? (
              <input
                type="date"
                className={`${input} w-full`}
                value={task.due_date ?? ''}
                onChange={(e) => change({ due_date: e.target.value || null }, `Cambiaste la fecha de «${task.title}»`)}
              />
            ) : (
              <span className={isOverdue(task.due_date, task.status === 'hecho') ? 'text-red-600' : ''}>{shortDate(task.due_date)}</span>
            )}
          </label>
          {(isAdmin || task.agency_id) && (ctx.agencies?.length ?? 0) > 0 && (
            <label className="space-y-1">
              <span className="block text-xs text-stone-500 dark:text-stone-400">Agencia</span>
              {isAdmin ? (
                <select className={`${input} w-full`} value={task.agency_id ?? ''} onChange={(e) => change({ agency_id: e.target.value || null }, `Cambiaste la agencia de «${task.title}»`)}>
                  <option value="">Sin agencia</option>
                  {ctx.agencies
                    ?.filter((a) => !a.archived || a.id === task.agency_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              ) : (
                <AgencyChip agency={ctx.agencies?.find((a) => a.id === task.agency_id)} />
              )}
            </label>
          )}
        </section>

        {pending && isAdmin && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <span className="flex-1">{task.assignment_reason}</span>
            <button className={btnPrimary} onClick={() => run(() => approveTask(task.id))}>
              Aprobar sugerencia
            </button>
          </div>
        )}

        <section className="mt-4">
          <div className="mb-1 text-xs text-stone-500 dark:text-stone-400">Descripción</div>
          {isAdmin ? (
            <textarea
              id={`ini-desc-${task.id}`}
              className={`${input} w-full`}
              rows={3}
              placeholder="Qué hay que hacer, entregables, contexto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (task.description ?? '') && change({ description: description.trim() || null }, `Editaste la descripción de «${task.title}»`)}
            />
          ) : (
            <p className="whitespace-pre-line text-sm">{task.description || <span className="text-stone-400">Sin descripción</span>}</p>
          )}
        </section>

        {isAdmin && <LinkedEmail task={task} onChanged={onChanged} />}
        <TaskEmail task={task} members={ctx.members} schedule={ctx.forwardSchedule} />

        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="mb-1 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
            <span>Observación (se ve en el tablero)</span>
            {task.observation_at && (
              <span className="text-amber-700/70 dark:text-amber-300/70">
                {task.observation_by} · {relativeShort(task.observation_at)}
              </span>
            )}
          </div>
          {canStatus ? (
            <>
              <textarea
                id={`ini-obs-${task.id}`}
                className={`${input} w-full`}
                rows={2}
                placeholder="Ej. Falta el logo en vectores del cliente"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  className={btnPrimary}
                  disabled={observation === (task.observation ?? '')}
                  onClick={() => change({ observation: observation.trim() || null }, `Guardaste la observación de «${task.title}»`)}
                >
                  Guardar observación
                </button>
                {task.observation && (
                  <button className={btn} onClick={() => change({ observation: null }, `Quitaste la observación de «${task.title}»`)}>
                    Quitar
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-900 dark:text-amber-100">{task.observation || 'Sin observaciones.'}</p>
          )}
        </section>

        <SubtaskEditor task={task} subtasks={subs} members={ctx.members} canEdit={isAdmin || isOwner} run={run} />

        {task.assignment_reason && !pending && (
          <p className="mt-4 text-[11px] text-stone-400">Asignación: {task.assignment_reason}</p>
        )}
      </aside>
    </div>
  )
}

export function SubtaskEditor({
  task,
  subtasks,
  members,
  canEdit,
  run,
}: {
  task: Task
  subtasks: Subtask[]
  members: Member[]
  canEdit: boolean
  run: (fn: () => Promise<void>) => Promise<void>
}) {
  const { member } = useAuth()
  const { track } = useUndo()
  const [title, setTitle] = useState('')
  const [who, setWho] = useState('')
  const [due, setDue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const done = subtasks.filter((s) => s.done).length

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Escribe la subtarea.')
    setError(null)
    await run(() => addSubtask(task.id, title, subtasks.length, who || member?.id || null, due || null))
    setTitle('')
    setDue('')
  }

  return (
    <section className="mt-5">
      <div className="mb-1.5 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
        <span>
          Subtareas · {done}/{subtasks.length}
        </span>
        {subtasks.length > 0 && <span>{Math.round((done / subtasks.length) * 100)}%</span>}
      </div>
      <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
        {subtasks.length === 0 && <div className="px-3 py-3 text-sm text-stone-500">Sin subtareas todavía.</div>}
        {subtasks.map((s) => {
          const mine = s.assignee_id === member?.id
          const overdue = isOverdue(s.due_date, s.done)
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={s.done}
                disabled={!canEdit && !mine}
                onChange={(e) => {
                  const done = e.target.checked
                  run(async () => {
                    await updateSubtask(s.id, { done })
                    track(done ? `Marcaste «${s.title}» como hecha` : `Reabriste «${s.title}»`, () => updateSubtask(s.id, { done: !done }))
                  })
                }}
                aria-label={`Marcar "${s.title}"`}
              />
              {canEdit ? (
                <input
                  className={`min-w-0 flex-1 bg-transparent outline-none ${s.done ? 'text-stone-400 line-through' : ''}`}
                  defaultValue={s.title}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && run(() => updateSubtask(s.id, { title: e.target.value.trim() }))}
                  aria-label="Título de la subtarea"
                />
              ) : (
                <span className={`min-w-0 flex-1 ${s.done ? 'text-stone-400 line-through' : ''}`}>{s.title}</span>
              )}
              {canEdit ? (
                <>
                  <select
                    className="max-w-36 rounded border border-stone-200 bg-transparent px-1 py-0.5 text-[11px] dark:border-stone-700"
                    value={s.assignee_id ?? ''}
                    onChange={(e) => run(() => updateSubtask(s.id, { assignee_id: e.target.value || null }))}
                    aria-label="Responsable de la subtarea"
                  >
                    <option value="">Sin asignar</option>
                    {members
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="date"
                    className={`rounded border border-stone-200 bg-transparent px-1 py-0.5 text-[11px] dark:border-stone-700 ${overdue ? 'text-red-600' : ''}`}
                    value={s.due_date ?? ''}
                    onChange={(e) => run(() => updateSubtask(s.id, { due_date: e.target.value || null }))}
                    aria-label="Fecha de la subtarea"
                  />
                  <button className="px-1 text-stone-400 hover:text-red-600" onClick={() =>
                    run(async () => {
                      await deleteSubtask(s.id)
                      track(`Borraste la subtarea «${s.title}»`, () => addSubtask(task.id, s.title, s.position, s.assignee_id, s.due_date))
                    })
                  }
                  aria-label="Borrar subtarea">
                    ×
                  </button>
                </>
              ) : (
                <span className={`text-[11px] ${overdue ? 'text-red-600' : 'text-stone-500'}`}>
                  {memberName(members, s.assignee_id) ?? 'Sin asignar'} · {shortDate(s.due_date)}
                </span>
              )}
            </div>
          )
        })}
        {canEdit && (
          <form onSubmit={add} className="flex flex-wrap items-center gap-2 bg-stone-50 px-3 py-2 dark:bg-stone-900/60" noValidate>
            <input
              id={`new-sub-${task.id}`}
              className={`${input} min-w-40 flex-1 py-1`}
              placeholder="+ Nueva subtarea"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
            />
            <select className={`${input} py-1 text-xs`} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Responsable">
              <option value="">Yo</option>
              {members
                .filter((m) => m.active && m.id !== member?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <input type="date" className={`${input} py-1 text-xs`} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha" />
            <button className={btnPrimary} type="submit">
              Agregar
            </button>
          </form>
        )}
      </div>
      {error && <div className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </section>
  )
}


// Marca que el agente dedujo del correo y aún no existe (o no se asignó). El gerente la crea o la asigna con un clic.
export function SuggestedBrand({
  itemId,
  name,
  brands,
  isAdmin,
  onAccepted,
}: {
  itemId: string
  name: string
  brands: Brand[]
  isAdmin: boolean
  onAccepted?: (brandId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existing = brands.find((b) => !b.archived && (b.name.toLowerCase() === name.trim().toLowerCase() || b.aliases?.some((a) => a.toLowerCase() === name.trim().toLowerCase())))

  const accept = async () => {
    setBusy(true)
    setError(null)
    if (existing) {
      const { error } = await supabase.from('list_items').update({ brand_id: existing.id }).eq('id', itemId)
      setBusy(false)
      if (error) return setError(error.message)
      return onAccepted?.(existing.id)
    }
    const { data, error } = await supabase.rpc('accept_suggested_brand', { p_item_id: itemId })
    setBusy(false)
    if (error) return setError(error.message)
    onAccepted?.(data as string)
  }

  const dismiss = async () => {
    const { error } = await supabase.from('list_items').update({ suggested_brand: null }).eq('id', itemId)
    if (error) setError(error.message)
    else onAccepted?.('')
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="rounded border border-dashed border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 dark:border-violet-700 dark:text-violet-300" title="Marca que el agente dedujo del correo">
        ✦ ¿Marca: {name}?
      </span>
      {isAdmin && (
        <>
          <button className="rounded px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950" onClick={accept} disabled={busy}>
            {existing ? `Asignar ${existing.name}` : 'Crear y asignar'}
          </button>
          <button className="px-1 text-[10px] text-stone-400 hover:text-stone-700" onClick={dismiss} aria-label="Descartar marca sugerida">
            ×
          </button>
        </>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
