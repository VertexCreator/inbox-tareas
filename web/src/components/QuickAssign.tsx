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

// "✓ Listo" y "Descartar": cerrar algo por planificar sin convertirlo en iniciativa (ya se hizo, o no va).
// Si el agente ya había dejado el plan listo, se guarda y vuelve al deshacer.
export function CloseItem({ item, onDone, compact = false }: { item: Pick<ListItem, 'id' | 'title' | 'status'>; onDone: () => void; compact?: boolean }) {
  const { track } = useUndo()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = async (status: 'hecho' | 'descartado') => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('close_item', { p_item_id: item.id, p_status: status })
    setBusy(false)
    if (error) return setError(error.message)
    track(status === 'hecho' ? `Marcaste «${item.title}» como listo` : `Descartaste «${item.title}»`, async () => {
      const { error } = await supabase.rpc('reopen_item', { p_item_id: item.id })
      if (error) throw new Error(error.message)
    }, { after: onDone })
    onDone()
  }

  const size = compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1.5 text-xs'
  return (
    <span className="inline-flex flex-col">
      <span className="inline-flex gap-1.5">
        <button
          className={`rounded-md border border-emerald-600 bg-emerald-600 font-medium text-white hover:bg-emerald-700 disabled:opacity-50 ${size}`}
          disabled={busy}
          onClick={() => close('hecho')}
          title="Ya está hecho: sale de Por planificar sin crear una iniciativa"
        >
          ✓ Listo
        </button>
        <button
          className={`rounded-md border border-stone-300 font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 ${size}`}
          disabled={busy}
          onClick={() => close('descartado')}
          title="No hace falta hacerlo: sale de Por planificar"
        >
          Descartar
        </button>
      </span>
      {error && <span className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}
