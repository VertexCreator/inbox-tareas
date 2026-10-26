import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { memberName, shortDate, todayISO, useBoard } from '../lib/data'
import { useAssignable } from '../lib/permissions'
import { supabase, uniqueChannel } from '../lib/supabase'
import type { Priority } from '../lib/types'
import { useUndo } from '../lib/undo'
import { BrandChips, BrandPicker } from './Brands'
import { Card, Empty, btn, btnPrimary, input } from './ui'

// Tareas repetitivas: se programan una vez y la base crea cada repetición como una tarea normal.

export type Frequency = 'diaria' | 'semanal' | 'quincenal' | 'mensual'

export interface RecurringTask {
  id: string
  title: string
  description: string | null
  brand_ids: string[]
  agency_id: string | null
  assignee_id: string
  created_by: string | null
  frequency: Frequency
  weekdays: number[]
  workdays_only: boolean
  start_date: string
  end_date: string | null
  next_date: string
  due_offset: number
  priority: Priority
  subtasks: string[]
  active: boolean
  last_generated: string | null
}

const FREQ: { id: Frequency; label: string }[] = [
  { id: 'diaria', label: 'Todos los días' },
  { id: 'semanal', label: 'Cada semana' },
  { id: 'quincenal', label: 'Cada 15 días' },
  { id: 'mensual', label: 'Cada mes' },
]
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

function isoDow(iso: string) {
  const d = new Date(iso + 'T00:00').getDay()
  return d === 0 ? 7 : d
}

function list(words: string[]) {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`
}

// "Cada lunes y miércoles", "Todos los días hábiles", "Cada 15 días desde el 20 oct", "Cada mes, el día 31".
export function ruleText(r: Pick<RecurringTask, 'frequency' | 'weekdays' | 'workdays_only' | 'start_date'>) {
  if (r.frequency === 'diaria') return r.workdays_only ? 'Todos los días hábiles (lunes a viernes)' : 'Todos los días'
  if (r.frequency === 'semanal') {
    const days = (r.weekdays.length ? r.weekdays : [isoDow(r.start_date)]).slice().sort()
    return `Cada ${list(days.map((d) => DAY_NAMES[d - 1]))}`
  }
  if (r.frequency === 'quincenal') return `Cada 15 días desde el ${shortDate(r.start_date)}`
  return `Cada mes, el día ${Number(r.start_date.slice(8, 10))}`
}

function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + 'T00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// La misma regla que la base, para mostrar la próxima fecha mientras se arma el formulario.
function matches(r: Pick<RecurringTask, 'frequency' | 'weekdays' | 'workdays_only' | 'start_date' | 'end_date'>, iso: string) {
  if (iso < r.start_date || (r.end_date && iso > r.end_date)) return false
  const dow = isoDow(iso)
  if (r.frequency === 'diaria') return !r.workdays_only || dow <= 5
  if (r.frequency === 'semanal') return (r.weekdays.length ? r.weekdays : [isoDow(r.start_date)]).includes(dow)
  if (r.frequency === 'quincenal') return Math.round((new Date(iso + 'T00:00').getTime() - new Date(r.start_date + 'T00:00').getTime()) / 86_400_000) % 14 === 0
  const d = new Date(iso + 'T00:00')
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return d.getDate() === Math.min(Number(r.start_date.slice(8, 10)), last)
}

function nextDates(r: Parameters<typeof matches>[0], from: string, n: number) {
  const out: string[] = []
  let d = from < r.start_date ? r.start_date : from
  for (let i = 0; i < 400 && out.length < n; i++, d = addDaysISO(d, 1)) if (matches(r, d)) out.push(d)
  return out
}

function when(iso: string) {
  const today = todayISO()
  if (iso === today) return 'hoy'
  if (iso === addDaysISO(today, 1)) return 'mañana'
  return shortDate(iso)
}

export function RecurringForm({ initial, onSaved, onCancel }: { initial?: RecurringTask; onSaved: (text: string) => void; onCancel: () => void }) {
  const { member, can } = useAuth()
  const { members, brands } = useBoard()
  // Para otras personas: el gerente o un cargo con ese permiso, y solo a quienes puede asignar.
  const forOthers = can('repetitivas_para_otros')
  const { people } = useAssignable(members)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'semanal')
  const [workdays, setWorkdays] = useState(initial?.workdays_only ?? true)
  const [start, setStart] = useState(initial?.start_date ?? todayISO())
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays?.length ? initial.weekdays : [isoDow(initial?.start_date ?? todayISO())])
  const [end, setEnd] = useState(initial?.end_date ?? '')
  const [offset, setOffset] = useState(initial?.due_offset ?? 0)
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'P2')
  const [brandIds, setBrandIds] = useState<string[]>(initial?.brand_ids ?? [])
  const [assignee, setAssignee] = useState(initial?.assignee_id ?? member?.id ?? '')
  const [subs, setSubs] = useState((initial?.subtasks ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rule = { frequency, weekdays, workdays_only: workdays, start_date: start, end_date: end || null }
  const upcoming = useMemo(() => nextDates(rule, todayISO(), 3), [frequency, weekdays, workdays, start, end]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Escribe el nombre de la tarea.')
    if (frequency === 'semanal' && weekdays.length === 0) return setError('Elige al menos un día de la semana.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('save_recurring_task', {
      p: {
        id: initial?.id ?? null,
        title,
        description,
        frequency,
        weekdays: frequency === 'semanal' ? weekdays : [],
        workdays_only: frequency === 'diaria' && workdays,
        start_date: start,
        end_date: end || null,
        due_offset: offset,
        priority,
        brand_ids: brandIds,
        assignee_id: forOthers ? assignee : null,
        subtasks: subs.split('\n').map((x) => x.trim()).filter(Boolean),
      },
    })
    setBusy(false)
    if (error) return setError(error.message)
    const first = upcoming[0]
    onSaved(
      `${initial ? 'Guardé los cambios de' : 'Programé'} «${title.trim()}»: ${ruleText(rule).toLowerCase()}.` +
        (first ? ` La próxima se crea ${when(first)}${first === todayISO() ? ' (ya está en Mis tareas)' : ''}.` : ''),
    )
  }

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()))

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <input
          autoFocus
          className={`${input} w-full text-base`}
          placeholder="Ej. Reporte semanal de redes"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
          aria-label="Nombre de la tarea"
        />
        <textarea className={`${input} w-full`} rows={2} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Descripción" />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-stone-500 dark:text-stone-400">🔁 Se repite</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Frecuencia">
          {FREQ.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={frequency === f.id}
              onClick={() => setFrequency(f.id)}
              className={`rounded-lg border px-3 py-2 text-sm ${frequency === f.id ? 'border-2 border-indigo-500 bg-indigo-50 font-medium dark:bg-indigo-950' : 'border-stone-200 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {frequency === 'diaria' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={workdays} onChange={(e) => setWorkdays(e.target.checked)} />
            Solo días hábiles (lunes a viernes)
          </label>
        )}
        {frequency === 'semanal' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-500">Los días:</span>
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i + 1)}
                aria-pressed={weekdays.includes(i + 1)}
                title={DAY_NAMES[i]}
                className={`h-8 w-8 rounded-full text-xs font-medium ${weekdays.includes(i + 1) ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300'}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500">{frequency === 'mensual' ? 'Empieza (y se repite ese día del mes)' : frequency === 'quincenal' ? 'Empieza (y cada 15 días desde ahí)' : 'Empieza'}</span>
            <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500">Termina (opcional)</span>
            <input type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
          {ruleText(rule)}.{' '}
          {upcoming.length ? `Próximas: ${upcoming.map(when).join(', ')}.` : 'Con estas fechas no hay próximas repeticiones.'}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BrandPicker value={brandIds} onChange={setBrandIds} brands={brands} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {forOthers ? (
          <select className={input} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Para quién">
            {people
              .map((m) => (
                <option key={m.id} value={m.id}>
                  Para {m.name}
                  {m.id === member?.id ? ' (tú)' : ''}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-xs text-stone-500">Para ti</span>
        )}
        <select className={input} value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="Plazo">
          <option value={0}>Vence el mismo día</option>
          {[1, 2, 3, 5, 7, 10, 14].map((n) => (
            <option key={n} value={n}>
              Vence {n} {n === 1 ? 'día' : 'días'} después
            </option>
          ))}
        </select>
        <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Prioridad">
          <option value="P1">P1 · hoy</option>
          <option value="P2">P2 · semana</option>
          <option value="P3">P3 · cuando se pueda</option>
        </select>
      </div>
      <textarea className={`${input} w-full`} rows={2} placeholder="Subtareas, una por línea (opcional)" value={subs} onChange={(e) => setSubs(e.target.value)} aria-label="Subtareas" />

      {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? 'Guardando…' : initial ? 'Guardar cambios' : '🔁 Programar tarea'}
        </button>
      </div>
    </form>
  )
}

// Lista de tareas repetitivas de una persona, para pausarlas, editarlas o borrarlas.
export function RecurringList({ personId, onNew }: { personId: string; onNew: () => void }) {
  const { isAdmin, member } = useAuth()
  const { members, brands } = useBoard()
  const { track } = useUndo()
  const [rows, setRows] = useState<RecurringTask[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('recurring_tasks').select('*').eq('assignee_id', personId).order('active', { ascending: false }).order('next_date')
    setRows((data ?? []) as RecurringTask[])
  }, [personId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(uniqueChannel('recurring'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_tasks' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw new Error(error.message)
  }
  const setActive = async (r: RecurringTask, active: boolean) => {
    setMsg(null)
    try {
      await call('set_recurring_active', { p_id: r.id, p_active: active })
      load()
      track(active ? `Reanudaste «${r.title}»` : `Pausaste «${r.title}»`, () => call('set_recurring_active', { p_id: r.id, p_active: !active }), { after: load })
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }
  const remove = async (r: RecurringTask) => {
    setConfirm(null)
    try {
      await call('delete_recurring_task', { p_id: r.id })
      load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }
  const canEdit = (r: RecurringTask) => isAdmin || r.assignee_id === member?.id || r.created_by === member?.id

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-500 dark:text-stone-400">Cada repetición aparece sola en Pendientes el día que toca, con 🔁.</p>
        <button className={btnPrimary} onClick={onNew}>
          🔁 Nueva tarea repetitiva
        </button>
      </div>
      {msg && <div className="text-sm text-red-600 dark:text-red-400">{msg}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">✓ {notice}</div>}
      {rows.length === 0 && (
        <Card>
          <Empty>No hay tareas repetitivas. Programa una para lo que se hace todos los días, cada semana, cada 15 días o cada mes.</Empty>
        </Card>
      )}
      {rows.length > 0 && (
        <Card className="divide-y divide-stone-200 dark:divide-stone-800">
          {rows.map((r) => (
            <div key={r.id} className={`px-4 py-3 ${r.active ? '' : 'bg-stone-50/70 dark:bg-stone-900/50'}`}>
              {editing === r.id ? (
                <RecurringForm
                  initial={r}
                  onCancel={() => setEditing(null)}
                  onSaved={(text) => {
                    setEditing(null)
                    setMsg(null)
                    setNotice(text)
                    load()
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <span className={`mt-0.5 text-lg ${r.active ? '' : 'opacity-40'}`} aria-hidden="true">
                    🔁
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`font-medium ${r.active ? '' : 'text-stone-400'}`}>{r.title}</span>
                      <BrandChips ids={r.brand_ids} brands={brands} hideEmpty />
                      {!r.active && <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600 dark:bg-stone-700 dark:text-stone-300">Pausada</span>}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {ruleText(r)}
                      {r.due_offset ? ` · vence ${r.due_offset} ${r.due_offset === 1 ? 'día' : 'días'} después` : ''}
                      {r.subtasks.length ? ` · ${r.subtasks.length} subtareas` : ''}
                      {r.end_date ? ` · hasta el ${shortDate(r.end_date)}` : ''}
                    </div>
                    <div className="mt-0.5 text-xs">
                      {r.active ? (
                        <span className="text-indigo-700 dark:text-indigo-300">Próxima: {when(r.next_date)}</span>
                      ) : (
                        <span className="text-stone-400">No se crean nuevas mientras esté pausada</span>
                      )}
                      {r.created_by && r.created_by !== r.assignee_id && <span className="text-stone-400"> · la programó {memberName(members, r.created_by)}</span>}
                    </div>
                  </div>
                  {canEdit(r) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button className={`${btn} px-2.5 py-1 text-xs`} onClick={() => setEditing(r.id)}>
                        Editar
                      </button>
                      <button className={`${btn} px-2.5 py-1 text-xs`} onClick={() => setActive(r, !r.active)}>
                        {r.active ? '⏸ Pausar' : '▶ Reanudar'}
                      </button>
                      {confirm === r.id ? (
                        <>
                          <button className={`${btn} px-2.5 py-1 text-xs text-red-600`} onClick={() => remove(r)}>
                            Sí, borrar
                          </button>
                          <button className={`${btn} px-2.5 py-1 text-xs`} onClick={() => setConfirm(null)}>
                            No
                          </button>
                        </>
                      ) : (
                        <button className={`${btn} px-2.5 py-1 text-xs text-red-600 dark:text-red-400`} onClick={() => setConfirm(r.id)} title="Las tareas ya creadas se quedan">
                          Borrar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
