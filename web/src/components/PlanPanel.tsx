import { useCallback, useEffect, useState } from 'react'
import { BrandPicker, brandIdsOf } from './Brands'
import { memberName, memberOption, shortDate } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Brand, ListItem, Member, PlanRecommendation, PlanTemplate, Priority, Proposal, ProposalSubtask } from '../lib/types'
import { Tag, btn, btnPrimary, input } from './ui'
import { SuggestedBrand } from './Initiative'

interface Props {
  item: ListItem
  brands: Brand[]
  members: Member[]
  templates: PlanTemplate[]
  skills: string[]
  onClose: () => void
  onConfirmed: () => void
}

// Recomendación del agente para convertir un pendiente en tarea con subtareas.
// La base arma un borrador al instante (habilidad + nivel + carga); el planificador (Claude) lo afina.
export function PlanPanel({ item, brands, members, templates, skills, onClose, onConfirmed }: Props) {
  const [rec, setRec] = useState<PlanRecommendation | null>(null)
  const [draft, setDraft] = useState<Proposal | null>(null)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = members.filter((m) => m.active)
  const owners = active.filter((m) => m.can_own)

  const load = useCallback(
    async (templateId?: string) => {
      setBusy(true)
      setError(null)
      if (templateId || item.status === 'sin_planificar') {
        const { error } = await supabase.rpc('draft_plan', { p_item_id: item.id, p_template_id: templateId ?? null })
        if (error) {
          setBusy(false)
          return setError(error.message)
        }
      }
      const { data, error } = await supabase
        .from('plan_recommendations')
        .select('id, list_item_id, template_id, status, refined_by_ai, proposal, updated_at')
        .eq('list_item_id', item.id)
        .in('status', ['borrador', 'afinada'])
        .maybeSingle()
      setBusy(false)
      if (error) return setError(error.message)
      if (!data) return setError('No hay una recomendación abierta. Cierra y vuelve a pulsar Planificar.')
      setRec(data as PlanRecommendation)
      setDraft((data as PlanRecommendation).proposal)
    },
    [item.id, item.status],
  )

  useEffect(() => {
    load()
  }, [load])

  const set = (patch: Partial<Proposal>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setError(null)
  }
  const setSub = (i: number, patch: Partial<ProposalSubtask>) => {
    setDraft((d) => (d ? { ...d, subtasks: d.subtasks.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d))
    setError(null)
  }
  const addSub = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            subtasks: [
              ...d.subtasks,
              { title: '', skill: null, assignee_id: null, recommended_id: null, due_date: d.due_date, include: true, template_index: null },
            ],
          }
        : d,
    )

  const confirm = async () => {
    if (!draft || !rec) return
    if (!draft.title.trim()) return setError('La tarea necesita un título.')
    if (!draft.assignee_id) return setError('Elige el responsable principal.')
    if (!owners.some((m) => m.id === draft.assignee_id)) return setError('Esa persona no está autorizada como responsable. Autorízala en Equipo o elige otra.')
    if (!draft.due_date) return setError('Pon la fecha límite de la tarea.')
    const bad = draft.subtasks.find((s) => s.include && !s.title.trim())
    if (bad) return setError('Hay una subtarea marcada sin título. Escríbelo o desmárcala.')
    setBusy(true)
    const { error } = await supabase.rpc('confirm_plan', { p_rec_id: rec.id, p_proposal: draft, p_remember: remember })
    setBusy(false)
    if (error) return setError(error.message)
    onConfirmed()
  }

  const discard = async () => {
    if (!rec) return onClose()
    setBusy(true)
    const { error } = await supabase.rpc('discard_plan', { p_rec_id: rec.id })
    setBusy(false)
    if (error) return setError(error.message)
    onClose()
  }

  if (!draft || !rec) {
    return (
      <div className="border-t border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900/60">
        {error ?? 'Preparando la recomendación…'}
        {error && (
          <button className={`${btn} ml-2`} onClick={onClose}>
            Cerrar
          </button>
        )}
      </div>
    )
  }

  const template = templates.find((t) => t.id === rec.template_id)
  const included = draft.subtasks.filter((s) => s.include).length
  const brandIds = draft.brand_ids ?? (draft.brand_id && draft.brand_id !== item.brand_id ? [draft.brand_id] : brandIdsOf(item))

  return (
    <div className="space-y-3 border-t border-indigo-200 bg-indigo-50/40 px-4 py-4 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500 dark:text-stone-400">✦ Recomendación del agente</span>
        {rec.refined_by_ai ? (
          <Tag tone="accent">Afinada por Claude</Tag>
        ) : (
          <Tag tone="warning">Borrador · Claude la afina en la próxima media hora</Tag>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs">
          Plantilla
          <select
            className={`${input} py-1 text-xs`}
            value={rec.template_id ?? ''}
            disabled={busy}
            onChange={(e) => e.target.value && load(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {!rec.refined_by_ai && (
          <button className={`${btn} py-1 text-xs`} onClick={() => load()} disabled={busy}>
            Ver si ya está afinada
          </button>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id={`plan-title-${item.id}`}
          className={`${input} w-full font-medium`}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          aria-label="Título de la tarea"
        />
        <div className="flex flex-wrap gap-2">
          <select
            className={input}
            value={draft.priority}
            onChange={(e) => set({ priority: e.target.value as Priority })}
            aria-label="Prioridad"
          >
            <option value="P1">P1 · hoy</option>
            <option value="P2">P2 · semana</option>
            <option value="P3">P3 · cuando se pueda</option>
          </select>
          <select
            className={input}
            value={draft.effort_points}
            onChange={(e) => set({ effort_points: Number(e.target.value) })}
            aria-label="Esfuerzo"
          >
            <option value={1}>Chica</option>
            <option value={2}>Mediana</option>
            <option value={3}>Grande</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-3 dark:bg-stone-900">
        <div className="max-w-md space-y-1 text-xs">
          <span className="block text-stone-500 dark:text-stone-400">Marcas · la primera es la principal</span>
          <BrandPicker value={brandIds} onChange={(ids) => set({ brand_ids: ids, brand_id: ids[0] ?? null })} brands={brands} />
          {item.suggested_brand && (
            <span className="block pt-1">
              <SuggestedBrand
                itemId={item.id}
                name={item.suggested_brand}
                brands={brands}
                isAdmin
                onAccepted={(id) => id && set({ brand_ids: [...brandIds.filter((x) => x !== id), id], brand_id: brandIds[0] ?? id })}
              />
            </span>
          )}
        </div>
        <label className="space-y-1 text-xs">
          <span className="block text-stone-500 dark:text-stone-400">Habilidad principal</span>
          <select className={input} value={draft.main_skill ?? ''} onChange={(e) => set({ main_skill: e.target.value || null })}>
            <option value="">General</option>
            {skills.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="block text-stone-500 dark:text-stone-400">Responsable principal</span>
          <select
            className={`${input} min-w-48`}
            value={draft.assignee_id ?? ''}
            onChange={(e) => set({ assignee_id: e.target.value || null })}
          >
            <option value="">Elige…</option>
            {owners.map((m) => (
              <option key={m.id} value={m.id}>
                {memberOption(m, draft.main_skill)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="block text-stone-500 dark:text-stone-400">Fecha límite</span>
          <input type="date" className={input} value={draft.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value })} />
        </label>
        <div className="min-w-0 flex-1 text-xs text-stone-500 dark:text-stone-400">
          {draft.assignee_id && draft.assignee_id !== draft.recommended_id ? (
            <>
              Cambiaste la recomendación ({memberName(members, draft.recommended_id) ?? 'nadie'}).
              {remember && template && template.name !== 'Tarea simple' && draft.main_skill && ' Se recordará para esta plantilla.'}
            </>
          ) : (
            draft.reason
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <span>
            Subtareas · {included} de {draft.subtasks.length} incluidas
          </span>
        </div>
        <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {draft.subtasks.length === 0 && (
            <div className="px-3 py-3 text-sm text-stone-500 dark:text-stone-400">Esta plantilla no tiene subtareas. Agrega las que necesites.</div>
          )}
          {draft.subtasks.map((s, i) => {
            const changed = s.assignee_id !== s.recommended_id
            return (
              <div key={i} className={`grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 gap-y-1.5 px-3 py-2 md:grid-cols-[20px_minmax(0,1fr)_140px_190px_140px] md:items-center ${s.include ? '' : 'opacity-50'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={s.include}
                  onChange={(e) => setSub(i, { include: e.target.checked })}
                  aria-label="Incluir subtarea"
                />
                <div className="min-w-0">
                  <input
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="Título de la subtarea"
                    value={s.title}
                    onChange={(e) => setSub(i, { title: e.target.value })}
                    aria-label="Título de la subtarea"
                  />
                  {s.reason && !changed && <div className="truncate text-[11px] text-stone-400">{s.reason}</div>}
                  {s.include && s.due_date && draft.due_date && s.due_date > draft.due_date && (
                    <div className="text-[11px] text-stone-400">Vence después de la tarea (seguimiento posterior)</div>
                  )}
                  {changed && s.recommended_id !== undefined && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">
                      Cambiado · el agente sugería {memberName(members, s.recommended_id) ?? 'dejarla sin asignar'}
                    </div>
                  )}
                </div>
                <select
                  className={`${input} col-start-2 py-1 text-xs md:col-start-auto`}
                  value={s.skill ?? ''}
                  onChange={(e) => setSub(i, { skill: e.target.value || null })}
                  aria-label="Habilidad"
                >
                  <option value="">Sin habilidad</option>
                  {skills.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <select
                  className={`${input} col-start-2 py-1 text-xs md:col-start-auto`}
                  value={s.assignee_id ?? ''}
                  onChange={(e) => setSub(i, { assignee_id: e.target.value || null })}
                  aria-label="Responsable"
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
                  className={`${input} col-start-2 py-1 text-xs md:col-start-auto`}
                  value={s.due_date ?? ''}
                  onChange={(e) => setSub(i, { due_date: e.target.value || null })}
                  aria-label="Fecha límite"
                />
              </div>
            )
          })}
        </div>
        <button className="mt-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={addSub}>
          + Agregar subtarea
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-indigo-100 pt-3 dark:border-indigo-900">
        {template && template.name !== 'Tarea simple' && (
          <label className="mr-auto flex items-center gap-2 text-xs">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Recordar mis cambios en "{template.name}"
          </label>
        )}
        {!(template && template.name !== 'Tarea simple') && <span className="mr-auto" />}
        <span className="text-xs text-stone-400">vence {shortDate(draft.due_date)}</span>
        <button className={btn} onClick={discard} disabled={busy}>
          Descartar
        </button>
        <button className={btnPrimary} onClick={confirm} disabled={busy}>
          {busy ? 'Guardando…' : 'Confirmar y asignar'}
        </button>
      </div>
      {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}
