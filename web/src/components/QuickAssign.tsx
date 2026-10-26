import { useState } from 'react'
import { memberOption } from '../lib/data'
import { useAssignable } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import type { ListItem, Member } from '../lib/types'
import { useUndo } from '../lib/undo'

// "Asignar a… ▾": quien reparte (el gerente o un cargo con ese permiso) convierte algo por planificar en iniciativa con un responsable, sin armar el plan.
export function QuickAssign({ item, members, onDone, compact = false }: { item: Pick<ListItem, 'id' | 'title' | 'status'>; members: Member[]; onDone: () => void; compact?: boolean }) {
  const { track } = useUndo()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { owners } = useAssignable(members)

  const assign = async (memberId: string) => {
    if (!memberId) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('assign_item', { p_item_id: item.id, p_assignee: memberId })
    setBusy(false)
    if (error) return setError(error.message)
    const name = members.find((m) => m.id === memberId)?.name ?? 'esa persona'
    const prevStatus = item.status
    track(`Asignaste «${item.title}» a ${name}`, async () => {
      const del = await supabase.rpc('delete_task', { p_task_id: data })
      if (del.error) throw new Error(del.error.message)
      const back = await supabase.from('list_items').update({ status: prevStatus }).eq('id', item.id)
      if (back.error) throw new Error(back.error.message)
    }, { after: onDone })
    onDone()
  }

  return (
    <span className="inline-flex flex-col">
      <select
        className={`rounded-md border border-emerald-300 bg-emerald-50 font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 ${compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1.5 text-xs'}`}
        value=""
        disabled={busy}
        onChange={(e) => assign(e.target.value)}
        aria-label={`Asignar «${item.title}» a una persona`}
        title="Asignar de una vez, sin armar el plan con subtareas"
      >
        <option value="">{busy ? 'Asignando…' : 'Asignar a… ▾'}</option>
        {owners.map((m) => (
          <option key={m.id} value={m.id}>
            {memberOption(m, null)}
          </option>
        ))}
      </select>
      {error && <span className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}
