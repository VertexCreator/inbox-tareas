import { Link } from 'react-router-dom'
import { gmailThreadUrl, shortDate, todayISO } from '../lib/data'
import type { AgentRun, Brand, Email, SummaryItem } from '../lib/types'
import { chipClass } from './colors'
import { Card, relativeDate } from './ui'

const LANES = [
  {
    key: 'p1' as const,
    label: 'Responder hoy',
    badge: 'P1',
    head: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
    bar: 'bg-red-500',
    empty: 'Nada urgente para hoy.',
  },
  {
    key: 'p2' as const,
    label: 'Esta semana',
    badge: 'P2',
    head: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    bar: 'bg-amber-500',
    empty: 'Nada pendiente para esta semana.',
  },
  {
    key: 'p3' as const,
    label: 'Cuando puedas',
    badge: 'P3',
    head: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
    bar: 'bg-stone-400',
    empty: 'Sin pendientes menores.',
  },
]

function dueLabel(due: string | null | undefined) {
  if (!due) return null
  const today = todayISO()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const t = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  if (due < today) return { text: `venció ${shortDate(due)}`, cls: 'bg-red-600 text-white' }
  if (due === today) return { text: 'hoy', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' }
  if (due === t) return { text: 'mañana', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' }
  return { text: shortDate(due), cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' }
}

// Resumen del agente en tarjetas por prioridad. Si la corrida no trae datos estructurados, muestra el texto.
export function SummaryBoard({
  run,
  todayCount,
  emails,
  brands,
  account,
  onSeeInbox,
}: {
  run: AgentRun
  todayCount: number
  emails: Email[]
  brands: Brand[]
  account?: string
  onSeeInbox: () => void
}) {
  const d = run.summary_data
  const header = (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-stone-500 dark:text-stone-400">
      <span className="font-medium text-indigo-600 dark:text-indigo-400">✦ Resumen del agente</span>
      <span>
        {relativeDate(run.ran_at)}
        {run.slot ? ` · ${run.slot}` : ''}
      </span>
      <span>· {run.emails_processed} correos analizados · {todayCount} hoy</span>
    </div>
  )

  if (!d) {
    return (
      <Card className="p-4">
        {header}
        <div className="whitespace-pre-line text-[15px] leading-relaxed">{run.summary}</div>
      </Card>
    )
  }

  const brandOf = (name?: string | null) => (name ? brands.find((b) => b.name.toLowerCase() === name.toLowerCase()) : undefined)
  const threadOf = (id?: string | null) => emails.find((e) => e.gmail_message_id === id)?.gmail_thread_id ?? null

  return (
    <Card className="p-4">
      {header}
      {d.headline && <p className="mb-4 text-lg font-medium leading-snug" style={{ textWrap: 'balance' }}>{d.headline}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        {LANES.map((lane) => {
          const items = d[lane.key] ?? []
          const total = d[`${lane.key}_total` as const] ?? items.length
          return (
            <section key={lane.key} className="flex flex-col overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
              <div className={`flex items-center justify-between px-3 py-2 ${lane.head}`}>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="rounded bg-white/60 px-1.5 text-[11px] dark:bg-black/20">{lane.badge}</span>
                  {lane.label}
                </span>
                <span className="text-xl font-medium tabular-nums">{total}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.length === 0 && <div className="px-1 py-3 text-xs text-stone-400">{lane.empty}</div>}
                {items.map((it, i) => (
                  <SummaryCardItem
                    key={i}
                    item={it}
                    bar={lane.bar}
                    brand={brandOf(it.brand)}
                    url={gmailThreadUrl(threadOf(it.gmail_message_id), account)}
                  />
                ))}
                {total > items.length && (
                  <button className="mt-auto rounded px-2 py-1 text-left text-xs text-indigo-600 hover:bg-stone-50 dark:text-indigo-400 dark:hover:bg-stone-800/50" onClick={onSeeInbox}>
                    +{total - items.length} más en tu bandeja ↓
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(d.pendientes?.length ?? 0) > 0 && (
          <Link to="/listas" className="rounded-lg bg-indigo-50 p-2.5 text-xs text-indigo-900 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-100 dark:hover:bg-indigo-900">
            <div className="mb-1 font-medium">📋 {d.pendientes!.length} pendientes nuevos →</div>
            {d.pendientes!.slice(0, 3).map((p, i) => (
              <div key={i} className="truncate opacity-80">
                {p.brand ? `${p.brand} · ` : ''}
                {p.title}
                {p.recommended ? ` → ${p.recommended}` : ''}
              </div>
            ))}
          </Link>
        )}
        {d.equipo && (
          <div className="rounded-lg bg-stone-100 p-2.5 text-xs dark:bg-stone-800/60">
            <div className="mb-1 font-medium">👥 Equipo</div>
            <div className="text-stone-600 dark:text-stone-300">{d.equipo}</div>
          </div>
        )}
        {typeof d.junk === 'number' && (
          <div className="rounded-lg bg-stone-100 p-2.5 text-xs dark:bg-stone-800/60">
            <div className="mb-1 font-medium">🗑 Basura filtrada</div>
            <div className="text-2xl font-medium tabular-nums text-stone-600 dark:text-stone-300">{d.junk}</div>
          </div>
        )}
        {(d.suspicious?.length ?? 0) > 0 && (
          <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            <div className="mb-1 font-medium">⚠ Correos sospechosos</div>
            {d.suspicious!.map((s, i) => (
              <div key={i} className="truncate">
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function SummaryCardItem({ item, bar, brand, url }: { item: SummaryItem; bar: string; brand?: Brand; url: string | null }) {
  const due = dueLabel(item.due)
  return (
    <div className="relative overflow-hidden rounded-md bg-white py-2 pl-3 pr-2 text-sm shadow-[0_0_0_1px_rgba(0,0,0,0.05)] dark:bg-stone-900 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
      <div className="font-medium leading-snug">{item.title}</div>
      {item.detail && <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{item.detail}</div>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {item.mentioned && <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">@ te mencionan</span>}
        {brand ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chipClass(brand.color)}`}>{brand.name}</span>
        ) : (
          item.brand && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] dark:bg-stone-800">{item.brand}</span>
        )}
        {due && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${due.cls}`}>{due.text}</span>}
        {item.from && <span className="truncate text-[11px] text-stone-400">{item.from}</span>}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Abrir ↗
          </a>
        )}
      </div>
    </div>
  )
}
