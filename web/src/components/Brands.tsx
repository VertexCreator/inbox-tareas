import type { Brand } from '../lib/types'
import { chipClass } from './colors'

// Marcas de un correo, pendiente o iniciativa: la principal primero. Con dos o más, es multimarca.
export function brandIdsOf(x: { brand_id: string | null; brand_ids?: string[] | null }) {
  if (x.brand_ids && x.brand_ids.length > 0) return x.brand_ids
  return x.brand_id ? [x.brand_id] : []
}

export function isMultibrand(x: { brand_id: string | null; brand_ids?: string[] | null }) {
  return brandIdsOf(x).length > 1
}

export function hasBrand(x: { brand_id: string | null; brand_ids?: string[] | null }, brandId: string) {
  return brandIdsOf(x).includes(brandId)
}

export function BrandChip({ brand }: { brand?: Brand | null }) {
  if (!brand) return <span className="rounded px-1.5 py-0.5 text-[10px] text-stone-400 ring-1 ring-stone-200 dark:ring-stone-700">Sin marca</span>
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chipClass(brand.color)}`}>{brand.name}</span>
}

export function MultibrandPill({ count }: { count: number }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
      style={{ background: 'linear-gradient(90deg, #0066B3, #00B6BE)' }}
      title={`Iniciativa multimarca · ${count} marcas`}
    >
      Multimarca
    </span>
  )
}

// "Multimarca" + las marcas que la forman. `hideEmpty` no muestra "Sin marca".
export function BrandChips({ ids, brands, hideEmpty = false }: { ids: string[]; brands: Brand[]; hideEmpty?: boolean }) {
  const list = ids.map((id) => brands.find((b) => b.id === id)).filter((b): b is Brand => !!b)
  if (list.length === 0) return hideEmpty ? null : <BrandChip brand={null} />
  if (list.length === 1) return <BrandChip brand={list[0]} />
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <MultibrandPill count={list.length} />
      {list.map((b) => (
        <BrandChip key={b.id} brand={b} />
      ))}
    </span>
  )
}

// Elegir una o varias marcas. La primera es la principal (★); clic en otra elegida la vuelve principal.
export function BrandPicker({
  value,
  onChange,
  brands,
  label = 'Marcas',
}: {
  value: string[]
  onChange: (ids: string[]) => void
  brands: Brand[]
  label?: string
}) {
  const live = brands.filter((b) => !b.archived || value.includes(b.id))
  const selected = value.map((id) => live.find((b) => b.id === id)).filter((b): b is Brand => !!b)
  const rest = live.filter((b) => !value.includes(b.id))
  if (live.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {selected.length > 1 && <MultibrandPill count={selected.length} />}
      {selected.map((b, i) => (
        <span key={b.id} className={`inline-flex items-center rounded text-[11px] font-medium ${chipClass(b.color)}`}>
          <button
            type="button"
            className="px-1.5 py-0.5"
            onClick={() => i > 0 && onChange([b.id, ...value.filter((x) => x !== b.id)])}
            title={i === 0 ? 'Marca principal' : 'Hacer principal'}
          >
            {i === 0 && selected.length > 1 ? '★ ' : ''}
            {b.name}
          </button>
          <button
            type="button"
            className="pr-1.5 opacity-60 hover:opacity-100"
            onClick={() => onChange(value.filter((x) => x !== b.id))}
            aria-label={`Quitar ${b.name}`}
          >
            ×
          </button>
        </span>
      ))}
      {rest.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onChange([...value, b.id])}
          className="rounded border border-dashed border-stone-300 px-1.5 py-0.5 text-[11px] text-stone-500 hover:border-stone-500 hover:text-stone-700 dark:border-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          + {b.name}
        </button>
      ))}
    </div>
  )
}
