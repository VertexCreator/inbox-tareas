import { useCallback, useEffect, useState } from 'react'
import { hasBrand } from '../components/Brands'
import { memberName, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Brand, LogEntry, PlanTemplate, PrioritiesConfig, Rule, Settings, Sticker, StickerCategory, TemplateItem } from '../lib/types'
import { TagInput } from '../components/TagInput'
import { ColorPicker } from '../components/ColorPicker'
import { chipClass } from '../components/colors'
import { Card, Empty, SectionTitle, Tag, btn, btnPrimary, input, relativeDate } from '../components/ui'

const MODE_LABEL: Record<string, string> = {
  auto: 'Automática',
  sugerida: 'Sugerida',
  aprobada: 'Aprobada',
  corregida: 'Corregida',
  manual: 'Manual',
}

type Status = { tone: 'ok' | 'error'; text: string } | null

function StatusText({ status }: { status: Status }) {
  if (!status) return null
  return (
    <span className={`text-[13px] ${status.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
      {status.text}
    </span>
  )
}

const SUMMARY_PARTS: { key: keyof PrioritiesConfig['summary']['include']; label: string }[] = [
  { key: 'p1', label: 'Qué responder primero (P1)' },
  { key: 'p2', label: 'Pendientes de la semana (P2)' },
  { key: 'tasks', label: 'Pendientes y planes nuevos' },
  { key: 'load', label: 'Carga del equipo' },
  { key: 'junk', label: 'Cuánta basura llegó' },
  { key: 'suspicious', label: 'Correos sospechosos' },
]
const LENGTHS = [
  { value: 'corto', label: 'Corto', lines: 3 },
  { value: 'normal', label: 'Normal', lines: 6 },
  { value: 'detallado', label: 'Detallado', lines: 12 },
] as const

// Prioridades y formato del resumen. La base convierte esto en el texto que lee el agente.
function PrioritiesConfigEditor() {
  const [saved, setSaved] = useState<PrioritiesConfig | null>(null)
  const [c, setC] = useState<PrioritiesConfig | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('agent_priorities')
      .select('config')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setStatus({ tone: 'error', text: error.message })
        setSaved(data?.config as PrioritiesConfig)
        setC(data?.config as PrioritiesConfig)
      })
  }, [])

  if (!c || !saved) return status ? <StatusText status={status} /> : null
  const dirty = JSON.stringify(c) !== JSON.stringify(saved)
  const set = (patch: Partial<PrioritiesConfig>) => {
    setC({ ...c, ...patch })
    setStatus(null)
  }
  const setSummary = (patch: Partial<PrioritiesConfig['summary']>) => set({ summary: { ...c.summary, ...patch } })

  const save = async () => {
    if (!c.categories.length) return setStatus({ tone: 'error', text: 'Deja al menos una categoría.' })
    if (!Object.values(c.summary.include).some(Boolean)) return setStatus({ tone: 'error', text: 'El resumen tiene que incluir algo.' })
    setBusy(true)
    const { error } = await supabase.from('agent_priorities').update({ config: c, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) return setStatus({ tone: 'error', text: error.message })
    setSaved(c)
    setStatus({ tone: 'ok', text: 'Guardado. Se aplica en la próxima revisión del agente.' })
  }

  const lines = LENGTHS.find((l) => l.value === c.summary.length)?.lines ?? 6
  const preview = [
    c.summary.include.p1 && 'Lo primero: firmar el contrato de Klub antes de las 17:00 (borrador listo).',
    c.summary.include.p2 && 'Esta semana: feedback al presupuesto de Black The Agency.',
    c.summary.include.tasks && '2 pendientes nuevos desde correos, con plan recomendado para Ana y Diego.',
    c.summary.include.load && 'Ana va al 92% de carga.',
    c.summary.include.junk && 'El script filtró 31 correos de basura.',
    c.summary.include.suspicious && 'Sin correos sospechosos.',
  ]
    .filter(Boolean)
    .slice(0, lines)

  const levels = [
    { key: 'p1' as const, label: 'P1 · Hoy', cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200' },
    { key: 'p2' as const, label: 'P2 · Semana', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
    { key: 'junk' as const, label: 'Basura', cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' },
  ]

  return (
    <div className="space-y-4">
      <Card className="space-y-1 p-4">
        <SectionTitle>Qué es prioritario</SectionTitle>
        <p className="pb-2 text-xs text-stone-500 dark:text-stone-400">Escribe un tema y pulsa Enter. El agente los usa para decidir el nivel de cada correo.</p>
        {levels.map((l) => (
          <div key={l.key} className="grid gap-2 border-t border-stone-200 py-3 md:grid-cols-[120px_minmax(0,1fr)] dark:border-stone-800">
            <span className={`h-fit w-fit rounded-md px-2 py-0.5 text-xs font-medium ${l.cls}`}>{l.label}</span>
            <TagInput id={`prio-${l.key}`} values={c[l.key]} onChange={(v) => set({ [l.key]: v })} placeholder="Agregar tema…" />
          </div>
        ))}
        <div className="grid gap-2 border-t border-stone-200 py-3 md:grid-cols-[120px_minmax(0,1fr)] dark:border-stone-800">
          <span className="text-xs text-stone-500 dark:text-stone-400">Categorías</span>
          <TagInput id="prio-categories" values={c.categories} onChange={(v) => set({ categories: v })} placeholder="Agregar categoría…" />
        </div>
        <div className="grid gap-2 border-t border-stone-200 py-3 md:grid-cols-[120px_minmax(0,1fr)] dark:border-stone-800">
          <label htmlFor="prio-create" className="text-xs text-stone-500 dark:text-stone-400">
            Cuándo crear pendientes
          </label>
          <textarea id="prio-create" className={`${input} w-full`} rows={2} value={c.create_items} onChange={(e) => set({ create_items: e.target.value })} />
        </div>
        <div className="grid gap-2 border-t border-stone-200 pt-3 md:grid-cols-[120px_minmax(0,1fr)] dark:border-stone-800">
          <label htmlFor="prio-notes" className="text-xs text-stone-500 dark:text-stone-400">
            Notas para el agente
          </label>
          <textarea
            id="prio-notes"
            className={`${input} w-full`}
            rows={2}
            placeholder="Ej. Los viernes no hay que responder a proveedores."
            value={c.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionTitle>Resumen del día</SectionTitle>
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          {SUMMARY_PARTS.map((p) => (
            <label key={p.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              {p.label}
              <input
                type="checkbox"
                role="switch"
                className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-stone-300 transition before:block before:h-3 before:w-3 before:translate-x-0.5 before:rounded-full before:bg-white before:transition checked:bg-indigo-600 checked:before:translate-x-4 dark:bg-stone-700"
                checked={c.summary.include[p.key]}
                onChange={(e) => setSummary({ include: { ...c.summary.include, [p.key]: e.target.checked } })}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Largo</span>
          <div className="flex overflow-hidden rounded-lg border border-stone-300 dark:border-stone-700">
            {LENGTHS.map((l) => (
              <button
                key={l.value}
                className={`px-3 py-1.5 text-xs ${c.summary.length === l.value ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : ''}`}
                onClick={() => setSummary({ length: l.value })}
              >
                {l.label} · {l.lines} líneas
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
          <span className="font-medium text-stone-800 dark:text-stone-100">Vista previa (ejemplo):</span> {preview.join(' ')}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <StatusText status={status} />
        {dirty && (
          <button className={btn} onClick={() => setC(saved)} disabled={busy}>
            Descartar cambios
          </button>
        )}
        <button className={btnPrimary} onClick={save} disabled={busy || !dirty}>
          Guardar configuración
        </button>
      </div>
    </div>
  )
}

const SENDER_PATTERN = /^(@?[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[a-z0-9.-]+\.[a-z]{2,})$/
const senderProblem = (v: string) => (SENDER_PATTERN.test(v) ? null : 'Usa un correo (ana@empresa.com) o un dominio (@empresa.com).')

// Listas que el script de Gmail aplica sin IA: los VIP nunca son basura; los de basura nunca llegan a Claude.
function SenderFilters() {
  const [vip, setVip] = useState<string[] | null>(null)
  const [junk, setJunk] = useState<string[]>([])
  const [me, setMe] = useState<string[]>([])
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState<Status>(null)

  useEffect(() => {
    supabase
      .from('agent_priorities')
      .select('vip_senders, junk_senders, my_aliases')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setStatus({ tone: 'error', text: error.message })
        setVip(data?.vip_senders ?? [])
        setJunk(data?.junk_senders ?? [])
        setMe(data?.my_aliases ?? [])
        setSaved(JSON.stringify([data?.vip_senders ?? [], data?.junk_senders ?? [], data?.my_aliases ?? []]))
      })
  }, [])

  if (!vip) return null
  const dirty = JSON.stringify([vip, junk, me]) !== saved

  const save = async () => {
    const both = vip.filter((s) => junk.includes(s))
    if (both.length) return setStatus({ tone: 'error', text: `${both[0]} está en las dos listas; déjalo solo en una.` })
    if (!me.length) return setStatus({ tone: 'error', text: 'Deja al menos una forma en que te mencionan.' })
    const { error } = await supabase.from('agent_priorities').update({ vip_senders: vip, junk_senders: junk, my_aliases: me }).eq('id', 1)
    if (error) return setStatus({ tone: 'error', text: error.message })
    setSaved(JSON.stringify([vip, junk, me]))
    setStatus({ tone: 'ok', text: 'Guardado. El script lo usa en su próxima revisión (máx. 15 min).' })
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle>Filtros del script de Gmail</SectionTitle>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Un correo o un dominio completo (@cliente.com). Promociones, Social y Foros ya se filtran solos.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="vip-senders" className="text-sm font-medium">
            Remitentes VIP
          </label>
          <div className="text-xs text-stone-500 dark:text-stone-400">Nunca se tratan como basura.</div>
          <TagInput id="vip-senders" tone="accent" values={vip} onChange={(v) => { setVip(v); setStatus(null) }} placeholder="@cliente.com" normalize={(v) => v.toLowerCase()} validate={senderProblem} />
        </div>
        <div className="space-y-1">
          <label htmlFor="junk-senders" className="text-sm font-medium">
            Remitentes basura
          </label>
          <div className="text-xs text-stone-500 dark:text-stone-400">Se cuentan, pero Claude no los lee.</div>
          <TagInput id="junk-senders" values={junk} onChange={(v) => { setJunk(v); setStatus(null) }} placeholder="@tienda.com" normalize={(v) => v.toLowerCase()} validate={senderProblem} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="my-aliases" className="text-sm font-medium">
          Cómo te mencionan
        </label>
        <div className="text-xs text-stone-500 dark:text-stone-400">
          En correos con muchos destinatarios, el script busca "@" o "+" seguido de estos nombres (sin importar tildes), tu nombre
          completo o tu correo, y le pasa a Claude solo el párrafo donde te mencionan.
        </div>
        <TagInput id="my-aliases" tone="accent" values={me} onChange={(v) => { setMe(v); setStatus(null) }} placeholder="sofía gómez" normalize={(v) => v.toLowerCase().replace(/^[@+]/, '')} />
      </div>
      <div className="flex items-center gap-2">
        <button className={btnPrimary} disabled={!dirty} onClick={save}>
          Guardar filtros
        </button>
        <StatusText status={status} />
      </div>
    </Card>
  )
}

// Plantillas de planes: subtareas típicas, habilidad y cuántos días antes de la fecha límite.
function TemplatesEditor({ skills }: { skills: string[] }) {
  const { members } = useBoard()
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [prefs, setPrefs] = useState<{ template_id: string; skill: string; member_id: string }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlanTemplate | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('plan_templates').select('*').order('name'),
      supabase.from('plan_preferences').select('template_id, skill, member_id'),
    ])
    if (t.error) return setStatus({ tone: 'error', text: t.error.message })
    setTemplates((t.data ?? []) as PlanTemplate[])
    setPrefs(p.data ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = (t: PlanTemplate) => {
    setSelected(t.id)
    setDraft(structuredClone(t))
    setStatus(null)
    setConfirmDelete(false)
  }

  const setItem = (i: number, patch: Partial<TemplateItem>) =>
    draft && setDraft({ ...draft, items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const move = (i: number, d: -1 | 1) => {
    if (!draft) return
    const items = [...draft.items]
    const j = i + d
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    setDraft({ ...draft, items })
  }

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) return setStatus({ tone: 'error', text: 'Ponle un nombre a la plantilla.' })
    if (draft.items.some((it) => !it.title.trim())) return setStatus({ tone: 'error', text: 'Hay una subtarea sin título.' })
    const row = {
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      keywords: draft.keywords.map((k) => k.toLowerCase()),
      main_skill: draft.main_skill || null,
      effort_points: draft.effort_points,
      items: draft.items.map((it) => ({ ...it, title: it.title.trim(), days_before: Math.round(Number(it.days_before) || 0) })),
    }
    const res = draft.id
      ? await supabase.from('plan_templates').update(row).eq('id', draft.id)
      : await supabase.from('plan_templates').insert(row).select('id').single()
    if (res.error) return setStatus({ tone: 'error', text: res.error.message.includes('duplicate') ? 'Ya existe una plantilla con ese nombre.' : res.error.message })
    setStatus({ tone: 'ok', text: 'Plantilla guardada.' })
    if (!draft.id && 'data' in res && res.data) setSelected((res.data as { id: string }).id)
    load()
  }

  const remove = async () => {
    if (!draft?.id) return
    const { error } = await supabase.from('plan_templates').delete().eq('id', draft.id)
    if (error) return setStatus({ tone: 'error', text: error.message })
    setSelected(null)
    setDraft(null)
    load()
  }

  const forget = async (skill: string) => {
    if (!draft?.id) return
    await supabase.from('plan_preferences').delete().eq('template_id', draft.id).eq('skill', skill)
    load()
  }

  const blank = (): PlanTemplate => ({ id: '', name: '', description: '', keywords: [], main_skill: null, effort_points: 2, items: [], usage_count: 0 })
  const myPrefs = prefs.filter((p) => p.template_id === selected)

  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-1">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => open(t)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              selected === t.id ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'hover:bg-stone-100 dark:hover:bg-stone-900'
            }`}
          >
            {t.name}
            <span className="text-[11px] text-stone-400">{t.usage_count ? `${t.usage_count} usos` : ''}</span>
          </button>
        ))}
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-indigo-600 hover:bg-stone-100 dark:text-indigo-400 dark:hover:bg-stone-900" onClick={() => { setSelected('new'); setDraft(blank()); setStatus(null) }}>
          + Nueva plantilla
        </button>
      </div>

      {!draft ? (
        <Card>
          <Empty>Elige una plantilla para ver y editar sus subtareas.</Empty>
        </Card>
      ) : (
        <Card className="space-y-3 p-4">
          <div className="grid gap-2 md:grid-cols-2">
            <input id="tpl-name" className={input} placeholder="Nombre de la plantilla" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nombre" />
            <input id="tpl-desc" className={input} placeholder="Para qué sirve" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Descripción" />
          </div>
          <div className="space-y-1">
            <label htmlFor="tpl-keywords" className="text-xs text-stone-500 dark:text-stone-400">
              Palabras que la activan (si el pendiente las menciona, el agente propone esta plantilla)
            </label>
            <TagInput id="tpl-keywords" values={draft.keywords} onChange={(v) => setDraft({ ...draft, keywords: v })} placeholder="instagram, campaña…" normalize={(v) => v.toLowerCase()} />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-xs">
              <span className="block text-stone-500 dark:text-stone-400">Habilidad del responsable principal</span>
              <select className={input} value={draft.main_skill ?? ''} onChange={(e) => setDraft({ ...draft, main_skill: e.target.value || null })}>
                <option value="">General</option>
                {skills.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="block text-stone-500 dark:text-stone-400">Esfuerzo de la tarea</span>
              <select className={input} value={draft.effort_points} onChange={(e) => setDraft({ ...draft, effort_points: Number(e.target.value) })}>
                <option value={1}>Chica</option>
                <option value={2}>Mediana</option>
                <option value={3}>Grande</option>
              </select>
            </label>
          </div>

          <div>
            <div className="mb-1 grid grid-cols-[minmax(0,1fr)_150px_110px_90px_56px] gap-2 text-[11px] text-stone-500 dark:text-stone-400">
              <span>Subtarea</span>
              <span>Habilidad</span>
              <span>Días antes del límite</span>
              <span>Opcional</span>
              <span />
            </div>
            <div className="space-y-1.5">
              {draft.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_150px_110px_90px_56px] items-center gap-2">
                  <input className={`${input} py-1`} value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} aria-label="Título" />
                  <select className={`${input} py-1 text-xs`} value={it.skill ?? ''} onChange={(e) => setItem(i, { skill: e.target.value || null })} aria-label="Habilidad">
                    <option value="">Sin habilidad</option>
                    {skills.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step={1}
                    className={`${input} py-1`}
                    value={it.days_before}
                    onChange={(e) => setItem(i, { days_before: Math.round(Number(e.target.value)) })}
                    aria-label="Días antes de la fecha límite"
                    title="Negativo = después de la fecha límite (ej. -7 para un reporte)"
                  />
                  <input type="checkbox" className="justify-self-center" checked={it.optional} onChange={(e) => setItem(i, { optional: e.target.checked })} aria-label="Opcional" />
                  <span className="flex gap-0.5">
                    <button className="px-1 text-stone-400 hover:text-stone-700" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                    <button className="px-1 text-stone-400 hover:text-stone-700" onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
                    <button className="px-1 text-stone-400 hover:text-red-600" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} aria-label="Quitar">×</button>
                  </span>
                </div>
              ))}
            </div>
            <button
              className="mt-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={() => setDraft({ ...draft, items: [...draft.items, { title: '', skill: null, days_before: 0, optional: false }] })}
            >
              + Agregar subtarea
            </button>
            <p className="mt-1 text-[11px] text-stone-400">Negativo = después de la fecha límite (por ejemplo -7 para un reporte de resultados).</p>
          </div>

          {myPrefs.length > 0 && (
            <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/60">
              <div className="mb-1 text-xs font-medium">Lo que aprendió de tus cambios</div>
              <div className="flex flex-wrap gap-1.5">
                {myPrefs.map((p) => (
                  <span key={p.skill} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs dark:bg-stone-900">
                    {p.skill} → {memberName(members, p.member_id) ?? '—'}
                    <button className="text-stone-400 hover:text-red-600" onClick={() => forget(p.skill)} aria-label={`Olvidar ${p.skill}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
            {draft.id && draft.name !== 'Tarea simple' && (
              confirmDelete ? (
                <>
                  <span className="text-xs text-red-600">¿Borrar "{draft.name}"?</span>
                  <button className={`${btn} text-red-600`} onClick={remove}>Sí, borrar</button>
                  <button className={btn} onClick={() => setConfirmDelete(false)}>No</button>
                </>
              ) : (
                <button className={`${btn} text-red-600 dark:text-red-400`} onClick={() => setConfirmDelete(true)}>
                  Borrar plantilla
                </button>
              )
            )}
            <span className="ml-auto" />
            <StatusText status={status} />
            <button className={btnPrimary} onClick={save}>
              Guardar plantilla
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

function SkillsCatalog({ skills, onChanged }: { skills: string[]; onChanged: () => void }) {
  const [status, setStatus] = useState<Status>(null)
  const change = async (next: string[]) => {
    setStatus(null)
    const added = next.filter((s) => !skills.includes(s))
    const removed = skills.filter((s) => !next.includes(s))
    for (const name of added) {
      const { error } = await supabase.from('skills').insert({ name })
      if (error) return setStatus({ tone: 'error', text: error.message })
    }
    for (const name of removed) {
      const { error } = await supabase.from('skills').delete().eq('name', name)
      if (error) return setStatus({ tone: 'error', text: error.message })
    }
    onChanged()
  }
  return (
    <Card className="space-y-2 p-4">
      <SectionTitle>Catálogo de habilidades</SectionTitle>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Son las que eliges en el perfil de cada persona y en las plantillas. Quitar una del catálogo no la borra de los perfiles que ya la tienen.
      </p>
      <TagInput id="skills-catalog" tone="accent" values={skills} onChange={change} placeholder="Agregar habilidad…" />
      <StatusText status={status} />
    </Card>
  )
}


const CATEGORY_LABEL: Record<StickerCategory, string> = {
  abierto: 'Sin empezar',
  en_curso: 'En curso',
  terminado: 'Terminado',
  cancelado: 'Cancelado',
}

// Marcas y stickers de estatus: nombre, color, orden y cómo cuenta cada sticker.
function BrandsStickers() {
  const { brands, stickers, tasks, reload } = useBoard()
  const [status, setStatus] = useState<Status>(null)
  const [confirmSticker, setConfirmSticker] = useState<string | null>(null)

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setStatus(null)
    const { error } = await fn()
    if (error) setStatus({ tone: 'error', text: error.message.includes('duplicate') ? 'Ese nombre ya existe.' : error.message })
    reload()
  }

  const updateBrand = (b: Brand, patch: Partial<Brand>) => run(() => supabase.from('brands').update(patch).eq('id', b.id))
  const updateSticker = (s: Sticker, patch: Partial<Sticker>) => run(() => supabase.from('status_stickers').update(patch).eq('id', s.id))
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= stickers.length) return
    const a = stickers[i]
    const b = stickers[j]
    await supabase.from('status_stickers').update({ position: b.position }).eq('id', a.id)
    await run(() => supabase.from('status_stickers').update({ position: a.position }).eq('id', b.id))
  }
  const removeSticker = (s: Sticker) => {
    const used = tasks.filter((t) => t.sticker_id === s.id).length
    if (used) return setStatus({ tone: 'error', text: `"${s.name}" está en ${used} iniciativas. Muévelas a otro sticker antes de borrarlo.` })
    setConfirmSticker(null)
    run(() => supabase.from('status_stickers').delete().eq('id', s.id))
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle>Marcas</SectionTitle>
        <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
          Los alias ayudan al agente a reconocer la marca en los correos: dominios del cliente (@peros.cl), nombres de productos o
          como la mencionan. Si el agente detecta una marca que no existe, la verás sugerida en Listas para crearla con un clic.
        </p>
        {brands.length === 0 && <p className="text-sm text-stone-500">Crea marcas desde el Tablero con "+ Marca".</p>}
        <div className="divide-y divide-stone-200 dark:divide-stone-800">
          {brands.map((b) => (
            <div key={b.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${b.archived ? 'opacity-60' : ''}`}>
              <input
                className={`${input} w-48 py-1`}
                defaultValue={b.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && updateBrand(b, { name: e.target.value.trim() })}
                aria-label="Nombre de la marca"
              />
              <ColorPicker value={b.color} onChange={(c) => updateBrand(b, { color: c })} />
              <span className="text-xs text-stone-500">{tasks.filter((t) => hasBrand(t, b.id)).length} iniciativas</span>
              <button className={`${btn} ml-auto`} onClick={() => updateBrand(b, { archived: !b.archived })}>
                {b.archived ? 'Reactivar' : 'Archivar'}
              </button>
              <div className="basis-full">
                <TagInput
                  id={`aliases-${b.id}`}
                  values={b.aliases ?? []}
                  onChange={(v) => updateBrand(b, { aliases: v })}
                  normalize={(v) => v.toLowerCase()}
                  placeholder="Alias: @dominio.com, nombre de producto, cómo la llaman los clientes…"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>Stickers de estatus</SectionTitle>
        <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
          El orden es el de las columnas del tablero. "Cómo cuenta" define si suma a la carga de la persona (en curso), al avance (terminado) o a nada (cancelado).
        </p>
        <div className="divide-y divide-stone-200 dark:divide-stone-800">
          {stickers.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="flex flex-col">
                <button className="px-1 text-xs text-stone-400 hover:text-stone-700" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                <button className="px-1 text-xs text-stone-400 hover:text-stone-700" onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${chipClass(s.color)}`}>{s.name}</span>
              <input
                className={`${input} w-44 py-1`}
                defaultValue={s.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && updateSticker(s, { name: e.target.value.trim() })}
                aria-label="Nombre del sticker"
              />
              <ColorPicker value={s.color} onChange={(c) => updateSticker(s, { color: c })} />
              <select className={`${input} py-1 text-xs`} value={s.category} onChange={(e) => updateSticker(s, { category: e.target.value as StickerCategory })} aria-label="Cómo cuenta">
                {(Object.keys(CATEGORY_LABEL) as StickerCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              {confirmSticker === s.id ? (
                <span className="ml-auto flex gap-1.5">
                  <button className={`${btn} text-red-600`} onClick={() => removeSticker(s)}>Sí, borrar</button>
                  <button className={btn} onClick={() => setConfirmSticker(null)}>No</button>
                </span>
              ) : (
                <button className={`${btn} ml-auto text-red-600 dark:text-red-400`} onClick={() => setConfirmSticker(s.id)}>
                  Borrar
                </button>
              )}
            </div>
          ))}
        </div>
        <StatusText status={status} />
      </Card>
    </div>
  )
}


// Plazo en que el script busca el correo de cada tarea creada a mano.
function EmailSearchDays() {
  const [days, setDays] = useState<number | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>(null)

  useEffect(() => {
    supabase
      .from('settings')
      .select('email_search_days')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        setDays(data?.email_search_days ?? 30)
        setSaved(data?.email_search_days ?? 30)
      })
  }, [])

  if (days === null) return null
  const save = async () => {
    if (!(days >= 7 && days <= 180)) return setStatus({ tone: 'error', text: 'Usa un plazo entre 7 y 180 días.' })
    const { error } = await supabase.from('settings').update({ email_search_days: days }).eq('id', 1)
    if (error) return setStatus({ tone: 'error', text: error.message })
    setSaved(days)
    setStatus({ tone: 'ok', text: 'Guardado. Vale para las próximas tareas que crees.' })
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle>Buscar el correo de las tareas manuales</SectionTitle>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Cuando creas una tarea a mano, el script busca en Gmail el correo relacionado (por nombre, descripción y marca) dentro
        de este plazo, y lo vincula a la tarea. Revisa cada 5 minutos.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {[30, 45, 60].map((n) => (
          <button
            key={n}
            className={`rounded-lg px-3 py-1.5 text-sm ${days === n ? 'bg-indigo-50 font-medium text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800' : 'bg-stone-100 dark:bg-stone-800'}`}
            onClick={() => {
              setDays(n)
              setStatus(null)
            }}
          >
            {n} días
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm">
          Otro:
          <input
            id="email-search-days"
            type="number"
            min={7}
            max={180}
            step={1}
            className={`${input} w-20`}
            value={days}
            onChange={(e) => {
              setDays(Math.round(Number(e.target.value)))
              setStatus(null)
            }}
          />
          días
        </label>
        <button className={btnPrimary} disabled={days === saved} onClick={save}>
          Guardar
        </button>
        <StatusText status={status} />
      </div>
    </Card>
  )
}

const TABS = [
  { id: 'prioridades', label: 'Prioridades y resumen' },
  { id: 'marcas', label: 'Marcas y stickers' },
  { id: 'plantillas', label: 'Plantillas' },
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'script', label: 'Script de Gmail' },
  { id: 'reparto', label: 'Reparto e historial' },
] as const

export function Configuracion() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>(() => {
    const h = window.location.hash.replace('#', '')
    return (TABS.find((t) => t.id === h)?.id ?? 'prioridades') as (typeof TABS)[number]['id']
  })
  const [skills, setSkills] = useState<string[]>([])
  const loadSkills = useCallback(() => {
    supabase
      .from('skills')
      .select('name')
      .order('name')
      .then(({ data }) => setSkills((data ?? []).map((x) => x.name as string)))
  }, [])
  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium">Configuración del agente</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">Los cambios se aplican en la próxima revisión.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-stone-200 dark:border-stone-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              history.replaceState(null, '', `#${t.id}`)
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.id ? 'border-indigo-600 font-medium text-indigo-700 dark:text-indigo-300' : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'prioridades' && <PrioritiesConfigEditor />}
      {tab === 'marcas' && <BrandsStickers />}
      {tab === 'plantillas' && <TemplatesEditor skills={skills} />}
      {tab === 'habilidades' && <SkillsCatalog skills={skills} onChanged={loadSkills} />}
      {tab === 'script' && (
        <div className="space-y-4">
          <SenderFilters />
          <EmailSearchDays />
          <ScriptConnection />
        </div>
      )}
      {tab === 'reparto' && <RepartoSection />}
    </div>
  )
}


interface IngestState {
  secret: string
  last_ingest_at: string | null
  last_queued: number
  last_junk: number
}

// La clave que va en las propiedades del Apps Script, y si el script sigue enviando correos.
function ScriptConnection() {
  const [state, setState] = useState<IngestState | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [reveal, setReveal] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [s, q] = await Promise.all([
      supabase.from('ingest_state').select('secret, last_ingest_at, last_queued, last_junk').eq('id', 1).maybeSingle(),
      supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
    ])
    if (s.error) return setStatus({ tone: 'error', text: s.error.message })
    setState(s.data as IngestState | null)
    setPending(q.count ?? null)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const copy = async () => {
    if (!state) return
    try {
      await navigator.clipboard.writeText(state.secret)
      setStatus({ tone: 'ok', text: 'Clave copiada.' })
    } catch {
      setReveal(true)
      setStatus({ tone: 'error', text: 'No se pudo copiar; selecciónala y cópiala a mano.' })
    }
  }

  const rotate = async () => {
    const { error } = await supabase.rpc('rotate_ingest_secret')
    setConfirmRotate(false)
    if (error) return setStatus({ tone: 'error', text: error.message })
    setReveal(true)
    setStatus({ tone: 'ok', text: 'Clave nueva creada. Pégala en INGEST_SECRET del Apps Script: la anterior ya no funciona.' })
    load()
  }

  if (!state) return null
  const stale = !state.last_ingest_at || Date.now() - new Date(state.last_ingest_at).getTime() > 2 * 3600 * 1000

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle
        right={
          <Tag tone={stale ? 'warning' : 'accent'}>
            {state.last_ingest_at ? `Último envío ${relativeDate(state.last_ingest_at)}` : 'Sin conectar'}
          </Tag>
        }
      >
        Script de Gmail
      </SectionTitle>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {state.last_ingest_at
          ? `Última revisión: ${state.last_queued} a la cola y ${state.last_junk} basura. ${pending ?? 0} correos esperan el próximo análisis de Claude.`
          : 'El script todavía no ha enviado nada. Sigue la sección "Script de Gmail" de INSTALACION.md.'}
        {state.last_ingest_at && stale ? ' Lleva más de 2 horas sin enviar: revisa el Apps Script.' : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Clave del script (INGEST_SECRET):</span>
        <code className="select-all rounded-md bg-stone-100 px-2 py-1 font-mono text-xs dark:bg-stone-800">
          {reveal ? state.secret : '•'.repeat(16)}
        </code>
        <button className={btn} onClick={() => setReveal((v) => !v)}>
          {reveal ? 'Ocultar' : 'Mostrar'}
        </button>
        <button className={btn} onClick={copy}>
          Copiar
        </button>
        {confirmRotate ? (
          <>
            <span className="text-xs text-amber-700 dark:text-amber-300">El script dejará de funcionar hasta que pegues la nueva.</span>
            <button className={`${btn} text-red-600 dark:text-red-400`} onClick={rotate}>
              Sí, regenerar
            </button>
            <button className={btn} onClick={() => setConfirmRotate(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button className={btn} onClick={() => setConfirmRotate(true)}>
            Regenerar
          </button>
        )}
      </div>
      {status && (
        <div className={`text-[13px] ${status.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {status.text}
        </div>
      )}
    </Card>
  )
}

function RepartoSection() {
  const { members, tasks } = useBoard()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, r, l] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('assignment_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('assignment_log').select('*').order('created_at', { ascending: false }).limit(40),
    ])
    const err = s.error ?? r.error ?? l.error
    setError(err ? err.message : null)
    setSettings(s.data as Settings | null)
    setRules((r.data ?? []) as Rule[])
    setLog((l.data ?? []) as LogEntry[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveSettings = async (patch: Partial<Settings>) => {
    const { error } = await supabase.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) setError(error.message)
    else load()
  }

  const toggleRule = async (r: Rule) => {
    const { error } = await supabase.from('assignment_rules').update({ active: !r.active }).eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  const deleteRule = async (r: Rule) => {
    const { error } = await supabase.from('assignment_rules').delete().eq('id', r.id)
    if (error) setError(error.message)
    else load()
  }

  const taskTitle = (id: string) => tasks.find((t) => t.id === id)?.title ?? 'Tarea eliminada'

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {settings && (
        <Card className="space-y-4 p-4">
          <div>
            <SectionTitle>Nivel de autonomía</SectionTitle>
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  ['sugerencia', 'Modo sugerencia', 'El agente propone y tú apruebas o corriges cada tarea. Recomendado las primeras semanas.'],
                  ['automatico', 'Modo automático', 'Asigna solo cuando hay regla o especialidad clara. Te consulta si alguien está saturado o es un P1 urgente.'],
                ] as const
              ).map(([value, title, desc]) => (
                <button
                  key={value}
                  onClick={() => saveSettings({ autonomy: value })}
                  className={`rounded-lg border p-3 text-left ${
                    settings.autonomy === value
                      ? 'border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
                      : 'border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Considerar saturado a un especialista desde
            <select
              className={input}
              value={String(settings.saturation_threshold)}
              onChange={(e) => saveSettings({ saturation_threshold: Number(e.target.value) })}
            >
              {[0.7, 0.8, 0.9, 1].map((v) => (
                <option key={v} value={String(v)}>
                  {Math.round(v * 100)}% de carga
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      <section>
        <SectionTitle>Reglas aprendidas de tus correcciones ({rules.length})</SectionTitle>
        <Card>
          {rules.length === 0 ? (
            <Empty>Todavía no hay reglas. Cuando corrijas un reparto y escribas una palabra clave, aparecerá aquí.</Empty>
          ) : (
            rules.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-3 px-4 py-2.5 ${i ? 'border-t border-stone-200 dark:border-stone-800' : ''}`}>
                <span className={`text-sm ${r.active ? '' : 'text-stone-400 line-through'}`}>
                  Si la tarea menciona <span className="font-medium">"{r.keyword}"</span> → {memberName(members, r.member_id) ?? '—'}
                </span>
                <div className="ml-auto flex gap-1.5">
                  <button className={btn} onClick={() => toggleRule(r)}>
                    {r.active ? 'Pausar' : 'Activar'}
                  </button>
                  <button className={`${btn} text-red-600 dark:text-red-400`} onClick={() => deleteRule(r)}>
                    Borrar
                  </button>
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Historial de decisiones</SectionTitle>
        <Card>
          {log.length === 0 ? (
            <Empty>Sin decisiones aún.</Empty>
          ) : (
            log.map((l, i) => (
              <div key={l.id} className={`px-4 py-2.5 text-sm ${i ? 'border-t border-stone-200 dark:border-stone-800' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={l.mode === 'corregida' ? 'warning' : l.mode === 'auto' ? 'accent' : 'neutral'}>{MODE_LABEL[l.mode] ?? l.mode}</Tag>
                  <span className="font-medium">{taskTitle(l.task_id)}</span>
                  <span>→ {memberName(members, l.member_id) ?? '—'}</span>
                  <span className="ml-auto text-xs text-stone-400">
                    {l.actor} · {relativeDate(l.created_at)}
                  </span>
                </div>
                {l.reason && <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{l.reason}</div>}
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  )
}
