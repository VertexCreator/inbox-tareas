import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isOverdue, memberName, shortDate, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { ItemStatus, ListItem, ListRow, PlanTemplate, Priority } from '../lib/types'
import { PlanPanel } from '../components/PlanPanel'
import { Avatar, Card, Empty, PriorityBadge, btn, btnPrimary, input } from '../components/ui'

const STATUS: Record<ItemStatus, { label: string; cls: string }> = {
  sin_planificar: { label: 'Sin planificar', cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' },
  planificando: { label: 'Recomendación lista', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' },
  planificado: { label: 'En tareas', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' },
  descartado: { label: 'Descartado', cls: 'bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500' },
}

export function Listas() {
  const { isAdmin, member } = useAuth()
  const { tasks, subtasks, members, reload: reloadBoard } = useBoard()
  const [lists, setLists] = useState<ListRow[]>([])
  const [items, setItems] = useState<ListItem[]>([])
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [planning, setPlanning] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      .channel('list-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const current = lists.find((l) => l.id === selected) ?? lists.find((l) => !l.is_inbox) ?? lists[0]
  const rows = useMemo(
    () => items.filter((i) => i.list_id === current?.id && (showClosed || i.status !== 'descartado')),
    [items, current?.id, showClosed],
  )
  const openCount = (listId: string) => items.filter((i) => i.list_id === listId && (i.status === 'sin_planificar' || i.status === 'planificando')).length

  const remove = async (item: ListItem) => {
    const { error } = await supabase.from('list_items').delete().eq('id', item.id)
    if (error) setError(error.message)
    else load()
  }

  const discard = async (item: ListItem) => {
    const { error } = await supabase.from('list_items').update({ status: 'descartado' }).eq('id', item.id)
    if (error) setError(error.message)
    else load()
  }

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
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              setSelected(l.id)
              setPlanning(null)
            }}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              current?.id === l.id
                ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
            }`}
          >
            {l.is_inbox ? '✉ ' : ''}
            {l.name}
            {openCount(l.id) > 0 && <span className="ml-1.5 text-xs opacity-70">{openCount(l.id)}</span>}
          </button>
        ))}
        {isAdmin && <NewList onCreated={(id) => { setSelected(id); load() }} />}
      </div>

      {current && (
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
              {current.is_inbox
                ? 'Aquí aparecen los pendientes que el agente detecta en tus correos.'
                : 'Esta lista está vacía. Agrega el primer pendiente abajo.'}
            </Empty>
          )}
          {rows.map((item) => {
            const task = tasks.find((t) => t.id === item.task_id)
            const subs = subtasks.filter((s) => s.task_id === item.task_id)
            const owner = task?.assignee_id ?? null
            const canDelete = isAdmin || (item.created_by === member?.id && item.status === 'sin_planificar')
            const due = task?.due_date ?? item.due_date
            const overdue = isOverdue(due, task?.status === 'hecho')
            return (
              <div key={item.id} className="border-t border-stone-200 first:border-t-0 md:first:border-t dark:border-stone-800">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_150px_150px_90px_150px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {item.priority && <PriorityBadge priority={item.priority} />}
                      <span className={`truncate font-medium ${item.status === 'descartado' ? 'text-stone-400 line-through' : ''}`}>{item.title}</span>
                    </div>
                    {item.notes && <div className="truncate text-xs text-stone-500 dark:text-stone-400">{item.notes}</div>}
                    <div className="text-[11px] text-stone-400">
                      {item.created_by ? `Lo agregó ${memberName(members, item.created_by) ?? 'alguien'}` : 'Lo agregó el agente'}
                    </div>
                  </div>
                  <span className="justify-self-end md:justify-self-start">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] ${task?.status === 'hecho' ? STATUS.planificado.cls : STATUS[item.status].cls}`}>
                      {task?.status === 'hecho' ? 'Terminado' : STATUS[item.status].label}
                    </span>
                    {subs.length > 0 && (
                      <span className="ml-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                        {subs.filter((s) => s.done).length}/{subs.length}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    {owner ? (
                      <>
                        <Avatar name={memberName(members, owner) ?? '?'} id={owner} />
                        {memberName(members, owner)}
                      </>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </span>
                  <span className={`text-xs ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'}`}>
                    {shortDate(due)}
                  </span>
                  <span className="col-span-2 flex flex-wrap justify-end gap-1.5 md:col-span-1">
                    {isAdmin && (item.status === 'sin_planificar' || item.status === 'planificando') && (
                      <button
                        className={item.status === 'planificando' ? btnPrimary : btn}
                        onClick={() => setPlanning(planning === item.id ? null : item.id)}
                      >
                        {planning === item.id ? 'Cerrar' : item.status === 'planificando' ? 'Revisar plan' : 'Planificar'}
                      </button>
                    )}
                    {item.status === 'planificado' && (
                      <Link className={btn} to="/tablero">
                        Ver tarea
                      </Link>
                    )}
                    {isAdmin && item.status === 'sin_planificar' && (
                      <button className={btn} onClick={() => discard(item)} aria-label="Descartar pendiente">
                        Descartar
                      </button>
                    )}
                    {canDelete && item.status === 'sin_planificar' && !isAdmin && (
                      <button className={`${btn} text-red-600 dark:text-red-400`} onClick={() => remove(item)}>
                        Borrar
                      </button>
                    )}
                  </span>
                </div>
                {planning === item.id && (
                  <PlanPanel
                    item={item}
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
                )}
              </div>
            )
          })}
          <NewItem listId={current.id} onCreated={load} />
        </Card>
      )}
    </div>
  )
}

function NewItem({ listId, onCreated }: { listId: string; onCreated: () => void }) {
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
    })
    setBusy(false)
    if (error) return setError(error.message)
    setTitle('')
    setNotes('')
    setDue('')
    setPriority('')
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
        <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Prioridad">
          <option value="">Prioridad</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
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
