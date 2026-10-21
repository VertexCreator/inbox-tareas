import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Brand, Task } from '../lib/types'
import { useUndo } from '../lib/undo'
import { brandIdsOf } from './Brands'
import { chipClass } from './colors'
import { btn, btnPrimary } from './ui'

// Igual que en la base: cambia el nombre de las marcas originales por el de la nueva, sin importar mayúsculas.
function swap(text: string, oldNames: string[], name: string) {
  let out = text
  for (const o of oldNames) {
    if (!o.trim()) continue
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu'), name)
  }
  return out
}

export function duplicateTitle(task: Task, brands: Brand[], brand: Brand) {
  const oldNames = brandIdsOf(task)
    .map((id) => brands.find((b) => b.id === id)?.name)
    .filter((x): x is string => !!x)
  const t = swap(task.title, oldNames, brand.name)
  return t === task.title ? `${task.title} · ${brand.name}` : t
}

// Ventana "Duplicar para otra marca": copia idéntica en la que solo cambia la marca.
export function DuplicateModal({ task, brands, subtaskCount, onClose, onDone }: { task: Task; brands: Brand[]; subtaskCount: number; onClose: () => void; onDone: () => void }) {
  const { track } = useUndo()
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = brandIdsOf(task)
  const options = brands.filter((b) => !b.archived && !current.includes(b.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const create = async () => {
    if (!picked.length) return setError('Elige al menos una marca.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('duplicate_task', { p_task_id: task.id, p_brand_ids: picked })
    setBusy(false)
    if (error) return setError(error.message)
    const ids = (data ?? []) as string[]
    const names = picked.map((id) => brands.find((b) => b.id === id)?.name).filter(Boolean)
    track(`Duplicaste «${task.title}» para ${names.join(', ')}`, async () => {
      const { error } = await supabase.rpc('undo_duplicate', { p_ids: ids })
      if (error) throw new Error(error.message)
    }, { after: onDone })
    onDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 py-10" onClick={onClose}>
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Duplicar para otra marca">
        <div>
          <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">⧉ Duplicar para otra marca</div>
          <div className="font-medium">{task.title}</div>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Se copia todo igual: descripción, responsable, prioridad, fechas y {subtaskCount ? `sus ${subtaskCount} subtareas con sus personas` : 'sus datos'}. Solo cambia la marca. La copia empieza en la primera etapa, sin avance.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-stone-500">¿Para qué marca? (puedes elegir varias: se crea una copia por cada una)</div>
          {options.length === 0 && <div className="text-sm text-stone-500">No hay otras marcas activas.</div>}
          <div className="flex flex-wrap gap-1.5">
            {options.map((b) => {
              const on = picked.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(b.id)}
                  aria-pressed={on}
                  className={`rounded-lg px-3 py-1.5 text-sm ${on ? `${chipClass(b.color)} font-medium ring-2 ring-indigo-500` : 'border border-dashed border-stone-300 text-stone-600 hover:border-stone-500 dark:border-stone-700 dark:text-stone-300'}`}
                >
                  {on ? '✓ ' : '+ '}
                  {b.name}
                </button>
              )
            })}
          </div>
        </div>

        {picked.length > 0 && (
          <div className="space-y-1 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800/60">
            <div className="text-xs text-stone-500">Se crearán:</div>
            {picked.map((id) => {
              const b = brands.find((x) => x.id === id)!
              return (
                <div key={id} className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chipClass(b.color)}`}>{b.name}</span>
                  <span className="truncate">{duplicateTitle(task, brands, b)}</span>
                </div>
              )
            })}
          </div>
        )}

        {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className={btn} onClick={onClose}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={create} disabled={busy || !picked.length}>
            {busy ? 'Duplicando…' : picked.length > 1 ? `⧉ Crear ${picked.length} copias` : '⧉ Duplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
