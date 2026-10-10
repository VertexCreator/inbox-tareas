import { useCallback, useEffect, useState } from 'react'
import { memberName, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { LogEntry, Rule, Settings } from '../lib/types'
import { Card, Empty, SectionTitle, Tag, btn, btnPrimary, input, relativeDate } from '../components/ui'

const MODE_LABEL: Record<string, string> = {
  auto: 'Automática',
  sugerida: 'Sugerida',
  aprobada: 'Aprobada',
  corregida: 'Corregida',
  manual: 'Manual',
}

// Lo que el agente lee en cada análisis: VIPs, temas P1/P2, categorías. Solo lo ve el admin.
function PrioritiesEditor() {
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('agent_priorities')
      .select('content, updated_at')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setStatus({ tone: 'error', text: error.message })
        setSaved(data?.content ?? '')
        setDraft(data?.content ?? '')
        setUpdatedAt(data?.updated_at ?? null)
      })
  }, [])

  const save = async () => {
    if (!draft.trim()) return setStatus({ tone: 'error', text: 'Las prioridades no pueden quedar vacías.' })
    setBusy(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('agent_priorities').update({ content: draft, updated_at: now }).eq('id', 1)
    setBusy(false)
    if (error) return setStatus({ tone: 'error', text: error.message })
    setSaved(draft)
    setUpdatedAt(now)
    setStatus({ tone: 'ok', text: 'Guardado. El agente lo usará en el próximo análisis.' })
  }

  if (saved === null && !status) return null

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle right={updatedAt && <span className="text-xs text-stone-400">Editado {relativeDate(updatedAt)}</span>}>
        Mis prioridades (lo que lee el agente)
      </SectionTitle>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Escribe en lenguaje normal: remitentes VIP, qué es P1 o P2, qué es basura, tus categorías y cuándo crear tareas
        para el equipo. Solo los administradores ven esto.
      </p>
      <textarea
        className={`${input} w-full font-mono text-xs leading-relaxed`}
        rows={14}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setStatus(null)
        }}
        aria-label="Prioridades del agente"
      />
      <div className="flex items-center gap-2">
        <button className={btnPrimary} disabled={busy || draft === saved} onClick={save}>
          Guardar prioridades
        </button>
        {draft !== saved && (
          <button className={btn} disabled={busy} onClick={() => setDraft(saved ?? '')}>
            Descartar cambios
          </button>
        )}
        {status && (
          <span className={`text-[13px] ${status.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {status.text}
          </span>
        )}
      </div>
    </Card>
  )
}

export function Reglas() {
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
      <h1 className="text-xl font-medium">Cómo reparte el agente</h1>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      <PrioritiesEditor />

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
