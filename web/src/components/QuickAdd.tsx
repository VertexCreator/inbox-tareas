import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { ListRow, Priority } from '../lib/types'
import { btn, btnPrimary, input } from './ui'

type Mode = 'iniciativa' | 'pendiente'
interface SubDraft {
  title: string
  assignee_id: string
  due_date: string
}

// Agregar trabajo a mano, fuera de los correos, desde cualquier página.
// - Iniciativa directa (gerente): va al tablero con responsable, fecha y subtareas.
// - Pendiente: va a una lista; si pide plan, el agente lo arma (al instante si es el gerente, o el Planificador).
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { members, brands, stickers } = useBoard()
  const [mode, setMode] = useState<Mode>(isAdmin ? 'iniciativa' : 'pendiente')
  const [lists, setLists] = useState<ListRow[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [brand, setBrand] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [owner, setOwner] = useState('')
  const [sticker, setSticker] = useState('')
  const [subs, setSubs] = useState<SubDraft[]>([])
  const [listId, setListId] = useState('')
  const [autoPlan, setAutoPlan] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ text: string; to: string; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('lists')
      .select('*')
      .eq('archived', false)
      .eq('is_inbox', false)
      .order('created_at')
      .then(({ data }) => {
        const rows = (data ?? []) as ListRow[]
        setLists(rows)
        setListId((cur) => cur || rows.find((l) => l.name === 'Tareas manuales')?.id || rows[0]?.id || '')
      })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const owners = members.filter((m) => m.active && m.can_own)
  const active = members.filter((m) => m.active)
  const liveBrands = brands.filter((b) => !b.archived)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError(mode === 'iniciativa' ? 'Escribe el nombre de la iniciativa.' : 'Escribe el pendiente.')
    setBusy(true)
    setError(null)

    if (mode === 'iniciativa') {
      const { error } = await supabase.rpc('create_initiative', {
        p: {
          title,
          description,
          brand_id: brand || null,
          assignee_id: owner || null,
          due_date: due || null,
          sticker_id: sticker || null,
          priority,
          subtasks: subs.filter((s) => s.title.trim()),
        },
      })
      setBusy(false)
      if (error) return setError(error.message)
      return setDone({
        text: owner ? 'Iniciativa creada y asignada.' : 'Iniciativa creada. El agente sugirió un responsable: apruébalo en Hoy o en el detalle.',
        to: '/tablero',
        label: 'Ver en el tablero',
      })
    }

    if (!listId) {
      setBusy(false)
      return setError('Elige una lista.')
    }
    const { data, error } = await supabase
      .from('list_items')
      .insert({
        list_id: listId,
        title: title.trim(),
        notes: description.trim() || null,
        brand_id: brand || null,
        due_date: due || null,
        priority,
        auto_plan: !isAdmin && autoPlan,
      })
      .select('id')
      .single()
    if (error) {
      setBusy(false)
      return setError(error.message)
    }
    if (isAdmin && autoPlan) {
      const { error: planError } = await supabase.rpc('draft_plan', { p_item_id: data.id, p_template_id: null })
      setBusy(false)
      if (planError) return setError(planError.message)
      return setDone({
        text: 'Pendiente creado con su recomendación. Claude la afina en la próxima media hora; puedes revisarla ya.',
        to: `/listas?lista=${listId}&plan=${data.id}`,
        label: 'Revisar el plan',
      })
    }
    setBusy(false)
    setDone({
      text: autoPlan
        ? 'Pendiente agregado. El agente le armará un plan en la próxima media hora y la gerente lo confirmará.'
        : 'Pendiente agregado a la lista.',
      to: `/listas?lista=${listId}`,
      label: 'Ver la lista',
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-800 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Nueva tarea"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Nueva tarea</h2>
          <button className={btn} onClick={onClose}>
            Cerrar
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{done.text}</p>
            <div className="flex gap-2">
              <button
                className={btnPrimary}
                onClick={() => {
                  onClose()
                  navigate(done.to)
                }}
              >
                {done.label}
              </button>
              <button
                className={btn}
                onClick={() => {
                  setDone(null)
                  setTitle('')
                  setDescription('')
                  setSubs([])
                }}
              >
                Agregar otra
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {isAdmin && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['iniciativa', 'Iniciativa directa', 'Va al tablero ya asignada, con sus subtareas.'],
                    ['pendiente', 'Pendiente para planificar', 'Va a una lista; el agente propone tarea, subtareas y personas.'],
                  ] as const
                ).map(([value, label, desc]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`rounded-lg border p-3 text-left ${
                      mode === value ? 'border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40' : 'border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">{desc}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <input
                id="quick-title"
                autoFocus
                className={`${input} w-full text-base`}
                placeholder={mode === 'iniciativa' ? 'Ej. Sesión de fotos para Axe' : 'Ej. Campaña de reels para OGX'}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setError(null)
                }}
                aria-label="Nombre"
              />
              <textarea
                className={`${input} w-full`}
                rows={2}
                placeholder="Descripción: qué hay que hacer, entregables, contexto"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-label="Descripción"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select className={input} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Marca">
                <option value="">Marca…</option>
                {liveBrands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
              <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Prioridad">
                <option value="P1">P1 · hoy</option>
                <option value="P2">P2 · semana</option>
                <option value="P3">P3 · cuando se pueda</option>
              </select>
              {mode === 'iniciativa' ? (
                <>
                  <select className={input} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsable">
                    <option value="">Responsable: que sugiera el agente</option>
                    {owners.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <select className={input} value={sticker} onChange={(e) => setSticker(e.target.value)} aria-label="Estatus">
                    <option value="">Estatus: {stickers[0]?.name ?? 'Por revisar'}</option>
                    {stickers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <select className={input} value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Lista">
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      Lista: {l.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {mode === 'iniciativa' && (
              <div>
                <div className="mb-1 text-xs text-stone-500 dark:text-stone-400">Subtareas (opcional)</div>
                <div className="space-y-1.5">
                  {subs.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        className={`${input} min-w-40 flex-1 py-1`}
                        placeholder="Subtarea"
                        value={s.title}
                        onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        aria-label="Subtarea"
                      />
                      <select
                        className={`${input} py-1 text-xs`}
                        value={s.assignee_id}
                        onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, assignee_id: e.target.value } : x)))}
                        aria-label="Responsable de la subtarea"
                      >
                        <option value="">Sin asignar</option>
                        {active.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className={`${input} py-1 text-xs`}
                        value={s.due_date}
                        onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))}
                        aria-label="Fecha de la subtarea"
                      />
                      <button type="button" className="px-1 text-stone-400 hover:text-red-600" onClick={() => setSubs(subs.filter((_, j) => j !== i))} aria-label="Quitar subtarea">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => setSubs([...subs, { title: '', assignee_id: '', due_date: due }])}
                >
                  + Agregar subtarea
                </button>
              </div>
            )}

            {mode === 'pendiente' && (
              <label className="flex items-start gap-2 rounded-lg bg-indigo-50/60 p-3 text-sm dark:bg-indigo-950/30">
                <input type="checkbox" className="mt-0.5" checked={autoPlan} onChange={(e) => setAutoPlan(e.target.checked)} />
                <span>
                  <span className="font-medium">Pedir plan al agente</span>
                  <span className="block text-xs text-stone-500 dark:text-stone-400">
                    {isAdmin
                      ? 'Arma ahora la tarea con subtareas, personas y fechas; Claude la afina en la próxima media hora.'
                      : 'El agente propone tarea, subtareas y personas en la próxima media hora; la gerente lo revisa y confirma.'}
                  </span>
                </span>
              </label>
            )}

            {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className={btnPrimary} disabled={busy}>
                {busy ? 'Guardando…' : mode === 'iniciativa' ? 'Crear iniciativa' : 'Agregar pendiente'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
