import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { allSpecialties, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import { PRIORITY_ORDER, STATUS_LABEL, type Member, type Priority, type TaskStatus } from '../lib/types'
import { TaskCard } from '../components/TaskCard'
import { Card, SectionTitle, btn, btnPrimary, input } from '../components/ui'

const COLUMNS: TaskStatus[] = ['por_hacer', 'en_curso', 'hecho']

export function Tablero() {
  const { isAdmin } = useAuth()
  const { tasks, members, loading, error, reload } = useBoard()
  const [filter, setFilter] = useState<string>('')
  const [creating, setCreating] = useState(false)

  const visible = tasks.filter((t) => {
    if (!filter) return true
    if (filter === 'pendientes') return t.needs_approval && !t.assignee_id
    return (t.assignee_id ?? t.suggested_assignee_id) === filter
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-medium">Tablero del equipo</h1>
        <select className={input} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por persona">
          <option value="">Todo el equipo</option>
          <option value="pendientes">Pendientes de aprobación</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button className={`${btnPrimary} ml-auto`} onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cerrar' : 'Nueva tarea'}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {creating && (
        <NewTaskForm
          members={members}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = visible
            .filter((t) => t.status === col)
            .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
          return (
            <section key={col} className="rounded-xl bg-stone-100 p-3 dark:bg-stone-900/60">
              <SectionTitle>
                {STATUS_LABEL[col]} · {items.length}
              </SectionTitle>
              <div className="space-y-2">
                {loading ? (
                  <div className="text-sm text-stone-400">Cargando…</div>
                ) : (
                  items.map((t) => (
                    <TaskCard key={t.id} task={t} members={members} isAdmin={isAdmin} onChanged={reload} compact={col === 'hecho'} />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function NewTaskForm({ members, onCreated }: { members: Member[]; onCreated: () => void }) {
  const specialties = allSpecialties(members)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [effort, setEffort] = useState(2)
  const [priority, setPriority] = useState<Priority>('P2')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!title.trim()) return setError('Escribe un título para la tarea.')
    setBusy(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      specialty: specialty || null,
      effort_points: effort,
      priority,
      due_date: due || null,
      assignee_id: assignee || null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    onCreated()
  }

  return (
    <Card className="space-y-3 p-4">
      <input
        className={`${input} w-full`}
        placeholder="Preparar propuesta para el cliente"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          setError(null)
        }}
        aria-label="Título"
      />
      <textarea
        className={`${input} w-full`}
        rows={2}
        placeholder="Detalles (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Descripción"
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <select className={input} value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Especialidad">
          <option value="">General</option>
          {specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className={input} value={effort} onChange={(e) => setEffort(Number(e.target.value))} aria-label="Esfuerzo">
          <option value={1}>Chica (1 pt)</option>
          <option value={2}>Mediana (2 pts)</option>
          <option value={3}>Grande (3 pts)</option>
        </select>
        <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Prioridad">
          <option value="P1">P1 · hoy</option>
          <option value="P2">P2 · esta semana</option>
          <option value="P3">P3 · cuando se pueda</option>
        </select>
        <input className={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <select className={input} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Responsable">
          <option value="">Que decida el agente</option>
          {members
            .filter((m) => m.active)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button className={btnPrimary} disabled={busy} onClick={submit}>
          Crear tarea
        </button>
        <button className={btn} onClick={onCreated} disabled={busy}>
          Cancelar
        </button>
        {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </Card>
  )
}
