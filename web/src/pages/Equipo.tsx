import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'
import { Avatar, Card, LoadBar, SectionTitle, Tag, btn, btnPrimary, input } from '../components/ui'

interface Draft {
  name: string
  email: string
  specialties: string
  capacity_points: number
  available: boolean
  is_admin: boolean
}

const EMPTY: Draft = { name: '', email: '', specialties: '', capacity_points: 10, available: true, is_admin: false }

function toRow(d: Draft) {
  return {
    name: d.name.trim(),
    email: d.email.trim().toLowerCase(),
    specialties: d.specialties.split(',').map((s) => s.trim()).filter(Boolean),
    capacity_points: d.capacity_points,
    available: d.available,
    is_admin: d.is_admin,
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

  const active = members.filter((m) => m.active)
  const inactive = members.filter((m) => !m.active)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-medium">Equipo y carga de trabajo</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            La carga suma los puntos de las tareas abiertas (asignadas o sugeridas) sobre la capacidad de cada persona.
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
                  initial={{ ...m, specialties: m.specialties.join(', ') }}
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
              <MemberRow m={m} doneCount={tasks.filter((t) => t.assignee_id === m.id && t.status === 'hecho').length} onEdit={isAdmin ? () => setEditing(m.id) : undefined} />
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

function MemberRow({ m, doneCount, onEdit }: { m: Member; doneCount: number; onEdit?: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={m.name} id={m.id} size="md" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {m.name} {m.is_admin && <span className="text-xs font-normal text-stone-400">· admin</span>}
          </div>
          <div className="truncate text-xs text-stone-500 dark:text-stone-400">{m.email}</div>
        </div>
      </div>
      <div className="order-3 col-span-2 md:order-none md:col-span-1">
        <div className="mb-1 flex flex-wrap gap-1.5">
          {m.specialties.length ? m.specialties.map((s) => <Tag key={s} tone="accent">{s}</Tag>) : <Tag>General</Tag>}
          {!m.available && <Tag tone="warning">No disponible</Tag>}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {m.open_tasks} abiertas · {m.open_points}/{m.capacity_points} pts · {doneCount} hechas
          </span>
        </div>
        <LoadBar ratio={m.load_ratio} />
      </div>
      {onEdit ? (
        <button className={btn} onClick={onEdit}>
          Editar
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

function MemberForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
  onRemove,
  canRemove = false,
}: {
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
        <input
          className={input}
          placeholder="Especialidades, separadas por coma: Marketing digital, Diseño"
          value={d.specialties}
          onChange={(e) => set({ specialties: e.target.value })}
          aria-label="Especialidades"
        />
        <label className="flex items-center gap-2 text-sm">
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
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.available} onChange={(e) => set({ available: e.target.checked })} />
          Disponible para tareas nuevas
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
