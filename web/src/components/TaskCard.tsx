import { useState } from 'react'
import type { Member, Sticker, Subtask, Task } from '../lib/types'
import {
  approveTask,
  isOverdue,
  memberName,
  memberOption,
  reassignTask,
  shortDate,
  updateSubtask,
  updateTask,
  updateTaskStatus,
} from '../lib/data'
import { useAuth } from '../lib/auth'
import { Avatar, PriorityBadge, Tag, btn, btnDetail, btnPrimary, input } from './ui'

interface Props {
  task: Task
  members: Member[]
  isAdmin: boolean
  onChanged: () => void
  compact?: boolean
  subtasks?: Subtask[]
  stickers?: Sticker[]
  onOpen?: () => void
  onOpenEmail?: () => void
}

export function TaskCard({ task, members, isAdmin, onChanged, compact = false, subtasks = [], stickers = [], onOpen, onOpenEmail }: Props) {
  const { member } = useAuth()
  const [correcting, setCorrecting] = useState(false)
  const [open, setOpen] = useState(false)
  const [moreText, setMoreText] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assigneeId = task.assignee_id ?? task.suggested_assignee_id
  const assignee = memberName(members, assigneeId)
  const pending = task.needs_approval && !task.assignee_id
  const canStage = isAdmin || (!!member && task.assignee_id === member.id)

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
        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          <p className={moreText ? 'whitespace-pre-line' : 'line-clamp-2'}>{task.description}</p>
          {task.description.length > 140 && (
            <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setMoreText((v) => !v)}>
              {moreText ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tag tone={task.specialty ? 'accent' : 'neutral'}>{task.specialty ?? 'General'}</Tag>
        <Tag>{task.effort_points} pts</Tag>
        <DueDate
          value={task.due_date}
          overdue={isOverdue(task.due_date, task.status === 'hecho')}
          editable={isAdmin}
          onSave={(v) => run(() => updateTask(task.id, { due_date: v }))}
        />
        {task.source === 'correo' && <Tag>desde correo</Tag>}
        {subtasks.length > 0 && (
          <button
            type="button"
            className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? '▾' : '▸'} {subtasks.filter((s) => s.done).length}/{subtasks.length} subtareas
          </button>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.round((subtasks.filter((s) => s.done).length / subtasks.length) * 100)}%` }}
          />
        </div>
      )}

      {open && (
        <SubtaskList subtasks={subtasks} members={members} isAdmin={isAdmin} taskAssignee={assigneeId} onChanged={onChanged} />
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {assigneeId && assignee ? <Avatar name={assignee} id={assigneeId} /> : null}
          <span className="truncate text-xs text-stone-600 dark:text-stone-300">
            {pending ? `Sugerido: ${assignee ?? 'nadie'}` : assignee ?? 'Sin asignar'}
          </span>
        </div>
        {!pending && stickers.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            Etapa
            <select
              className={`${input} py-0.5 text-xs`}
              value={task.sticker_id ?? ''}
              disabled={busy || !canStage}
              onChange={(e) => run(() => updateTask(task.id, { sticker_id: e.target.value }))}
              title={canStage ? 'Cambiar la etapa de la tarea' : 'La cambia el responsable o el gerente'}
            >
              {stickers.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {(onOpen || (onOpenEmail && task.email_id)) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onOpen && (
            <button className={btnDetail} onClick={onOpen}>
              Ver detalle →
            </button>
          )}
          {onOpenEmail && task.email_id && (
            <button className={btn} onClick={onOpenEmail}>
              ✉ Ver correo
            </button>
          )}
        </div>
      )}

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

function DueDate({
  value,
  overdue,
  editable,
  onSave,
}: {
  value: string | null
  overdue: boolean
  editable: boolean
  onSave: (v: string | null) => void
}) {
  const tone = overdue
    ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200'
    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
  if (!editable) {
    return value ? <span className={`rounded-md px-2 py-0.5 text-[11px] ${tone}`}>{overdue ? 'venció' : 'vence'} {shortDate(value)}</span> : null
  }
  return (
    <label className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${tone}`}>
      {value ? (overdue ? 'venció' : 'vence') : 'sin fecha'}
      <input
        type="date"
        className="w-[7.2rem] bg-transparent text-[11px] outline-none"
        value={value ?? ''}
        onChange={(e) => onSave(e.target.value || null)}
        aria-label="Fecha límite"
      />
    </label>
  )
}

function SubtaskList({
  subtasks,
  members,
  isAdmin,
  taskAssignee,
  onChanged,
}: {
  subtasks: Subtask[]
  members: Member[]
  isAdmin: boolean
  taskAssignee: string | null
  onChanged: () => void
}) {
  const { member } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const save = async (id: string, patch: Parameters<typeof updateSubtask>[1]) => {
    setError(null)
    try {
      await updateSubtask(id, patch)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  return (
    <div className="mt-2 space-y-1 border-t border-stone-200 pt-2 dark:border-stone-800">
      {subtasks.map((s) => {
        const mine = s.assignee_id === member?.id || taskAssignee === member?.id
        const overdue = isOverdue(s.due_date, s.done)
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-emerald-600"
              checked={s.done}
              disabled={!isAdmin && !mine}
              onChange={(e) => save(s.id, { done: e.target.checked })}
              aria-label={`Marcar "${s.title}" como hecha`}
            />
            <span className={`min-w-0 flex-1 ${s.done ? 'text-stone-400 line-through' : ''}`}>{s.title}</span>
            {isAdmin ? (
              <>
                <select
                  className="max-w-32 rounded border border-stone-200 bg-transparent px-1 py-0.5 text-[11px] dark:border-stone-700"
                  value={s.assignee_id ?? ''}
                  onChange={(e) => save(s.id, { assignee_id: e.target.value || null })}
                  aria-label="Responsable de la subtarea"
                >
                  <option value="">Sin asignar</option>
                  {members
                    .filter((m) => m.active)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {memberOption(m, s.skill)}
                      </option>
                    ))}
                </select>
                <input
                  type="date"
                  className={`rounded border border-stone-200 bg-transparent px-1 py-0.5 text-[11px] dark:border-stone-700 ${overdue ? 'text-red-600' : ''}`}
                  value={s.due_date ?? ''}
                  onChange={(e) => save(s.id, { due_date: e.target.value || null })}
                  aria-label="Fecha límite de la subtarea"
                />
              </>
            ) : (
              <span className={`text-[11px] ${overdue ? 'text-red-600' : 'text-stone-500 dark:text-stone-400'}`}>
                {memberName(members, s.assignee_id) ?? 'Sin asignar'} · {shortDate(s.due_date)}
              </span>
            )}
          </div>
        )
      })}
      {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}
