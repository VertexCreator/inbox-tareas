import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Agency, Brand, Priority } from '../lib/types'
import { BrandPicker } from './Brands'
import { btn, btnPrimary, input } from './ui'

// Formularios para agregar algo "Por planificar" a una lista y para crear listas.

export function NewItem({ listId, brands, agencies, onCreated }: { listId: string; brands: Brand[]; agencies: Agency[]; onCreated: () => void }) {
  const { isAdmin } = useAuth()
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [agency, setAgency] = useState('')
  const [autoPlan, setAutoPlan] = useState(true)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Escribe qué hay que hacer.')
    setBusy(true)
    const { error } = await supabase.from('list_items').insert({
      list_id: listId,
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: due || null,
      priority: priority || null,
      brand_ids: brandIds,
      agency_id: agency || null,
      auto_plan: !isAdmin && autoPlan,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setTitle('')
    setNotes('')
    setDue('')
    setPriority('')
    setBrandIds([])
    onCreated()
  }

  return (
    <form onSubmit={submit} className="border-t border-stone-200 bg-stone-50/60 px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900/40" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`new-item-${listId}`}
          className={`${input} min-w-48 flex-1`}
          placeholder="+ Agregar por planificar, ej. Campaña de lanzamiento en Instagram"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
        />
        <input className={`${input} w-56`} placeholder="Detalles (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Detalles" />
        <BrandPicker value={brandIds} onChange={setBrandIds} brands={brands} />
        {agencies.length > 0 && (
          <select className={input} value={agency} onChange={(e) => setAgency(e.target.value)} aria-label="Agencia">
            <option value="">Agencia</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
        <select className={input} value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Prioridad">
          <option value="">Prioridad</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        {!isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400" title="El agente propone tarea, subtareas y personas; la gerente confirma">
            <input type="checkbox" checked={autoPlan} onChange={(e) => setAutoPlan(e.target.checked)} />
            Pedir plan al agente
          </label>
        )}
        <button className={btnPrimary} type="submit" disabled={busy}>
          Agregar
        </button>
      </div>
      {error && <div className="mt-1 text-[13px] text-red-600 dark:text-red-400">{error}</div>}
    </form>
  )
}

export function NewList({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre.')
    const { data, error } = await supabase.from('lists').insert({ name: name.trim() }).select('id').single()
    if (error) return setError(error.message)
    setName('')
    setOpen(false)
    onCreated(data.id)
  }

  if (!open) {
    return (
      <button className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900" onClick={() => setOpen(true)}>
        + Nueva lista
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5" noValidate>
      <input
        id="new-list-name"
        autoFocus
        className={`${input} py-1`}
        placeholder="Lanzamiento Expo Clean"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
      />
      <button className={btnPrimary} type="submit">
        Crear
      </button>
      <button className={btn} type="button" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
    </form>
  )
}
