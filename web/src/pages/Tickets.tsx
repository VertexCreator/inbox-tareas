import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrandChips, brandIdsOf, hasBrand } from '../components/Brands'
import { useAuth } from '../lib/auth'
import { isOverdue, memberName, progress, shortDate, todayISO, updateSubtask, updateTask, useBoard } from '../lib/data'
import type { Task } from '../lib/types'
import { chipClass } from '../components/colors'
import { InitiativeDetail, StickerPill, SubtaskEditor, type BoardCtx } from '../components/Initiative'
import { Card, Empty, SectionTitle, btn, input } from '../components/ui'

// Vista tipo ticket: todo lo que tiene que hacer una persona, con su desglose.
export function Tickets() {
  const { member, isAdmin } = useAuth()
  const { tasks, subtasks, members, brands, stickers, agencies, reload } = useBoard()
  const [who, setWho] = useState<string>('')
  const [brand, setBrand] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  // El correo de asignación enlaza aquí con ?abrir=<iniciativa>.
  const [params] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(params.get('abrir'))
  const ctx: BoardCtx = { members, brands, stickers, subtasks, agencies }

  const personId = (isAdmin && who) || member?.id || ''
  const person = members.find((m) => m.id === personId)
  const cat = (t: Task) => stickers.find((s) => s.id === t.sticker_id)?.category
  const isClosed = (t: Task) => cat(t) === 'terminado' || cat(t) === 'cancelado'

  const owned = tasks
    .filter((t) => (t.assignee_id ?? t.suggested_assignee_id) === personId)
    .filter((t) => !brand || hasBrand(t, brand))
    .filter((t) => showClosed || !isClosed(t))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  const helping = subtasks
    .filter((s) => s.assignee_id === personId && (showClosed || !s.done))
    .map((s) => ({ s, t: tasks.find((t) => t.id === s.task_id) }))
    .filter((x): x is { s: (typeof subtasks)[number]; t: Task } => !!x.t && (x.t.assignee_id ?? x.t.suggested_assignee_id) !== personId)
    .filter((x) => !brand || hasBrand(x.t, brand))
    .sort((a, b) => (a.s.due_date ?? '9999').localeCompare(b.s.due_date ?? '9999'))

  const allMine = tasks.filter((t) => (t.assignee_id ?? t.suggested_assignee_id) === personId)
  const overall = progress(allMine, stickers)
  const overdue = allMine.filter((t) => isOverdue(t.due_date, isClosed(t))).length
  const myBrands = brands.filter((b) => allMine.some((t) => hasBrand(t, b.id)) || helping.some((h) => hasBrand(h.t, b.id)))
  const open = tasks.find((t) => t.id === openId)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">{personId === member?.id ? 'Mis tickets' : `Tickets de ${person?.name ?? ''}`}</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {owned.length} iniciativas a cargo · {helping.length} subtareas en otras · {overall.pct}% terminado
            {overdue > 0 && <span className="text-red-600 dark:text-red-400"> · {overdue} vencidas</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <select className={input} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Ver tickets de">
              <option value="">Mis tickets</option>
              {members
                .filter((m) => m.active && m.id !== member?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Mostrar terminados
          </label>
        </div>
      </div>

      {myBrands.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setBrand('')} className={`rounded-lg px-3 py-1 text-xs ${!brand ? 'bg-stone-200 font-medium dark:bg-stone-700' : 'bg-stone-100 dark:bg-stone-900'}`}>
            Todas
          </button>
          {myBrands.map((b) => (
            <button key={b.id} onClick={() => setBrand(b.id)} className={`rounded-lg px-3 py-1 text-xs ${brand === b.id ? `${chipClass(b.color)} font-medium` : 'bg-stone-100 dark:bg-stone-900'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      <section>
        <SectionTitle>Iniciativas a cargo</SectionTitle>
        <div className="space-y-3">
          {owned.length === 0 && (
            <Card>
              <Empty>No hay iniciativas a cargo{brand ? ' en esta marca' : ''}.</Empty>
            </Card>
          )}
          {owned.map((t) => (
            <Ticket key={t.id} task={t} ctx={ctx} onOpen={() => setOpenId(t.id)} onChanged={reload} canEdit={isAdmin || t.assignee_id === member?.id} />
          ))}
        </div>
      </section>

      {helping.length > 0 && (
        <section>
          <SectionTitle>Subtareas en iniciativas de otros</SectionTitle>
          <Card className="divide-y divide-stone-200 dark:divide-stone-800">
            {helping.map(({ s, t }) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={s.done}
                  disabled={personId !== member?.id && !isAdmin}
                  onChange={(e) => updateSubtask(s.id, { done: e.target.checked }).then(reload)}
                  aria-label={`Marcar "${s.title}"`}
                />
                <div className="min-w-0 flex-1">
                  <div className={s.done ? 'text-stone-400 line-through' : 'font-medium'}>{s.title}</div>
                  <button className="text-xs text-stone-500 hover:underline dark:text-stone-400" onClick={() => setOpenId(t.id)}>
                    {t.title} · responsable {memberName(members, t.assignee_id) ?? '—'}
                  </button>
                </div>
                <BrandChips ids={brandIdsOf(t)} brands={brands} />
                <span className={`text-xs ${isOverdue(s.due_date, s.done) ? 'font-medium text-red-600' : 'text-stone-500'}`}>{shortDate(s.due_date)}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {open && <InitiativeDetail task={open} ctx={ctx} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

function Ticket({ task, ctx, onOpen, onChanged, canEdit }: { task: Task; ctx: BoardCtx; onOpen: () => void; onChanged: () => void; canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const sticker = ctx.stickers.find((s) => s.id === task.sticker_id)
  const subs = ctx.subtasks.filter((s) => s.task_id === task.id)
  const closed = sticker?.category === 'terminado' || sticker?.category === 'cancelado'
  const overdue = isOverdue(task.due_date, closed)
  const dueSoon = !closed && task.due_date === todayISO()

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <Card className={`p-4 ${overdue ? 'border-red-200 dark:border-red-900' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrandChips ids={brandIdsOf(task)} brands={ctx.brands} />
            <StickerPill sticker={sticker} />
            <span className={`text-xs ${overdue ? 'font-medium text-red-600 dark:text-red-400' : dueSoon ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-stone-500'}`}>
              {task.due_date ? `${overdue ? 'Venció' : dueSoon ? 'Vence hoy' : 'Vence'} ${shortDate(task.due_date)}` : 'Sin fecha límite'}
            </span>
          </div>
          <div className="mt-1 text-base font-medium">{task.title}</div>
          {task.description && <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">{task.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <select
              className={`${input} py-1 text-xs`}
              value={task.sticker_id ?? ''}
              onChange={(e) => run(() => updateTask(task.id, { sticker_id: e.target.value }))}
              aria-label="Cambiar etapa"
            >
              {ctx.stickers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button className={btn} onClick={onOpen}>
            Detalle
          </button>
        </div>
      </div>
      {task.observation && (
        <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">💬 {task.observation}</div>
      )}
      {error && <div className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
      <SubtaskEditor task={task} subtasks={subs} members={ctx.members} canEdit={canEdit} run={run} />
    </Card>
  )
}
