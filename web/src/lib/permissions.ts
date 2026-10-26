import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import type { Member } from './types'

// A quién le puede asignar tareas la persona que está usando el dashboard: el gerente, a cualquiera;
// cada miembro, a sí mismo y a quienes el gerente le autorizó (Equipo → Editar).
export function useAssignable(members: Member[]) {
  const { isAdmin, member } = useAuth()
  const [targets, setTargets] = useState<string[] | null>(null)

  useEffect(() => {
    if (isAdmin || !member) return
    supabase
      .from('assignment_permissions')
      .select('target_id')
      .eq('member_id', member.id)
      .then(({ data }) => setTargets((data ?? []).map((x) => x.target_id as string)))
  }, [isAdmin, member])

  const allowed = (id: string) => isAdmin || id === member?.id || (targets ?? []).includes(id)
  const active = members.filter((m) => m.active)
  return {
    // Para responsable de iniciativa: además tiene que estar autorizado como responsable.
    owners: active.filter((m) => m.can_own && allowed(m.id)),
    // Para subtareas: cualquiera a quien pueda asignar.
    people: active.filter((m) => allowed(m.id)),
    allowed,
  }
}
