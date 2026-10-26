import { useEffect, useState } from 'react'
import { PERMS, SCOPE_LABEL, type AssignScope, type PermKey, type Role } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'
import { Card, btn, btnPrimary, input } from './ui'

const SCOPES = Object.keys(SCOPE_LABEL) as AssignScope[]
const NEW_ROLE: Role['permissions'] = { asignar_a: 'solo_yo', ser_responsable: true, duplicar: true, mi_correo: true }

const yes = 'text-emerald-700 dark:text-emerald-300'
const no = 'text-stone-400 dark:text-stone-500'

// Cargos del equipo: una columna por cargo y una fila por permiso. Cada cambio se guarda al instante
// y se aplica a todas las personas con ese cargo (salvo lo que el gerente ajustó a una persona).
export function RolesManager({ roles, members }: { roles: Role[]; members: Member[] }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const holders = (r: Role) => members.filter((m) => m.active && m.role_id === r.id)

  const save = async (r: Role, permissions: Role['permissions']) => {
    setError(null)
    const { error } = await supabase.from('roles').update({ permissions }).eq('id', r.id)
    if (error) setError(error.message)
  }
  const create = async () => {
    const name = newName.trim()
    if (!name) return setError('Escribe el nombre del cargo.')
    const { error } = await supabase.from('roles').insert({ name, permissions: NEW_ROLE, position: roles.length })
    if (error) return setError(error.message.includes('duplicate') ? 'Ya hay un cargo con ese nombre.' : error.message)
    setNewName('')
    setAdding(false)
    setError(null)
  }

  return (
    <Card className="p-4">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="text-sm font-medium">Cargos y permisos</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {roles.map((r) => `${r.name} (${holders(r).length})`).join(' · ') || 'Sin cargos'}
        </span>
        <span className="ml-auto text-xs text-indigo-600 dark:text-indigo-400">{open ? 'Cerrar' : 'Ver y editar'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Lo que marques aquí vale para todas las personas con ese cargo. A una persona puedes darle o quitarle algo
            puntual en <b>Editar</b>. Los administradores pueden todo, sin importar su cargo.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left align-bottom">
                  <th className="pb-2 pr-3 font-normal text-stone-500">Permiso</th>
                  {roles.map((r) => (
                    <th key={r.id} className="min-w-[150px] pb-2 pr-3 font-normal">
                      <RoleHeader role={r} count={holders(r).length} onError={setError} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-stone-200 dark:border-stone-800">
                  <td className="py-2 pr-3">
                    <div>Asignar tareas</div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">A quién puede asignar (autoasignarse siempre puede).</div>
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} className="py-2 pr-3">
                      <select
                        className={`${input} w-full py-1 text-xs`}
                        value={r.permissions.asignar_a ?? 'companeros'}
                        onChange={(e) => save(r, { ...r.permissions, asignar_a: e.target.value as AssignScope })}
                        aria-label={`A quién asigna ${r.name}`}
                      >
                        {SCOPES.map((s) => (
                          <option key={s} value={s}>
                            {SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
                {PERMS.map((p) => (
                  <tr key={p.key} className="border-t border-stone-200 dark:border-stone-800">
                    <td className="py-2 pr-3">
                      <div>{p.label}</div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400">{p.help}</div>
                    </td>
                    {roles.map((r) => {
                      const on = !!r.permissions[p.key]
                      return (
                        <td key={r.id} className="py-2 pr-3">
                          <label className={`flex cursor-pointer items-center gap-1.5 text-xs ${on ? yes : no}`}>
                            <input type="checkbox" checked={on} onChange={() => save(r, { ...r.permissions, [p.key]: !on })} aria-label={`${p.label} · ${r.name}`} />
                            {on ? 'Sí' : 'No'}
                          </label>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {adding ? (
              <>
                <input className={`${input} w-56`} autoFocus placeholder="Ej. Community manager" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} aria-label="Nombre del cargo nuevo" />
                <button className={btnPrimary} onClick={create}>
                  Crear cargo
                </button>
                <button className={btn} onClick={() => setAdding(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button className={btn} onClick={() => setAdding(true)}>
                + Nuevo cargo
              </button>
            )}
            {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

function RoleHeader({ role, count, onError }: { role: Role; count: number; onError: (e: string | null) => void }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(role.name)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setName(role.name), [role.name])

  const rename = async () => {
    setRenaming(false)
    if (!name.trim() || name.trim() === role.name) return setName(role.name)
    const { error } = await supabase.from('roles').update({ name: name.trim() }).eq('id', role.id)
    onError(error ? (error.message.includes('duplicate') ? 'Ya hay un cargo con ese nombre.' : error.message) : null)
  }
  const remove = async () => {
    const { error } = await supabase.from('roles').delete().eq('id', role.id)
    onError(error ? error.message : null)
  }

  if (renaming)
    return <input className={`${input} w-full py-1 text-sm`} autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && rename()} aria-label="Nombre del cargo" />
  return (
    <div>
      <div className="flex items-center gap-1">
        <span className="font-medium">{role.name}</span>
        <button className="text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" onClick={() => setRenaming(true)} title="Renombrar" aria-label={`Renombrar ${role.name}`}>
          ✎
        </button>
        <button className="text-xs text-stone-400 hover:text-red-600" onClick={() => setConfirm(true)} title="Eliminar cargo" aria-label={`Eliminar ${role.name}`}>
          ✕
        </button>
      </div>
      <div className="text-[11px] text-stone-500 dark:text-stone-400">{count === 1 ? '1 persona' : `${count} personas`}</div>
      {confirm && (
        <div className="mt-1 rounded-md bg-red-50 p-1.5 text-[11px] font-normal text-red-800 dark:bg-red-950 dark:text-red-200">
          {count ? `${count === 1 ? 'Esa persona queda' : `Esas ${count} personas quedan`} sin cargo, con permisos básicos. ` : ''}¿Eliminar?
          <div className="mt-1 flex gap-1">
            <button className={`${btn} px-2 py-0.5 text-[11px] text-red-600`} onClick={remove}>
              Sí
            </button>
            <button className={`${btn} px-2 py-0.5 text-[11px]`} onClick={() => setConfirm(false)}>
              No
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type Choice = 'cargo' | 'si' | 'no'

// Permisos de una persona: por defecto los de su cargo; el gerente puede darle o quitarle algo puntual.
export function MemberPermissions({ member, members, roles, onChanged }: { member: Member; members: Member[]; roles: Role[]; onChanged: () => void }) {
  const role = roles.find((r) => r.id === member.role_id)
  const [overrides, setOverrides] = useState(member.perm_overrides ?? {})
  const [custom, setCustom] = useState(member.assign_custom)
  const [targets, setTargets] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    setOverrides(member.perm_overrides ?? {})
    setCustom(member.assign_custom)
  }, [member.perm_overrides, member.assign_custom])
  useEffect(() => {
    supabase
      .from('assignment_permissions')
      .select('target_id')
      .eq('member_id', member.id)
      .then(({ data }) => setTargets((data ?? []).map((x) => x.target_id as string)))
  }, [member.id])

  const done = (error: { message: string } | null) => {
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Guardado.' })
    onChanged()
  }
  const roleValue = (k: PermKey) => (role ? !!role.permissions[k] : k === 'duplicar' || k === 'mi_correo')
  const roleScope: AssignScope = role?.permissions.asignar_a ?? 'companeros'
  const roleLabel = role ? `Como ${role.name}` : 'Como sin cargo'

  const setPerm = async (k: PermKey, c: Choice) => {
    const next = { ...overrides }
    if (c === 'cargo') delete next[k]
    else next[k] = c === 'si'
    setOverrides(next)
    const { error } = await supabase.from('team_members').update({ perm_overrides: next }).eq('id', member.id)
    done(error)
  }
  const setScope = async (v: AssignScope | 'cargo' | 'personalizado') => {
    if (v === 'personalizado') {
      setCustom(true)
      const { error } = await supabase.rpc('set_assignment_permissions', { p_member: member.id, p_targets: targets })
      return done(error)
    }
    setCustom(false)
    setTargets([])
    const base = { ...overrides }
    delete base.asignar_a
    setOverrides(v === 'cargo' ? base : { ...base, asignar_a: v })
    const reset = await supabase.rpc('reset_member_permissions', { p_member: member.id, p_key: 'asignar_a' })
    if (reset.error || v === 'cargo') return done(reset.error)
    const { error } = await supabase.from('team_members').update({ perm_overrides: { ...base, asignar_a: v } }).eq('id', member.id)
    done(error)
  }
  const setTargetList = async (next: string[]) => {
    setTargets(next)
    const { error } = await supabase.rpc('set_assignment_permissions', { p_member: member.id, p_targets: next })
    done(error)
  }
  const resetAll = async () => {
    setOverrides({})
    setCustom(false)
    setTargets([])
    const { error } = await supabase.rpc('reset_member_permissions', { p_member: member.id })
    done(error)
  }

  const scopeValue = custom ? 'personalizado' : typeof overrides.asignar_a === 'string' ? overrides.asignar_a : 'cargo'
  const others = members.filter((m) => m.active && m.id !== member.id)
  const adjusted = custom || Object.keys(overrides).length > 0
  const choice = (k: PermKey): Choice => (k in overrides ? (overrides[k] ? 'si' : 'no') : 'cargo')

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Permisos de {member.name}</div>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {role ? `Cargo: ${role.name}` : 'Sin cargo: permisos básicos'}
          {adjusted && ' · con ajustes propios'}
        </span>
        {adjusted && (
          <button className="ml-auto text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={resetAll}>
            Dejar todo como el cargo
          </button>
        )}
      </div>

      <label className="block space-y-1 text-sm">
        <span>Puede asignar tareas</span>
        <select className={`${input} w-full md:w-auto`} value={scopeValue} onChange={(e) => setScope(e.target.value as AssignScope | 'cargo' | 'personalizado')}>
          <option value="cargo">
            {roleLabel}: {SCOPE_LABEL[roleScope].toLowerCase()}
          </option>
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABEL[s]}
            </option>
          ))}
          <option value="personalizado">Solo a las personas que elija</option>
        </select>
      </label>
      {custom && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {others.map((o) => (
            <label key={o.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={targets.includes(o.id)} onChange={() => setTargetList(targets.includes(o.id) ? targets.filter((x) => x !== o.id) : [...targets, o.id])} />
              {o.name}
              {o.is_admin && <span className="text-xs text-indigo-600 dark:text-indigo-400">(gerente)</span>}
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
        {PERMS.map((p) => {
          const c = choice(p.key)
          const effective = c === 'cargo' ? roleValue(p.key) : c === 'si'
          return (
            <label key={p.key} className="flex items-center justify-between gap-2 text-sm" title={p.help}>
              <span className={effective ? '' : 'text-stone-400 dark:text-stone-500'}>
                {effective ? '✓ ' : '✕ '}
                {p.label}
              </span>
              <select
                className={`${input} py-1 text-xs ${c === 'cargo' ? '' : 'border-indigo-400 dark:border-indigo-600'}`}
                value={c}
                onChange={(e) => setPerm(p.key, e.target.value as Choice)}
                aria-label={p.label}
              >
                <option value="cargo">
                  {roleLabel} ({roleValue(p.key) ? 'sí' : 'no'})
                </option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </label>
          )
        })}
      </div>
      {msg && <div className={`text-xs ${msg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>{msg.text}</div>}
    </div>
  )
}
