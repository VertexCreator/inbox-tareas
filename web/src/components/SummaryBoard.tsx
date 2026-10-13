import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { gmailThreadUrl, shortDate, todayISO } from '../lib/data'
import type { AgentRun, Brand, Email, SummaryData } from '../lib/types'
import { chipClass } from './colors'
import { splitSummaryText, type Level } from '../lib/summary'
import { Card, relativeDate } from './ui'
import { BrandChips, brandIdsOf, hasBrand } from './Brands'

const LANES: { key: Level; label: string; head: string; bar: string; empty: string; visible: number; startOpen: boolean }[] = [
  { key: 'P1', label: 'Responder hoy', head: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200', bar: 'bg-red-500', empty: 'Nada urgente para hoy.', visible: 4, startOpen: true },
  { key: 'P2', label: 'Esta semana', head: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200', bar: 'bg-amber-500', empty: 'Nada pendiente para esta semana.', visible: 4, startOpen: true },
  { key: 'P3', label: 'Cuando puedas', head: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200', bar: 'bg-stone-400', empty: 'Sin pendientes menores.', visible: 4, startOpen: false },
]

function dueLabel(due: string | null | undefined) {
  if (!due) return null
  const today = todayISO()
  const t = new Date()
  t.setDate(t.getDate() + 1)
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  if (due < today) return { text: `venció ${shortDate(due)}`, cls: 'bg-red-600 text-white' }
  if (due === today) return { text: 'hoy', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' }
  if (due === tomorrow) return { text: 'mañana', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' }
  return { text: shortDate(due), cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' }
}

const urgency = (e: Email) => `${e.reply_by ?? '9999'}${e.mentioned ? '0' : '1'}${e.received_at ?? ''}`

interface Props {
  run: AgentRun | null
  prevRun: AgentRun | null
  todayCount: number
  emails: Email[]
  brands: Brand[]
  account?: string
  created: string[]
  onDone: (id: string) => void
  onPending: (e: Email) => void
  onMove: (e: Email, to: Level) => void
  onSeeInbox: () => void
}

// Tres cuadros por prioridad armados con los correos clasificados (no con el texto del agente):
// siempre al día, y si el agente falla o escribe en formato viejo, se ven igual.
export function SummaryBoard({ run, prevRun, todayCount, emails, brands, account, created, onDone, onPending, onMove, onSeeInbox }: Props) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Level | null>(null)
  const [brand, setBrand] = useState('')
  const [onlyMentions, setOnlyMentions] = useState(false)
  const [expanded, setExpanded] = useState<Partial<Record<Level, boolean>>>({})
  const [open, setOpen] = useState<Record<Level, boolean>>({ P1: true, P2: true, P3: false })

  const d: SummaryData | null = run?.summary_data ?? null
  const legacy = useMemo(() => (d ? null : splitSummaryText(run?.summary)), [d, run?.summary])
  const headline = d?.headline || legacy?.headline || ''

  const brandsInInbox = brands.filter((b) => emails.some((e) => hasBrand(e, b.id)))
  const filtered = emails.filter((e) => (!brand || hasBrand(e, brand)) && (!onlyMentions || e.mentioned))
  const since = prevRun?.ran_at ?? null
  const mentionsCount = emails.filter((e) => e.mentioned).length

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-stone-500 dark:text-stone-400">
        <span className="font-medium text-indigo-600 dark:text-indigo-400">✦ Resumen de tus correos</span>
        {run && (
          <span>
            · análisis {relativeDate(run.ran_at)}
            {run.slot ? ` (${run.slot})` : ''}
          </span>
        )}
        <span>· {todayCount} correos hoy</span>
      </div>
      {headline && (
        <p className="mb-3 text-lg font-medium leading-snug" style={{ textWrap: 'balance' }}>
          {headline}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setBrand('')}
          className={`rounded-lg px-2.5 py-1 text-xs ${!brand ? 'bg-stone-200 font-medium dark:bg-stone-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-900 dark:text-stone-300'}`}
        >
          Todas las marcas
        </button>
        {brandsInInbox.map((b) => (
          <button
            key={b.id}
            onClick={() => setBrand(brand === b.id ? '' : b.id)}
            className={`rounded-lg px-2.5 py-1 text-xs ${brand === b.id ? `${chipClass(b.color)} font-medium` : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-900 dark:text-stone-300'}`}
          >
            {b.name} {emails.filter((e) => hasBrand(e, b.id)).length}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            role="switch"
            className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-stone-300 transition before:block before:h-3 before:w-3 before:translate-x-0.5 before:rounded-full before:bg-white before:transition checked:bg-indigo-600 checked:before:translate-x-4 dark:bg-stone-700"
            checked={onlyMentions}
            onChange={(e) => setOnlyMentions(e.target.checked)}
          />
          Solo donde me mencionan ({mentionsCount})
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {LANES.map((lane) => {
          const items = filtered.filter((e) => e.priority === lane.key).sort((a, b) => urgency(a).localeCompare(urgency(b)))
          const fresh = since ? items.filter((e) => (e.received_at ?? '') > since).length : 0
          const isOpen = open[lane.key]
          const shown = expanded[lane.key] ? items : items.slice(0, lane.visible)
          return (
            <section
              key={lane.key}
              className={`flex flex-col overflow-hidden rounded-lg border transition ${
                over === lane.key ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-stone-200 dark:border-stone-800'
              }`}
              onDragOver={(ev) => {
                if (!dragging) return
                ev.preventDefault()
                ev.dataTransfer.dropEffect = 'move'
                if (over !== lane.key) setOver(lane.key)
              }}
              onDragLeave={(ev) => {
                if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setOver(null)
              }}
              onDrop={(ev) => {
                ev.preventDefault()
                const em = emails.find((x) => x.id === ev.dataTransfer.getData('text/plain'))
                setOver(null)
                setDragging(null)
                if (em && em.priority !== lane.key) {
                  setOpen((o) => ({ ...o, [lane.key]: true }))
                  onMove(em, lane.key)
                }
              }}
            >
              <button
                className={`flex items-center justify-between px-3 py-2 text-left ${lane.head}`}
                onClick={() => setOpen({ ...open, [lane.key]: !isOpen })}
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="rounded bg-white/60 px-1.5 text-[11px] dark:bg-black/20">{lane.key}</span>
                  {lane.label}
                </span>
                <span className="flex items-baseline gap-1.5">
                  {fresh > 0 && <span className="text-[11px] font-medium">+{fresh} nuevos</span>}
                  <span className="text-2xl font-medium tabular-nums">{items.length}</span>
                  <span className="text-xs opacity-60">{isOpen ? '▾' : '▸'}</span>
                </span>
              </button>
              {dragging && over === lane.key && (
                <div className="mx-2 mt-2 rounded-md border-2 border-dashed border-indigo-400 py-2 text-center text-xs text-indigo-600 dark:text-indigo-300">
                  Soltar para mover a {lane.key}
                </div>
              )}
              {!isOpen && (
                <button
                  className="flex flex-1 items-start px-3 py-3 text-left text-xs text-stone-500 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-800/40"
                  onClick={() => setOpen({ ...open, [lane.key]: true })}
                >
                  {items.length ? `Mostrar ${items.length} ${items.length === 1 ? 'correo' : 'correos'} ▸` : lane.empty}
                </button>
              )}
              {isOpen && (
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.length === 0 && <div className="px-1 py-3 text-xs text-stone-400">{lane.empty}</div>}
                  {shown.map((e) => (
                    <EmailCard
                      key={e.id}
                      email={e}
                      bar={lane.bar}
                      brands={brands}
                      url={gmailThreadUrl(e.gmail_thread_id, account)}
                      created={created.includes(e.id)}
                      onDone={() => onDone(e.id)}
                      onPending={() => onPending(e)}
                      onMove={(to) => onMove(e, to)}
                      onDragStart={() => setDragging(e.id)}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                      isDragging={dragging === e.id}
                    />
                  ))}
                  {items.length > lane.visible && (
                    <button
                      className="mt-auto rounded px-2 py-1 text-left text-xs font-medium text-indigo-600 hover:bg-stone-50 dark:text-indigo-400 dark:hover:bg-stone-800/50"
                      onClick={() => setExpanded({ ...expanded, [lane.key]: !expanded[lane.key] })}
                    >
                      {expanded[lane.key] ? 'Ver menos' : `Ver los ${items.length} →`}
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <Extras d={d} />
      <div className="mt-2 text-right">
        <button className="text-xs text-stone-500 hover:underline dark:text-stone-400" onClick={onSeeInbox}>
          Ver la bandeja completa ↓
        </button>
      </div>
    </Card>
  )
}

function EmailCard({
  email: e,
  bar,
  brands,
  url,
  created,
  onDone,
  onPending,
  onMove,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  email: Email
  bar: string
  brands: Brand[]
  url: string | null
  created: boolean
  onDone: () => void
  onPending: () => void
  onMove: (to: Level) => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  const due = dueLabel(e.reply_by)
  const who = e.from_name || e.from_email || ''
  return (
    <div
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData('text/plain', e.id)
        ev.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      title="Arrastra a otro cuadro para cambiar la prioridad"
      className={`group relative cursor-grab overflow-hidden rounded-md bg-white py-2 pl-3 pr-2 text-sm shadow-[0_0_0_1px_rgba(0,0,0,0.06)] active:cursor-grabbing dark:bg-stone-900 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07)] ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 font-medium leading-snug">{e.summary || e.subject}</div>
        <span className="flex shrink-0 gap-0.5" aria-label="Mover a otra prioridad">
          {(['P1', 'P2', 'P3'] as Level[])
            .filter((l) => l !== e.priority)
            .map((l) => (
              <button
                key={l}
                className="rounded px-1 py-0.5 text-[10px] text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                onClick={() => onMove(l)}
                title={`Mover a ${l}`}
              >
                →{l}
              </button>
            ))}
        </span>
      </div>
      <div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
        {who}
        {e.summary && e.subject ? ` · ${e.subject}` : ''}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {e.mentioned && <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">@ te mencionan</span>}
        {!e.mentioned && e.addressed && e.addressed !== 'para' && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800">{e.addressed === 'copia' ? 'en copia' : 'por lista'}</span>
        )}
        <BrandChips ids={brandIdsOf(e)} brands={brands} hideEmpty />
        {e.suggested_brand && (
          <span className="rounded border border-dashed border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 dark:border-violet-700 dark:text-violet-300">¿{e.suggested_brand}?</span>
        )}
        {due && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${due.cls}`}>{due.text}</span>}
        {e.draft_created && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">borrador listo</span>}
        {e.priority_locked && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400" title="La prioridad la fijaste tú; el agente no la cambia">
            📌 fijada por ti
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 border-t border-stone-100 pt-1.5 dark:border-stone-800">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="rounded px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950">
            Abrir ↗
          </a>
        )}
        <button
          className={`rounded px-1.5 py-0.5 text-[11px] hover:bg-stone-100 dark:hover:bg-stone-800 ${created ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-600 dark:text-stone-300'}`}
          onClick={onPending}
          title={created ? 'Este correo ya tiene pendiente; puedes crear otro' : 'Crear y asignar desde este correo'}
        >
          {created ? '✓ Con pendiente' : 'Crear pendiente'}
        </button>
        <button className="ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={onDone}>
          ✓ Listo
        </button>
      </div>
    </div>
  )
}

function Extras({ d }: { d: SummaryData | null }) {
  if (!d) return null
  const has = (d.pendientes?.length ?? 0) > 0 || (d.iniciativas?.length ?? 0) > 0 || d.equipo || typeof d.junk === 'number' || (d.suspicious?.length ?? 0) > 0
  if (!has) return null
  return (
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
      {(d.iniciativas?.length ?? 0) > 0 && (
        <Link to="/tablero" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900">
          <div className="mb-1 font-medium">⏱ {d.iniciativas!.length} iniciativas vencen →</div>
          {d.iniciativas!.slice(0, 3).map((x, i) => (
            <div key={i} className={`truncate ${x.overdue ? 'font-medium text-red-700 dark:text-red-300' : 'opacity-80'}`}>
              {x.brand ? `${x.brand} · ` : ''}
              {x.title}
              {x.owner ? ` · ${x.owner}` : ''}
              {x.overdue ? ' · vencida' : ''}
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
  )
}
