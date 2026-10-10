import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { isOverdue, progress, useBoard } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Brand, StickerCategory, Task } from '../lib/types'
import { chipClass, dotClass } from '../components/colors'
import { ColorPicker } from '../components/ColorPicker'
import { InitiativeCard, InitiativeDetail, type BoardCtx } from '../components/Initiative'
import { Card, btn, btnPrimary, input } from '../components/ui'

const ALL = 'todas'

export function Tablero() {
  const { isAdmin } = useAuth()
  const { tasks, subtasks, members, brands, stickers, error, reload } = useBoard()
  const [brandTab, setBrandTab] = useState<string>(ALL)
  const [person, setPerson] = useState('')
  const [query, setQuery] = useState('')
  const [hideEmpty, setHideEmpty] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [addingSticker, setAddingSticker] = useState(false)

  const ctx: BoardCtx = { members, brands, stickers, subtasks }
  const liveBrands = brands.filter((b) => !b.archived)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) => {
      if (brandTab !== ALL && (brandTab === 'sin' ? t.brand_id : t.brand_id !== brandTab)) return false
      if (person && (t.assignee_id ?? t.suggested_assignee_id) !== person && !subtasks.some((s) => s.task_id === t.id && s.assignee_id === person)) return false
      if (q && !`${t.title} ${t.description ?? ''} ${t.observation ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, subtasks, brandTab, person, query])

  const columns = stickers.filter((s) => !hideEmpty || visible.some((t) => t.sticker_id === s.id))
  const open = tasks.find((t) => t.id === openId)
  const noBrand = tasks.filter((t) => !t.brand_id).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-medium">Tablero</h1>
        <input
          id="board-search"
          className={`${input} w-52`}
          placeholder="Buscar iniciativa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className={input} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filtrar por persona">
          <option value="">Todo el equipo</option>
          {members
            .filter((m) => m.active)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          Ocultar columnas vacías
        </label>
        <div className="ml-auto flex gap-2">
          <button className={btn} onClick={() => setAddingSticker((v) => !v)}>
            + Sticker
          </button>
          {isAdmin && (
            <button className={btnPrimary} onClick={() => setCreating((v) => !v)}>
              {creating ? 'Cerrar' : 'Nueva iniciativa'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2 dark:border-stone-800">
        <BrandTab active={brandTab === ALL} onClick={() => setBrandTab(ALL)} label="Todas las marcas" count={tasks.length} />
        {liveBrands.map((b) => (
          <BrandTab
            key={b.id}
            active={brandTab === b.id}
            onClick={() => setBrandTab(b.id)}
            label={b.name}
            color={b.color}
            count={tasks.filter((t) => t.brand_id === b.id).length}
          />
        ))}
        {noBrand > 0 && <BrandTab active={brandTab === 'sin'} onClick={() => setBrandTab('sin')} label="Sin marca" count={noBrand} />}
        {isAdmin && <NewBrand onCreated={(id) => setBrandTab(id)} />}
      </div>

      {addingSticker && <NewSticker nextPosition={stickers.length} onDone={() => setAddingSticker(false)} />}
      {creating && isAdmin && (
        <NewInitiative
          ctx={ctx}
          defaultBrand={brandTab !== ALL && brandTab !== 'sin' ? brandTab : ''}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      {brandTab === ALL ? (
        <BrandOverview brands={liveBrands} tasks={tasks} ctx={ctx} onPick={setBrandTab} />
      ) : (
        <BrandSummary tasks={visible} ctx={ctx} brand={brands.find((b) => b.id === brandTab)} />
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex gap-3" style={{ minWidth: `${columns.length * 252}px` }}>
          {columns.map((s) => {
            const items = visible.filter((t) => t.sticker_id === s.id)
            return (
              <section key={s.id} className="flex w-60 shrink-0 flex-col gap-2 rounded-xl bg-stone-100 p-2.5 dark:bg-stone-900/60">
                <div className="flex items-center justify-between px-0.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(s.color)}`}>{s.name}</span>
                  <span className="text-xs text-stone-500">{items.length}</span>
                </div>
                {items.map((t) => (
                  <InitiativeCard key={t.id} task={t} ctx={ctx} onOpen={() => setOpenId(t.id)} showBrand={brandTab === ALL || brandTab === 'sin'} />
                ))}
              </section>
            )
          })}
        </div>
      </div>

      {open && <InitiativeDetail task={open} ctx={ctx} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

function BrandTab({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
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

function catOf(t: Task, ctx: BoardCtx): StickerCategory | undefined {
  return ctx.stickers.find((s) => s.id === t.sticker_id)?.category
}

// Vista global: una tarjeta por marca con su avance, para entrar a cada una.
function BrandOverview({ brands, tasks, ctx, onPick }: { brands: Brand[]; tasks: Task[]; ctx: BoardCtx; onPick: (id: string) => void }) {
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
        const mine = tasks.filter((t) => t.brand_id === b.id)
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
            </div>
          </button>
        )
      })}
    </div>
  )
}

// Vista de una marca: avance, conteo por sticker y subtareas.
function BrandSummary({ tasks, ctx, brand }: { tasks: Task[]; ctx: BoardCtx; brand?: Brand }) {
  const p = progress(tasks, ctx.stickers)
  const subs = ctx.subtasks.filter((s) => tasks.some((t) => t.id === s.task_id))
  const subsDone = subs.filter((s) => s.done).length
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
      <div className="min-w-48 flex-1">
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium">{brand ? brand.name : 'Sin marca'} · avance</span>
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

function NewBrand({ onCreated }: { onCreated: (id: string) => void }) {
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

const CATEGORY_HELP: Record<StickerCategory, string> = {
  abierto: 'Sin empezar',
  en_curso: 'En curso (cuenta como carga)',
  terminado: 'Terminado (cuenta como avance)',
  cancelado: 'Cancelado (no cuenta)',
}

function NewSticker({ nextPosition, onDone }: { nextPosition: number; onDone: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  const [category, setCategory] = useState<StickerCategory>('en_curso')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre al sticker.')
    const { error } = await supabase.from('status_stickers').insert({ name: name.trim(), color, category, position: nextPosition })
    if (error) return setError(error.message.includes('duplicate') ? 'Ya existe un sticker con ese nombre.' : error.message)
    onDone()
  }

  return (
    <Card className="p-3">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3" noValidate>
        <input
          id="new-sticker"
          autoFocus
          className={input}
          placeholder="Esperando cliente"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        <ColorPicker value={color} onChange={setColor} />
        <select className={input} value={category} onChange={(e) => setCategory(e.target.value as StickerCategory)} aria-label="Cómo cuenta">
          {(Object.keys(CATEGORY_HELP) as StickerCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_HELP[c]}
            </option>
          ))}
        </select>
        {name.trim() && <span className={`rounded-full px-2 py-0.5 text-xs ${chipClass(color)}`}>{name.trim()}</span>}
        <button className={btnPrimary} type="submit">
          Crear sticker
        </button>
        <button className={btn} type="button" onClick={onDone}>
          Cancelar
        </button>
        {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
      </form>
    </Card>
  )
}

function NewInitiative({ ctx, defaultBrand, onCreated }: { ctx: BoardCtx; defaultBrand: string; onCreated: () => void }) {
  const [brand, setBrand] = useState(defaultBrand)
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
      brand_id: brand || null,
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
        <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
          <select className={input} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Marca">
            <option value="">Sin marca</option>
            {ctx.brands
              .filter((b) => !b.archived)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          <input
            id="new-initiative-title"
            className={input}
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
          <select className={input} value={sticker} onChange={(e) => setSticker(e.target.value)} aria-label="Estatus">
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
