import { useEffect, useRef, useState } from 'react'
import type { Agency, Brand, Member, Priority } from '../lib/types'
import { chipClass, dotClass } from './colors'
import { input } from './ui'

// Filtros compartidos por Listas y Tablero. "none" = sin marca / sin agencia / sin asignar.
export interface Filters {
  q: string
  brands: string[]
  agencies: string[]
  priorities: Priority[]
  people: string[]
}

export const EMPTY_FILTERS: Filters = { q: '', brands: [], agencies: [], priorities: [], people: [] }

export const NONE = 'none'

export function activeCount(f: Filters) {
  return (f.q.trim() ? 1 : 0) + f.brands.length + f.agencies.length + f.priorities.length + f.people.length
}

// Lo que se filtra de cada pendiente o iniciativa.
export interface Filterable {
  text: string
  brandIds: string[]
  agencyId: string | null
  priority: Priority | null
  people: string[]
}

export function matches(f: Filters, x: Filterable) {
  const q = f.q.trim().toLowerCase()
  if (q && !x.text.toLowerCase().includes(q)) return false
  if (f.brands.length && !f.brands.some((b) => (b === NONE ? x.brandIds.length === 0 : x.brandIds.includes(b)))) return false
  if (f.agencies.length && !f.agencies.some((a) => (a === NONE ? !x.agencyId : x.agencyId === a))) return false
  if (f.priorities.length && !(x.priority && f.priorities.includes(x.priority))) return false
  if (f.people.length && !f.people.some((p) => (p === NONE ? x.people.length === 0 : x.people.includes(p)))) return false
  return true
}

// Guarda los filtros y la vista de cada página en este navegador (si se puede).
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }, [key, value])
  return [value, setValue] as const
}

export function useStoredString(key: string, initial: string) {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* sin almacenamiento */
    }
  }, [key, value])
  return [value, setValue] as const
}

interface Option {
  id: string
  label: string
  color?: string
}

function MultiSelect({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const selected = options.filter((o) => value.includes(o.id))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${input} flex items-center gap-1.5 py-1.5 text-xs ${value.length ? 'border-indigo-400 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300' : ''}`}
      >
        {label}
        {selected.length === 1 ? `: ${selected[0].label}` : selected.length > 1 ? ` · ${selected.length}` : ''}
        <span aria-hidden="true" className="text-stone-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.color && <span className={`h-2 w-2 rounded-full ${dotClass(o.color)}`} aria-hidden="true" />}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button type="button" className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => onChange([])}>
              Quitar este filtro
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function FilterBar({
  value: f,
  onChange,
  brands,
  agencies,
  members,
  hide = [],
  placeholder = 'Buscar…',
}: {
  value: Filters
  onChange: (f: Filters) => void
  brands: Brand[]
  agencies: Agency[]
  members: Member[]
  hide?: (keyof Filters)[]
  placeholder?: string
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch })
  const brandOpts: Option[] = [...brands.filter((b) => !b.archived).map((b) => ({ id: b.id, label: b.name, color: b.color })), { id: NONE, label: 'Sin marca' }]
  const agencyOpts: Option[] = [...agencies.filter((a) => !a.archived).map((a) => ({ id: a.id, label: a.name, color: a.color })), { id: NONE, label: 'Sin agencia' }]
  const peopleOpts: Option[] = [...members.filter((m) => m.active).map((m) => ({ id: m.id, label: m.name })), { id: NONE, label: 'Sin asignar' }]
  const n = activeCount(f)

  const chips: { key: string; label: string; color?: string; remove: () => void }[] = [
    ...f.brands.map((id) => ({ key: `b${id}`, label: brandOpts.find((o) => o.id === id)?.label ?? '?', color: brandOpts.find((o) => o.id === id)?.color, remove: () => set({ brands: f.brands.filter((x) => x !== id) }) })),
    ...f.agencies.map((id) => ({ key: `a${id}`, label: agencyOpts.find((o) => o.id === id)?.label ?? '?', color: agencyOpts.find((o) => o.id === id)?.color, remove: () => set({ agencies: f.agencies.filter((x) => x !== id) }) })),
    ...f.priorities.map((p) => ({ key: `p${p}`, label: p, remove: () => set({ priorities: f.priorities.filter((x) => x !== p) }) })),
    ...f.people.map((id) => ({ key: `m${id}`, label: peopleOpts.find((o) => o.id === id)?.label ?? '?', remove: () => set({ people: f.people.filter((x) => x !== id) }) })),
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!hide.includes('q') && (
          <input className={`${input} w-52 py-1.5 text-sm`} placeholder={placeholder} value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Buscar" />
        )}
        {!hide.includes('brands') && <MultiSelect label="Marca" options={brandOpts} value={f.brands} onChange={(v) => set({ brands: v })} />}
        {!hide.includes('agencies') && <MultiSelect label="Agencia" options={agencyOpts} value={f.agencies} onChange={(v) => set({ agencies: v })} />}
        {!hide.includes('people') && <MultiSelect label="Persona" options={peopleOpts} value={f.people} onChange={(v) => set({ people: v })} />}
        {!hide.includes('priorities') && (
          <div className="flex overflow-hidden rounded-lg border border-stone-200 text-xs dark:border-stone-700" role="group" aria-label="Prioridad">
            {(['P1', 'P2', 'P3'] as Priority[]).map((p) => {
              const on = f.priorities.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ priorities: on ? f.priorities.filter((x) => x !== p) : [...f.priorities, p] })}
                  className={`border-l border-stone-200 px-2.5 py-1.5 first:border-l-0 dark:border-stone-700 ${
                    on ? (p === 'P1' ? 'bg-red-600 text-white' : p === 'P2' ? 'bg-amber-500 text-white' : 'bg-stone-600 text-white') : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  {p}
                </button>
              )
            })}
          </div>
        )}
        {n > 0 && (
          <button type="button" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => onChange(EMPTY_FILTERS)}>
            Limpiar filtros ({n})
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${c.color ? chipClass(c.color) : 'bg-stone-200 dark:bg-stone-700'}`}>
              {c.label}
              <button type="button" onClick={c.remove} aria-label={`Quitar filtro ${c.label}`} className="opacity-60 hover:opacity-100">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function AgencyChip({ agency }: { agency?: Agency | null }) {
  if (!agency) return null
  return (
    <span className="inline-flex items-center gap-1 rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600 dark:border-stone-700 dark:text-stone-300" title="Agencia">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass(agency.color)}`} aria-hidden="true" />
      {agency.name}
    </span>
  )
}
