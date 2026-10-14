import { useState, type FormEvent } from 'react'
import { isOverdue, progress } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Brand, StickerCategory, Task } from '../lib/types'
import { chipClass, dotClass } from './colors'
import { ColorPicker } from './ColorPicker'
import type { BoardCtx } from './Initiative'
import { Card, btn, btnPrimary, input } from './ui'
import { BrandPicker, hasBrand, isMultibrand } from './Brands'

// Piezas de la página Iniciativas: pestañas y resumen por marca, y formularios de marca e iniciativa.

export function BrandTab({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
        active ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900'
      }`}
    >
      {color && <span className={`h-2 w-2 rounded-full ${dotClass(color)}`} aria-hidden="true" />}
      {label}
      <span className="text-xs opacity-60">{count}</span>
    </button>
  )
}

export function catOf(t: Task, ctx: BoardCtx): StickerCategory | undefined {
  return ctx.stickers.find((s) => s.id === t.sticker_id)?.category
}

// Vista global: una tarjeta por marca con su avance, para entrar a cada una.
export function BrandOverview({ brands, tasks, ctx, onPick }: { brands: Brand[]; tasks: Task[]; ctx: BoardCtx; onPick: (id: string) => void }) {
  if (brands.length === 0) {
    return (
      <Card className="p-4 text-sm text-stone-500 dark:text-stone-400">
        Aún no hay marcas. El gerente las crea con "+ Marca" y luego asigna cada iniciativa a una.
      </Card>
    )
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {brands.map((b) => {
        const mine = tasks.filter((t) => hasBrand(t, b.id))
        const shared = mine.filter(isMultibrand).length
        const p = progress(mine, ctx.stickers)
        const late = mine.filter((t) => isOverdue(t.due_date, ['terminado', 'cancelado'].includes(catOf(t, ctx) ?? ''))).length
        const blocked = mine.filter((t) => t.observation && !['terminado', 'cancelado'].includes(catOf(t, ctx) ?? '')).length
        return (
          <button key={b.id} onClick={() => onPick(b.id)} className="rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass(b.color)}`} aria-hidden="true" />
                {b.name}
              </span>
              <span className="text-xs tabular-nums text-stone-500">{p.pct}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <div className="h-full bg-emerald-500" style={{ width: `${p.pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-stone-500 dark:text-stone-400">
              <span>
                {p.done}/{p.total} terminadas
              </span>
              {late > 0 && <span className="text-red-600 dark:text-red-400">{late} vencidas</span>}
              {blocked > 0 && <span className="text-amber-700 dark:text-amber-300">{blocked} con observación</span>}
              {shared > 0 && <span>{shared} multimarca</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// Vista de una marca: avance, conteo por etapa y subtareas.
export function BrandSummary({ tasks, ctx, brand, label }: { tasks: Task[]; ctx: BoardCtx; brand?: Brand; label?: string }) {
  const p = progress(tasks, ctx.stickers)
  const subs = ctx.subtasks.filter((s) => tasks.some((t) => t.id === s.task_id))
  const subsDone = subs.filter((s) => s.done).length
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
      <div className="min-w-48 flex-1">
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium">{label ?? (brand ? brand.name : 'Sin marca')} · avance</span>
          <span className="tabular-nums text-stone-500">
            {p.done}/{p.total} iniciativas · {subsDone}/{subs.length} subtareas
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full bg-emerald-500" style={{ width: `${p.pct}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ctx.stickers
          .map((s) => ({ s, n: tasks.filter((t) => t.sticker_id === s.id).length }))
          .filter((x) => x.n > 0)
          .map(({ s, n }) => (
            <span key={s.id} className={`rounded-full px-2 py-0.5 text-[11px] ${chipClass(s.color)}`}>
              {s.name} {n}
            </span>
          ))}
      </div>
    </Card>
  )
}

export function NewBrand({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('violet')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre.')
    const { data, error } = await supabase.from('brands').insert({ name: name.trim(), color }).select('id').single()
    if (error) return setError(error.message.includes('duplicate') ? 'Esa marca ya existe.' : error.message)
    setName('')
    setOpen(false)
    onCreated(data.id)
  }

  if (!open) {
    return (
      <button className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900" onClick={() => setOpen(true)}>
        + Marca
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" noValidate>
      <input
        id="new-brand"
        autoFocus
        className={`${input} py-1`}
        placeholder="Nombre de la marca"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
      />
      <ColorPicker value={color} onChange={setColor} />
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

export function NewInitiative({ ctx, defaultBrand, onCreated }: { ctx: BoardCtx; defaultBrand: string; onCreated: () => void }) {
  const [brandIds, setBrandIds] = useState<string[]>(defaultBrand ? [defaultBrand] : [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const [sticker, setSticker] = useState(ctx.stickers[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const owners = ctx.members.filter((m) => m.active && m.can_own)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Escribe el nombre de la iniciativa.')
    setBusy(true)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      brand_ids: brandIds,
      assignee_id: owner || null,
      due_date: due || null,
      sticker_id: sticker || null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    onCreated()
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <BrandPicker value={brandIds} onChange={setBrandIds} brands={ctx.brands} />
        <div>
          <input
            id="new-initiative-title"
            className={`${input} w-full`}
            placeholder="Iniciativa, ej. Video de producto para TikTok"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
          />
        </div>
        <textarea className={`${input} w-full`} rows={2} placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Descripción" />
        <div className="flex flex-wrap items-center gap-2">
          <select className={input} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsable">
            <option value="">Que sugiera el agente</option>
            {owners.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
          <select className={input} value={sticker} onChange={(e) => setSticker(e.target.value)} aria-label="Etapa">
            {ctx.stickers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className={btnPrimary} type="submit" disabled={busy}>
            Crear iniciativa
          </button>
          {owners.length === 0 && <span className="text-xs text-amber-700 dark:text-amber-300">Autoriza responsables en Equipo.</span>}
        </div>
        {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
      </form>
    </Card>
  )
}
