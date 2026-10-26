import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase, uniqueChannel } from './supabase'
import type { Member } from './types'

export type AssignScope = 'todos' | 'companeros' | 'solo_yo'

export interface Perms {
  admin: boolean
  role: string | null
  asignar_a: AssignScope | 'personalizado'
  ser_responsable: boolean
  repartir: boolean
  editar_iniciativas: boolean
  cambiar_etapas: boolean
  eliminar_iniciativas: boolean
  repetitivas_para_otros: boolean
  duplicar: boolean
  mi_correo: boolean
  analisis_agente: boolean
}

export type PermKey = keyof Omit<Perms, 'admin' | 'role' | 'asignar_a'>

export interface Role {
  id: string
  name: string
  description: string | null
  position: number
  permissions: Partial<Record<PermKey, boolean>> & { asignar_a?: AssignScope }
}

// Lo que puede hacer cada cargo, en el orden y con las palabras que ve el gerente.
export const PERMS: { key: PermKey; label: string; help: string }[] = [
  { key: 'ser_responsable', label: 'Ser responsable de iniciativas', help: 'Aparece como responsable principal al asignar.' },
  { key: 'repartir', label: 'Repartir lo que está por planificar', help: 'Asignar y planificar con subtareas lo que llega a Por planificar.' },
  { key: 'editar_iniciativas', label: 'Editar iniciativas', help: 'Nombre, descripción, fechas, marcas, agencia y responsable.' },
  { key: 'cambiar_etapas', label: 'Mover iniciativas de otros', help: 'Cambiar la etapa de cualquier iniciativa (las suyas siempre puede).' },
  { key: 'eliminar_iniciativas', label: 'Eliminar iniciativas de otros', help: 'Las que creó esta persona siempre las puede eliminar.' },
  { key: 'repetitivas_para_otros', label: 'Tareas repetitivas para otros', help: 'Programar tareas repetitivas para otras personas.' },
  { key: 'duplicar', label: 'Duplicar para otra marca', help: 'Copiar una iniciativa cambiando solo la marca.' },
  { key: 'mi_correo', label: 'Mi correo', help: 'Conectar su Gmail y crear iniciativas desde sus correos.' },
  { key: 'analisis_agente', label: 'Pedir análisis al agente', help: 'Usa tu plan de Claude, con el límite diario de Equipo.' },
]

export const SCOPE_LABEL: Record<AssignScope, string> = {
  todos: 'A todo el equipo',
  companeros: 'A sus compañeros (no a gerentes)',
  solo_yo: 'Solo autoasignarse',
}

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([])
  useEffect(() => {
    const load = () =>
      supabase
        .from('roles')
        .select('*')
        .order('position')
        .order('name')
        .then(({ data }) => setRoles((data ?? []) as Role[]))
    load()
    const channel = supabase
      .channel(uniqueChannel('roles'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  return roles
}

// A quién le puede asignar tareas la persona que está usando el dashboard: el gerente, a cualquiera;
// cada miembro, a sí mismo y a quienes permite su cargo (o la lista que el gerente le armó en Equipo → Editar).
export function useAssignable(members: Member[]) {
  const { isAdmin, member, perms } = useAuth()
  const [targets, setTargets] = useState<string[] | null>(null)
  const scope = perms?.asignar_a ?? 'solo_yo'

  useEffect(() => {
    if (isAdmin || !member || scope !== 'personalizado') return
    supabase
      .from('assignment_permissions')
      .select('target_id')
      .eq('member_id', member.id)
      .then(({ data }) => setTargets((data ?? []).map((x) => x.target_id as string)))
  }, [isAdmin, member, scope])

  const allowed = (id: string) => {
    if (isAdmin || id === member?.id) return true
    const m = members.find((x) => x.id === id)
    if (!m?.active) return false
    if (scope === 'todos') return true
    if (scope === 'companeros') return !m.is_admin
    if (scope === 'personalizado') return (targets ?? []).includes(id)
    return false
  }
  const active = members.filter((m) => m.active)
  return {
    // Para responsable de iniciativa: además tiene que estar autorizado como responsable.
    owners: active.filter((m) => m.can_own && allowed(m.id)),
    // Para subtareas: cualquiera a quien pueda asignar.
    people: active.filter((m) => allowed(m.id)),
    allowed,
  }
}
