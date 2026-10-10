import type { ReactNode } from 'react'

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100',
  'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100',
  'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100',
  'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-100',
]

function colorFor(key: string) {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function Avatar({ name, id, size = 'sm' }: { name: string; id: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs'
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${dim} ${colorFor(id)}`}
    >
      {initials(name)}
    </span>
  )
}

const PRIORITY_STYLE: Record<string, string> = {
  P1: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  P2: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  P3: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  ninguna: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.ninguna}`}>
      {priority === 'ninguna' ? '—' : priority}
    </span>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' }) {
  const styles = {
    neutral: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    accent: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200',
    warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  }
  return <span className={`rounded-md px-2 py-0.5 text-[11px] ${styles[tone]}`}>{children}</span>
}

export function LoadBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-stone-500 dark:text-stone-400">{pct}%</span>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${className}`}>
      {children}
    </div>
  )
}

export function Metric({ label, value, tone = 'neutral' }: { label: string; value: number | string; tone?: 'neutral' | 'danger' | 'warning' | 'accent' }) {
  const styles = {
    neutral: 'bg-stone-100 text-stone-900 dark:bg-stone-900 dark:text-stone-100',
    danger: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
    warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    accent: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  }
  return (
    <div className={`rounded-lg p-3 ${styles[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-medium tabular-nums">{value}</div>
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400">{children}</h2>
      {right}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">{children}</div>
}

export const btn =
  'rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 active:scale-[0.98] disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800'
export const btnPrimary =
  'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50'
export const input =
  'rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900'

export function relativeDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
