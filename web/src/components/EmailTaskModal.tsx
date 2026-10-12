import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { memberOption } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Brand, Email, Member, PlanTemplate, Priority, Sticker } from '../lib/types'
import { btn, btnPrimary, input } from './ui'

export interface ExistingItem {
  id: string
  title: string
  status: string
  task_id: string | null
}

interface PreviewSub {
  title: string
  skill: string | null
  assignee_id: string | null
  reason?: string | null
  due_date: string | null
  include: boolean
}
interface Preview {
  template_id: string
  template_name: string
  main_skill: string | null
  effort_points: number
  assignee_id: string | null
  reason: string | null
  due_date: string
  subtasks: PreviewSub[]
}

interface Props {
  email: Email
  members: Member[]
  brands: Brand[]
  stickers: Sticker[]
  existing: ExistingItem[]
  onClose: () => void
  onCreated: () => void
}

// Ventana de "Crear pendiente": todo precargado desde el correo, para asignar de una vez o dejarlo planificado.
export function EmailTaskModal({ email: e, members, brands, stickers, existing, onClose, onCreated }: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'asignar' | 'planificar'>('asignar')
  const [title, setTitle] = useState((e.summary?.split(/[;.]/)[0] || e.subject || '').trim().slice(0, 80))
  const [description, setDescription] = useState(
    [e.summary, `Correo de ${e.from_name || e.from_email}: ${e.subject ?? ''}`].filter(Boolean).join('\n'),
  )
  const [brand, setBrand] = useState(e.brand_id ?? '')
  const [priority, setPriority] = useState<Priority>(e.priority === 'ninguna' ? 'P2' : e.priority)
  const [due, setDue] = useState(e.reply_by ?? '')
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [owner, setOwner] = useState('')
  const [ownerTouched, setOwnerTouched] = useState(false)
  const [subs, setSubs] = useState<PreviewSub[]>([])
  const [sticker, setSticker] = useState('')
  const [markDone, setMarkDone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ text: string; to: string; label: string } | null>(null)

  const owners = members.filter((m) => m.active && m.can_own)
  const active = members.filter((m) => m.active)

  useEffect(() => {
    supabase
      .from('plan_templates')
      .select('*')
      .order('usage_count', { ascending: false })
      .then(({ data }) => setTemplates((data ?? []) as PlanTemplate[]))
  }, [])

  // La recomendación (plantilla, responsable y subtareas) se recalcula al cambiar marca, fecha o plantilla.
  const recommend = useCallback(async () => {
    const { data, error } = await supabase.rpc('preview_plan_for', {
      p_title: title,
      p_notes: description,
      p_brand: brand || null,
      p_due: due || null,
      p_template: templateId || null,
    })
    if (error) return setError(error.message)
    const p = data as Preview
    setPreview(p)
    setSubs(p.subtasks)
    if (!templateId) setTemplateId(p.template_id)
    if (!ownerTouched) setOwner(p.assignee_id ?? '')
    if (!due) setDue(p.due_date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, templateId, due])

  useEffect(() => {
    recommend()
  }, [recommend])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setSub = (i: number, patch: Partial<PreviewSub>) => setSubs((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!title.trim()) return setError('Escribe un título.')
    if (mode === 'asignar' && !owner) return setError('Elige el responsable, o cambia a "Planificar después".')
    if (subs.some((s) => s.include && !s.title.trim())) return setError('Hay una subtarea marcada sin título.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_from_email', {
      p: {
        email_id: e.id,
        mode,
        title,
        description,
        brand_id: brand || null,
        priority,
        due_date: due || null,
        assignee_id: owner || null,
        sticker_id: sticker || null,
        template_id: templateId || null,
        main_skill: preview?.main_skill ?? null,
        effort_points: preview?.effort_points ?? 2,
        subtasks: subs,
        mark_done: markDone,
      },
    })
    setBusy(false)
    if (error) return setError(error.message)
    const r = data as { mode: string; list_item_id: string; list_id: string }
    onCreated()
    const name = members.find((m) => m.id === owner)?.name
    setDone(
      mode === 'asignar'
        ? { text: `Iniciativa creada y asignada a ${name ?? 'su responsable'}${subs.filter((s) => s.include).length ? ` con ${subs.filter((s) => s.include).length} subtareas` : ''}.`, to: '/tablero', label: 'Ver en el tablero' }
        : { text: 'Pendiente creado con su recomendación lista para revisar.', to: `/listas?lista=${r.list_id}&plan=${r.list_item_id}`, label: 'Revisar el plan' },
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-800 dark:bg-stone-900"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-label="Crear desde correo"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-medium">Crear desde correo</h2>
            <p className="truncate text-xs text-stone-500 dark:text-stone-400">
              {e.from_name || e.from_email} · {e.subject}
            </p>
          </div>
          <button className={btn} onClick={onClose}>
            Cerrar
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {done.text}
              {markDone ? ' El correo salió de tu bandeja.' : ''}
            </p>
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
              <button className={btn} onClick={onClose}>
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {existing.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                Este correo ya tiene {existing.length === 1 ? 'un pendiente' : `${existing.length} pendientes`}:{' '}
                {existing.map((x) => `"${x.title}"`).join(', ')}. Si sigues, se crea otro.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['asignar', 'Asignar ahora', 'Va al tablero con responsable y subtareas.'],
                  ['planificar', 'Planificar después', 'Queda en Listas con la recomendación lista para revisar.'],
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

            <div className="space-y-2">
              <input
                id="email-task-title"
                autoFocus
                className={`${input} w-full text-base`}
                value={title}
                onChange={(ev) => {
                  setTitle(ev.target.value)
                  setError(null)
                }}
                aria-label="Título"
              />
              <textarea
                className={`${input} w-full`}
                rows={2}
                value={description}
                onChange={(ev) => setDescription(ev.target.value)}
                aria-label="Descripción"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select className={input} value={brand} onChange={(ev) => setBrand(ev.target.value)} aria-label="Marca">
                <option value="">{e.suggested_brand ? `Marca… (sugerida: ${e.suggested_brand})` : 'Marca…'}</option>
                {brands
                  .filter((b) => !b.archived)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
              <select className={input} value={priority} onChange={(ev) => setPriority(ev.target.value as Priority)} aria-label="Prioridad">
                <option value="P1">P1 · hoy</option>
                <option value="P2">P2 · semana</option>
                <option value="P3">P3 · cuando se pueda</option>
              </select>
              <input type="date" className={input} value={due} onChange={(ev) => setDue(ev.target.value)} aria-label="Fecha límite" />
              <select className={input} value={templateId} onChange={(ev) => setTemplateId(ev.target.value)} aria-label="Plantilla">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    Plantilla: {t.name}
                  </option>
                ))}
              </select>
            </div>

            {mode === 'asignar' && (
              <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1 text-xs">
                    <span className="block text-stone-500 dark:text-stone-400">Responsable</span>
                    <select
                      className={`${input} min-w-56`}
                      value={owner}
                      onChange={(ev) => {
                        setOwner(ev.target.value)
                        setOwnerTouched(true)
                        setError(null)
                      }}
                    >
                      <option value="">Elige…</option>
                      {owners.map((m) => (
                        <option key={m.id} value={m.id}>
                          {memberOption(m, preview?.main_skill ?? null)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="block text-stone-500 dark:text-stone-400">Estatus</span>
                    <select className={input} value={sticker} onChange={(ev) => setSticker(ev.target.value)}>
                      <option value="">{stickers[0]?.name ?? 'Por revisar'}</option>
                      {stickers.slice(1).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="min-w-0 flex-1 text-xs text-stone-500 dark:text-stone-400">
                    {ownerTouched && owner !== preview?.assignee_id
                      ? `Elegiste a mano (el agente sugería ${members.find((m) => m.id === preview?.assignee_id)?.name ?? 'otra persona'}).`
                      : preview?.reason
                        ? `✦ ${preview.reason}`
                        : 'Calculando recomendación…'}
                  </p>
                </div>

                <div>
                  <div className="mb-1 text-xs text-stone-500 dark:text-stone-400">
                    Subtareas · {subs.filter((s) => s.include).length} de {subs.length} incluidas
                  </div>
                  <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
                    {subs.length === 0 && <div className="px-3 py-2.5 text-xs text-stone-500">Esta plantilla no trae subtareas. Agrégalas abajo si las necesitas.</div>}
                    {subs.map((s, i) => (
                      <div key={i} className={`flex flex-wrap items-center gap-2 px-3 py-1.5 ${s.include ? '' : 'opacity-50'}`}>
                        <input type="checkbox" checked={s.include} onChange={(ev) => setSub(i, { include: ev.target.checked })} aria-label="Incluir" />
                        <input
                          className="min-w-40 flex-1 bg-transparent text-sm outline-none"
                          value={s.title}
                          placeholder="Subtarea"
                          onChange={(ev) => setSub(i, { title: ev.target.value })}
                          aria-label="Título de la subtarea"
                        />
                        <select
                          className="max-w-44 rounded border border-stone-200 bg-transparent px-1 py-0.5 text-xs dark:border-stone-700"
                          value={s.assignee_id ?? ''}
                          onChange={(ev) => setSub(i, { assignee_id: ev.target.value || null })}
                          aria-label="Responsable de la subtarea"
                        >
                          <option value="">Sin asignar</option>
                          {active.map((m) => (
                            <option key={m.id} value={m.id}>
                              {memberOption(m, s.skill)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          className="rounded border border-stone-200 bg-transparent px-1 py-0.5 text-xs dark:border-stone-700"
                          value={s.due_date ?? ''}
                          onChange={(ev) => setSub(i, { due_date: ev.target.value || null })}
                          aria-label="Fecha de la subtarea"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                    onClick={() => setSubs([...subs, { title: '', skill: null, assignee_id: null, due_date: due || null, include: true }])}
                  >
                    + Agregar subtarea
                  </button>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={markDone} onChange={(ev) => setMarkDone(ev.target.checked)} />
              Marcar el correo como atendido (sale de tu bandeja)
            </label>

            {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className={btnPrimary} disabled={busy}>
                {busy ? 'Guardando…' : mode === 'asignar' ? 'Crear y asignar' : 'Crear pendiente'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
