import { useState } from 'react'
import type { Member, Task, TaskStatus } from '../lib/types'
import { approveTask, memberName, reassignTask, updateTaskStatus } from '../lib/data'
import { Avatar, PriorityBadge, Tag, btn, btnPrimary, input } from './ui'

const FLOW: TaskStatus[] = ['por_hacer', 'en_curso', 'hecho']

interface Props {
  task: Task
  members: Member[]
  isAdmin: boolean
  onChanged: () => void
  compact?: boolean
}

export function TaskCard({ task, members, isAdmin, onChanged, compact = false }: Props) {
  const [correcting, setCorrecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assigneeId = task.assignee_id ?? task.suggested_assignee_id
  const assignee = memberName(members, assigneeId)
  const pending = task.needs_approval && !task.assignee_id
  const idx = FLOW.indexOf(task.status)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`rounded-lg border bg-white p-3 text-sm dark:bg-stone-900 ${
        pending ? 'border-amber-300 dark:border-amber-800' : 'border-stone-200 dark:border-stone-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex min-w-0 items-start gap-2">
          {!pending && (
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              checked={task.status === 'hecho'}
              disabled={busy}
              onChange={(e) => run(() => updateTaskStatus(task.id, e.target.checked ? 'hecho' : 'por_hacer'))}
              aria-label="Marcar como completada"
            />
          )}
          <span className={`font-medium ${task.status === 'hecho' ? 'text-stone-400 line-through' : ''}`}>{task.title}</span>
        </label>
        <PriorityBadge priority={task.priority} />
      </div>

      {!compact && task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">{task.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tag tone={task.specialty ? 'accent' : 'neutral'}>{task.specialty ?? 'General'}</Tag>
        <Tag>{task.effort_points} pts</Tag>
        {task.due_date && <Tag>vence {new Date(task.due_date + 'T00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}</Tag>}
        {task.source === 'correo' && <Tag>desde correo</Tag>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {assigneeId && assignee ? <Avatar name={assignee} id={assigneeId} /> : null}
          <span className="truncate text-xs text-stone-600 dark:text-stone-300">
            {pending ? `Sugerido: ${assignee ?? 'nadie'}` : assignee ?? 'Sin asignar'}
          </span>
        </div>
        {!pending && (
          <div className="flex gap-1">
            <button
              className={`${btn} px-2 py-0.5`}
              disabled={busy || idx <= 0}
              onClick={() => run(() => updateTaskStatus(task.id, FLOW[idx - 1]))}
              aria-label="Mover a la columna anterior"
            >
              ←
            </button>
            <button
              className={`${btn} px-2 py-0.5`}
              disabled={busy || idx >= FLOW.length - 1}
              onClick={() => run(() => updateTaskStatus(task.id, FLOW[idx + 1]))}
              aria-label="Mover a la columna siguiente"
            >
              →
            </button>
          </div>
        )}
      </div>

      {task.assignment_reason && (
        <div className={`mt-2 rounded-md px-2 py-1 text-[11px] ${pending ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-stone-50 text-stone-500 dark:bg-stone-800/60 dark:text-stone-400'}`}>
          {task.assignment_reason}
        </div>
      )}

      {isAdmin && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pending && task.suggested_assignee_id && (
            <button className={btnPrimary} disabled={busy} onClick={() => run(() => approveTask(task.id))}>
              Aprobar
            </button>
          )}
          <button className={btn} disabled={busy} onClick={() => setCorrecting((v) => !v)}>
            {correcting ? 'Cancelar' : pending ? 'Corregir' : 'Reasignar'}
          </button>
        </div>
      )}

      {correcting && (
        <ReassignForm
          task={task}
          members={members}
          busy={busy}
          onSubmit={(memberId, keyword) =>
            run(async () => {
              await reassignTask(task.id, memberId, keyword)
              setCorrecting(false)
            })
          }
        />
      )}

      {error && <div className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}

function ReassignForm({
  task,
  members,
  busy,
  onSubmit,
}: {
  task: Task
  members: Member[]
  busy: boolean
  onSubmit: (memberId: string, keyword: string) => void
}) {
  const current = task.assignee_id ?? task.suggested_assignee_id
  const options = members.filter((m) => m.active)
  const [memberId, setMemberId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!memberId) return setError('Elige a quién se la asignas.')
    if (memberId === current && !task.needs_approval) return setError('Ya está asignada a esa persona; elige otra.')
    onSubmit(memberId, keyword)
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-2 dark:bg-stone-800/60">
      <select
        className={`${input} w-full`}
        value={memberId}
        onChange={(e) => {
          setMemberId(e.target.value)
          setError(null)
        }}
      >
        <option value="">Asignar a…</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.specialties.join(', ') || 'general'} · {Math.round(m.load_ratio * 100)}%
          </option>
        ))}
      </select>
      <input
        className={`${input} w-full`}
        placeholder="Palabra clave para aprender (opcional), ej. instagram"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <p className="text-[11px] text-stone-500 dark:text-stone-400">
        Si escribes una palabra clave, las próximas tareas que la mencionen irán a esta persona.
      </p>
      <button className={btnPrimary} disabled={busy} onClick={submit}>
        Guardar corrección
      </button>
      {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}
