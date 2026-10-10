import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import { LEVEL_LABEL, type Member } from '../lib/types'
import { Avatar, Card, LoadBar, SectionTitle, Tag, btn, btnPrimary, input } from '../components/ui'

interface Draft {
  name: string
  email: string
  skill_levels: Record<string, number>
  capacity_points: number
  available: boolean
  is_admin: boolean
  can_own: boolean
}

const EMPTY: Draft = { name: '', email: '', skill_levels: {}, capacity_points: 10, available: true, is_admin: false, can_own: false }

function useSkills() {
  const [skills, setSkills] = useState<string[]>([])
  useEffect(() => {
    supabase
      .from('skills')
      .select('name')
      .order('name')
      .then(({ data }) => setSkills((data ?? []).map((x) => x.name as string)))
  }, [])
  return skills
}

function toRow(d: Draft) {
  return {
    name: d.name.trim(),
    email: d.email.trim().toLowerCase(),
    skill_levels: d.skill_levels,
    capacity_points: d.capacity_points,
    available: d.available,
    is_admin: d.is_admin,
    can_own: d.can_own || d.is_admin,
  }
}

function validate(d: Draft) {
  if (!d.name.trim()) return 'Escribe el nombre.'
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return 'Escribe un correo válido.'
  if (!(d.capacity_points > 0)) return 'La capacidad debe ser mayor que 0.'
  return null
}

export function Equipo() {
  const { isAdmin, member } = useAuth()
  const { members, tasks, reload, error } = useBoard()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [accessFor, setAccessFor] = useState<string | null>(null)
  const skills = useSkills()

  const active = members.filter((m) => m.active)
  const inactive = members.filter((m) => !m.active)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-medium">Equipo y carga de trabajo</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            El agente recomienda a cada persona según sus habilidades, su nivel y su carga. La carga suma las tareas abiertas
            y las subtareas que tiene en tareas de otros, sobre su capacidad.
          </p>
        </div>
        {isAdmin && (
          <button className={`${btnPrimary} ml-auto shrink-0`} onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cerrar' : 'Agregar persona'}
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {adding && (
        <MemberForm
          skills={skills}
          initial={EMPTY}
          submitLabel="Agregar"
          onCancel={() => setAdding(false)}
          onSave={async (d) => {
            const { error } = await supabase.from('team_members').insert(toRow(d))
            if (error) return error.message.includes('duplicate') ? 'Ese correo ya está en el equipo.' : error.message
            setAdding(false)
            reload()
            return null
          }}
        />
      )}

      <Card>
        {active.map((m, i) => (
          <div key={m.id} className={i ? 'border-t border-stone-200 dark:border-stone-800' : ''}>
            {editing === m.id ? (
              <div className="p-3">
                <MemberForm
                  skills={skills}
                  initial={{ ...m, skill_levels: m.skill_levels ?? {} }}
                  submitLabel="Guardar"
                  canRemove={m.id !== member?.id}
                  onCancel={() => setEditing(null)}
                  onRemove={async () => {
                    const { error } = await supabase.from('team_members').update({ active: false }).eq('id', m.id)
                    if (error) return error.message
                    setEditing(null)
                    reload()
                    return null
                  }}
                  onSave={async (d) => {
                    const { error } = await supabase.from('team_members').update(toRow(d)).eq('id', m.id)
                    if (error) return error.message
                    setEditing(null)
                    reload()
                    return null
                  }}
                />
              </div>
            ) : (
              <>
                <MemberRow
                  m={m}
                  doneCount={tasks.filter((t) => t.assignee_id === m.id && t.status === 'hecho').length}
                  onEdit={isAdmin ? () => setEditing(m.id) : undefined}
                  onAccess={isAdmin ? () => setAccessFor(accessFor === m.id ? null : m.id) : undefined}
                />
                {accessFor === m.id && <AccessForm m={m} onClose={() => setAccessFor(null)} />}
              </>
            )}
          </div>
        ))}
      </Card>

      {isAdmin && inactive.length > 0 && (
        <div>
          <SectionTitle>Inactivos</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {inactive.map((m) => (
              <button
                key={m.id}
                className={btn}
                onClick={async () => {
                  await supabase.from('team_members').update({ active: true }).eq('id', m.id)
                  reload()
                }}
              >
                Reactivar {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MemberRow({
  m,
  doneCount,
  onEdit,
  onAccess,
}: {
  m: Member
  doneCount: number
  onEdit?: () => void
  onAccess?: () => void
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={m.name} id={m.id} size="md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {m.name} {m.is_admin && <span className="text-xs font-normal text-stone-400">· admin</span>}
            {m.can_own && !m.is_admin && <span className="text-xs font-normal text-indigo-600 dark:text-indigo-400"> · responsable</span>}
          </div>
          <div className="truncate text-xs text-stone-500 dark:text-stone-400">{m.email}</div>
        </div>
      </div>
      <div className="order-3 col-span-2 md:order-none md:col-span-1">
        <div className="mb-1 flex flex-wrap gap-1.5">
          {Object.keys(m.skill_levels ?? {}).length ? (
            Object.entries(m.skill_levels)
              .sort((a, b) => b[1] - a[1])
              .map(([s, lvl]) => (
                <Tag key={s} tone={lvl === 3 ? 'accent' : 'neutral'}>
                  {s} · {LEVEL_LABEL[lvl]?.toLowerCase()}
                </Tag>
              ))
          ) : (
            <Tag>Sin habilidades cargadas</Tag>
          )}
          {!m.available && <Tag tone="warning">No disponible</Tag>}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {m.open_tasks} tareas{m.open_subtasks ? ` + ${m.open_subtasks} subtareas` : ''} · {m.open_points}/{m.capacity_points} pts · {doneCount} hechas
          </span>
        </div>
        <LoadBar ratio={m.load_ratio} />
      </div>
      {onEdit ? (
        <div className="flex gap-1.5">
          {onAccess && (
            <button className={btn} onClick={onAccess}>
              Dar acceso
            </button>
          )}
          <button className={btn} onClick={onEdit}>
            Editar
          </button>
        </div>
      ) : (
        <span />
      )}
    </div>
  )
}

function MemberForm({
  skills,
  initial,
  submitLabel,
  onSave,
  onCancel,
  onRemove,
  canRemove = false,
}: {
  skills: string[]
  initial: Draft
  submitLabel: string
  onSave: (d: Draft) => Promise<string | null>
  onCancel: () => void
  onRemove?: () => Promise<string | null>
  canRemove?: boolean
}) {
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Draft>) => {
    setD((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  const save = async () => {
    const v = validate(d)
    if (v) return setError(v)
    setBusy(true)
    setError(await onSave(d))
    setBusy(false)
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-2 md:grid-cols-2">
        <input className={input} placeholder="Nombre" value={d.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nombre" />
        <input className={input} placeholder="nombre@tuempresa.com" value={d.email} onChange={(e) => set({ email: e.target.value })} aria-label="Correo de Google Workspace" />
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          Capacidad (pts abiertos)
          <input
            className={`${input} w-20`}
            type="number"
            min={1}
            step={1}
            value={d.capacity_points}
            onChange={(e) => set({ capacity_points: Math.round(Number(e.target.value)) })}
          />
          <span className="text-xs text-stone-400">10 = tiempo completo</span>
        </label>
      </div>
      <div>
        <div className="mb-1.5 text-sm">Habilidades</div>
        <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
          Pulsa una habilidad para cambiar el nivel: sin nivel → básico → intermedio → avanzado.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...skills, ...Object.keys(d.skill_levels)])].map((sk) => {
            const lvl = d.skill_levels[sk] ?? 0
            const cls = [
              'border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400',
              'border-stone-400 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200',
              'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
              'border-indigo-500 bg-indigo-600 text-white',
            ][lvl]
            return (
              <button
                key={sk}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-xs ${cls}`}
                onClick={() => {
                  const next = (lvl + 1) % 4
                  const levels = { ...d.skill_levels }
                  if (next === 0) delete levels[sk]
                  else levels[sk] = next
                  set({ skill_levels: levels })
                }}
                aria-label={`${sk}: ${lvl ? LEVEL_LABEL[lvl] : 'sin nivel'}`}
              >
                {sk}
                {lvl > 0 && <span className="ml-1 opacity-80">{'●'.repeat(lvl)}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.available} onChange={(e) => set({ available: e.target.checked })} />
          Disponible para tareas nuevas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.can_own || d.is_admin} disabled={d.is_admin} onChange={(e) => set({ can_own: e.target.checked })} />
          Puede ser responsable de iniciativas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.is_admin} onChange={(e) => set({ is_admin: e.target.checked })} />
          Administrador (ve correos y corrige repartos)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={busy} onClick={save}>
          {submitLabel}
        </button>
        <button className={btn} disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        {onRemove && canRemove && (
          <button
            className={`${btn} ml-auto text-red-600 dark:text-red-400`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(await onRemove())
              setBusy(false)
            }}
          >
            Desactivar
          </button>
        )}
        {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </Card>
  )
}

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

// Crea el usuario (o restablece su contraseña) con una contraseña temporal que el admin le pasa a la persona.
function AccessForm({ m, onClose }: { m: Member; onClose: () => void }) {
  const [password, setPassword] = useState(randomPassword)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (password.length < 8) return setError('Usa al menos 8 caracteres.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { email: m.email, password } })
    setBusy(false)
    if (error) {
      let message = error.message
      try {
        message = (await error.context.json()).error ?? message
      } catch {
        // la respuesta no era JSON; dejamos el mensaje genérico
      }
      return setError(message)
    }
    setDone(data?.created ? 'Acceso creado.' : 'Contraseña restablecida.')
  }

  return (
    <div className="mx-4 mb-3 space-y-2 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800/60">
      {done ? (
        <>
          <div className="font-medium text-emerald-700 dark:text-emerald-400">{done}</div>
          <p className="text-stone-600 dark:text-stone-300">
            Pásale a {m.name} estos datos por un canal privado. Al entrar, el dashboard le pedirá crear su propia
            contraseña.
          </p>
          <div className="rounded-md bg-white p-2 font-mono text-xs dark:bg-stone-900">
            Correo: {m.email}
            <br />
            Contraseña temporal: {password}
          </div>
          <button className={btn} onClick={onClose}>
            Cerrar
          </button>
        </>
      ) : (
        <>
          <p className="text-stone-600 dark:text-stone-300">
            Crea una contraseña temporal para <span className="font-medium">{m.email}</span>. Si ya tenía acceso, se le
            reemplaza la contraseña.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${input} w-48 font-mono`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              aria-label="Contraseña temporal"
            />
            <button className={btn} onClick={() => setPassword(randomPassword())} disabled={busy}>
              Generar otra
            </button>
            <button className={btnPrimary} onClick={submit} disabled={busy}>
              {busy ? 'Guardando…' : 'Dar acceso'}
            </button>
            <button className={btn} onClick={onClose} disabled={busy}>
              Cancelar
            </button>
          </div>
          {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
        </>
      )}
    </div>
  )
}
