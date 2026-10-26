import { useEffect, useState, type FormEvent } from 'react'
import { useAssignable } from '../lib/permissions'
import { RecurringForm } from './Recurring'
import { BrandPicker } from './Brands'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { ListRow, Priority } from '../lib/types'
import { btn, btnPrimary, input } from './ui'

type Mode = 'iniciativa' | 'pendiente' | 'repetitiva'
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
  const { members, brands, stickers, agencies } = useBoard()
  const [mode, setMode] = useState<Mode>(isAdmin ? 'iniciativa' : 'pendiente')
  const [lists, setLists] = useState<ListRow[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [brandIds, setBrandIds] = useState<string[]>([])
  const brand = brandIds[0] ?? ''
  const [agency, setAgency] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [owner, setOwner] = useState('')
  const [sticker, setSticker] = useState('')
  const [subs, setSubs] = useState<SubDraft[]>([])
  const [listId, setListId] = useState('')
  const [autoPlan, setAutoPlan] = useState(true)
  const [searchEmail, setSearchEmail] = useState(true)
  const [query, setQuery] = useState('')
  const [queryEdited, setQueryEdited] = useState(false)
  const [searchDays, setSearchDays] = useState(30)

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

  // Parámetros de búsqueda en Gmail: se arman solos con nombre, descripción y marca (el gerente puede editarlos).
  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('settings')
      .select('email_search_days')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => data && setSearchDays(data.email_search_days))
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin || !searchEmail || queryEdited || !title.trim()) return
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('preview_email_query', {
        p_title: title,
        p_description: description,
        p_brand: brand || null,
      })
      if (typeof data === 'string') setQuery(data)
    }, 400)
    return () => clearTimeout(t)
  }, [isAdmin, searchEmail, queryEdited, title, description, brand])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A quién puede asignar quien crea: el gerente a cualquiera; cada miembro, a sí y a quienes le autorizaron.
  const { owners, people } = useAssignable(members)
  const active = people
  const liveBrands = brands.filter((b) => !b.archived)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError(mode === 'iniciativa' ? 'Escribe el nombre de la iniciativa.' : 'Escribe qué hay que hacer.')
    setBusy(true)
    setError(null)

    if (mode === 'iniciativa') {
      const { data: newId, error } = await supabase.rpc('create_initiative', {
        p: {
          title,
          description,
          brand_ids: brandIds,
          assignee_id: owner || null,
          due_date: due || null,
          sticker_id: sticker || null,
          priority,
          subtasks: subs.filter((s) => s.title.trim()),
          search_email: searchEmail,
          search_query: searchEmail ? query : null,
        },
      })
      if (!error && isAdmin && agency && newId) await supabase.from('tasks').update({ agency_id: agency }).eq('id', newId)
      setBusy(false)
      if (error) return setError(error.message)
      return setDone({
        text:
          (owner ? 'Iniciativa creada y asignada.' : isAdmin ? 'Iniciativa creada. El agente sugirió un responsable: apruébalo en Hoy o en el detalle.' : 'Iniciativa creada y asignada a ti.') +
          (searchEmail ? ' El script buscará el correo relacionado en los próximos 5 minutos y lo vinculará.' : ''),
        to: '/iniciativas',
        label: 'Ver en Iniciativas',
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
        brand_ids: brandIds,
        agency_id: agency || null,
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
    if (isAdmin && searchEmail) {
      const { error: searchError } = await supabase.rpc('request_email_search', { p_task_id: null, p_item_id: data.id, p_query: query || null })
      if (searchError) {
        setBusy(false)
        return setError(searchError.message)
      }
    }
    if (isAdmin && autoPlan) {
      const { error: planError } = await supabase.rpc('draft_plan', { p_item_id: data.id, p_template_id: null })
      setBusy(false)
      if (planError) return setError(planError.message)
      return setDone({
        text: 'Quedó por planificar, con su recomendación. Claude la afina en la próxima media hora; puedes revisarla ya.',
        to: `/iniciativas?plan=${data.id}`,
        label: 'Revisar el plan',
      })
    }
    setBusy(false)
    setDone({
      text: autoPlan
        ? 'Agregado a Por planificar. El agente le armará un plan en la próxima media hora y la gerente lo confirmará.'
        : 'Agregado a Por planificar.',
      to: `/iniciativas?lista=${listId}`,
      label: 'Ver en Iniciativas',
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
          <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['iniciativa', 'Iniciativa directa', isAdmin ? 'Va al tablero ya asignada, con sus subtareas.' : 'Para ti o para quien el gerente te autorizó.'],
                    ['pendiente', '📝 Por planificar', isAdmin ? 'Va a una lista; el agente propone tarea, subtareas y personas.' : 'Va a una lista para que el gerente la reparta.'],
                    ['repetitiva', '🔁 Repetitiva', 'Se crea sola cada día, semana, 15 días o mes.'],
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

            {mode === 'repetitiva' ? (
              <RecurringForm
                onCancel={onClose}
                onSaved={(text) => setDone({ text, to: '/mis-tareas?ver=repetitivas', label: 'Ver mis repetitivas' })}
              />
            ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>

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

            <BrandPicker value={brandIds} onChange={setBrandIds} brands={liveBrands} />
            {agencies.some((a) => !a.archived) && (isAdmin || mode !== 'iniciativa') && (
              <select className={input} value={agency} onChange={(e) => setAgency(e.target.value)} aria-label="Agencia">
                <option value="">Agencia (opcional)</option>
                {agencies
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
              <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Prioridad">
                <option value="P1">P1 · hoy</option>
                <option value="P2">P2 · semana</option>
                <option value="P3">P3 · cuando se pueda</option>
              </select>
              {mode === 'iniciativa' ? (
                <>
                  <select className={input} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsable">
                    <option value="">{isAdmin ? 'Responsable: que sugiera el agente' : 'Responsable: yo'}</option>
                    {owners.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <select className={input} value={sticker} onChange={(e) => setSticker(e.target.value)} aria-label="Etapa">
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

            {isAdmin && (
              <div className="space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={searchEmail} onChange={(e) => setSearchEmail(e.target.checked)} />
                  <span>
                    <span className="font-medium">Buscar y vincular el correo relacionado</span>
                    <span className="block text-xs text-stone-500 dark:text-stone-400">
                      El script busca en Gmail de los últimos {searchDays} días (cámbialo en Configuración → Script de Gmail) y vincula el
                      que mejor coincida. Si hay dudas, te deja elegir en el detalle de la tarea.
                    </span>
                  </span>
                </label>
                {searchEmail && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                      <label htmlFor="quick-query">Parámetros de búsqueda en Gmail</label>
                      {queryEdited && (
                        <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setQueryEdited(false)}>
                          Volver a los automáticos
                        </button>
                      )}
                    </div>
                    <input
                      id="quick-query"
                      className={`${input} w-full font-mono text-xs`}
                      placeholder="Se arma solo al escribir el nombre"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setQueryEdited(true)
                      }}
                    />
                    <p className="mt-1 text-[11px] text-stone-400">
                      Formato de Gmail: {'{a b}'} = a o b · "frase exacta" · from:dominio.com · newer_than:30d
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className={btnPrimary} disabled={busy}>
                {busy ? 'Guardando…' : mode === 'iniciativa' ? 'Crear iniciativa' : 'Agregar a Por planificar'}
              </button>
            </div>
          </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
