import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Sticker, StickerCategory } from '../lib/types'
import { ColorPicker } from './ColorPicker'
import { chipClass } from './colors'
import { btn, btnPrimary, input } from './ui'

// Etapas del flujo de trabajo (columnas del tablero). En la base se llaman status_stickers.
export const CATEGORY_HELP: Record<StickerCategory, string> = {
  abierto: 'Sin empezar',
  en_curso: 'En curso (cuenta como carga)',
  terminado: 'Terminado (cuenta como avance)',
  cancelado: 'Cancelado (no cuenta)',
}

function friendly(message: string) {
  return message.includes('duplicate') ? 'Ya existe una etapa con ese nombre.' : message
}

export async function moveStage(stages: Sticker[], id: string, dir: -1 | 1) {
  const ids = stages.map((s) => s.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return null
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  const { error } = await supabase.rpc('reorder_stages', { p_ids: ids })
  return error ? error.message : null
}

// Encabezado de columna: nombre (doble clic para renombrar) y menú con color, orden, cómo cuenta y borrar.
export function StageHeader({
  stage,
  stages,
  count,
  isAdmin,
  onChanged,
  onError,
}: {
  stage: Sticker
  stages: Sticker[]
  count: number
  isAdmin: boolean
  onChanged: () => void
  onError: (m: string | null) => void
}) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(stage.name)
  const [deleting, setDeleting] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const index = stages.findIndex((s) => s.id === stage.id)

  useEffect(() => setName(stage.name), [stage.name])
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && (setMenu(false), setDeleting(false))
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  const update = async (patch: Partial<Sticker>) => {
    onError(null)
    const { error } = await supabase.from('status_stickers').update(patch).eq('id', stage.id)
    if (error) onError(friendly(error.message))
    onChanged()
  }
  const saveName = async () => {
    setRenaming(false)
    if (name.trim() && name.trim() !== stage.name) await update({ name: name.trim() })
    else setName(stage.name)
  }
  const move = async (dir: -1 | 1) => {
    const err = await moveStage(stages, stage.id, dir)
    onError(err)
    onChanged()
  }
  const remove = async () => {
    onError(null)
    const { error } = await supabase.rpc('delete_stage', { p_id: stage.id, p_move_to: moveTo || null })
    if (error) return onError(error.message)
    setMenu(false)
    onChanged()
  }

  return (
    <div className="relative flex items-center justify-between gap-1 px-0.5" ref={ref}>
      {renaming ? (
        <input
          autoFocus
          className={`${input} w-full py-0.5 text-xs`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName()
            if (e.key === 'Escape') {
              setName(stage.name)
              setRenaming(false)
            }
          }}
          aria-label="Nombre de la etapa"
        />
      ) : (
        <button
          className={`truncate rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(stage.color)}`}
          onDoubleClick={() => isAdmin && setRenaming(true)}
          onClick={() => isAdmin && setMenu((v) => !v)}
          title={isAdmin ? 'Clic: opciones · doble clic: renombrar' : CATEGORY_HELP[stage.category]}
          disabled={!isAdmin}
        >
          {stage.name}
        </button>
      )}
      <span className="flex items-center gap-1">
        <span className="text-xs text-stone-500">{count}</span>
        {isAdmin && !renaming && (
          <button className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800" onClick={() => setMenu((v) => !v)} aria-label={`Opciones de ${stage.name}`} aria-expanded={menu}>
            ⋯
          </button>
        )}
      </span>
      {menu && (
        <div className="absolute left-0 top-7 z-20 w-64 space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <button
            className="w-full rounded px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
            onClick={() => {
              setMenu(false)
              setRenaming(true)
            }}
          >
            ✎ Renombrar
          </button>
          <div className="px-2">
            <div className="mb-1 text-stone-500">Color</div>
            <ColorPicker value={stage.color} onChange={(c) => update({ color: c })} />
          </div>
          <label className="block px-2">
            <span className="mb-1 block text-stone-500">Cómo cuenta</span>
            <select className={`${input} w-full py-1 text-xs`} value={stage.category} onChange={(e) => update({ category: e.target.value as StickerCategory })}>
              {(Object.keys(CATEGORY_HELP) as StickerCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_HELP[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1 px-2">
            <button className={`${btn} flex-1 py-1 text-xs`} disabled={index <= 0} onClick={() => move(-1)}>
              ← Mover
            </button>
            <button className={`${btn} flex-1 py-1 text-xs`} disabled={index >= stages.length - 1} onClick={() => move(1)}>
              Mover →
            </button>
          </div>
          {!deleting ? (
            <button className="w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950" onClick={() => setDeleting(true)} disabled={stages.length <= 1}>
              🗑 Borrar etapa
            </button>
          ) : (
            <div className="space-y-1.5 rounded bg-red-50 p-2 dark:bg-red-950/50">
              {count > 0 ? (
                <label className="block">
                  <span className="mb-1 block">Sus {count} iniciativas pasan a:</span>
                  <select className={`${input} w-full py-1 text-xs`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">Elige una etapa…</option>
                    {stages
                      .filter((s) => s.id !== stage.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <span className="block">¿Borrar "{stage.name}"? Está vacía.</span>
              )}
              <div className="flex gap-1">
                <button className={`${btn} py-1 text-xs text-red-600`} disabled={count > 0 && !moveTo} onClick={remove}>
                  Sí, borrar
                </button>
                <button className={`${btn} py-1 text-xs`} onClick={() => setDeleting(false)}>
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Columna al final del tablero para crear una etapa nueva.
export function NewStageColumn({ nextPosition, onCreated }: { nextPosition: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  const [category, setCategory] = useState<StickerCategory>('en_curso')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Ponle un nombre a la etapa.')
    const { error } = await supabase.from('status_stickers').insert({ name: name.trim(), color, category, position: nextPosition })
    if (error) return setError(friendly(error.message))
    setName('')
    setOpen(false)
    onCreated()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-12 w-60 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-stone-300 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700 dark:border-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        + Nueva etapa
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="w-60 shrink-0 space-y-2 rounded-xl bg-stone-100 p-2.5 dark:bg-stone-900/60" noValidate>
      <input
        autoFocus
        className={`${input} w-full`}
        placeholder="Ej. Esperando cliente"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        aria-label="Nombre de la etapa"
      />
      <ColorPicker value={color} onChange={setColor} />
      <select className={`${input} w-full text-xs`} value={category} onChange={(e) => setCategory(e.target.value as StickerCategory)} aria-label="Cómo cuenta">
        {(Object.keys(CATEGORY_HELP) as StickerCategory[]).map((c) => (
          <option key={c} value={c}>
            {CATEGORY_HELP[c]}
          </option>
        ))}
      </select>
      {name.trim() && <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${chipClass(color)}`}>{name.trim()}</span>}
      {error && <div className="text-[12px] text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex gap-1.5">
        <button className={btnPrimary} type="submit">
          Crear etapa
        </button>
        <button className={btn} type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
