import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Deshacer en toda la app: cada acción reversible se registra con su forma de revertirla.
// Se muestra un aviso grande abajo con "↶ Deshacer" (10 s), queda un botón en la barra de arriba para las
// últimas acciones (5 min) y funciona ⌘Z / Ctrl+Z.

export interface UndoEntry {
  id: number
  label: string
  undo: () => Promise<void>
  after?: () => void
  action?: { label: string; onClick: () => void }
  at: number
}

interface UndoApi {
  track: (label: string, undo: () => Promise<void>, opts?: { after?: () => void; action?: { label: string; onClick: () => void } }) => void
  undoLast: () => Promise<void>
  stack: UndoEntry[]
}

const UndoContext = createContext<UndoApi | null>(null)

const TOAST_MS = 10_000
const KEEP_MS = 5 * 60_000
const MAX = 10

export function useUndo() {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo debe usarse dentro de UndoProvider')
  return ctx
}

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([])
  const [toast, setToast] = useState<UndoEntry | null>(null)
  const [result, setResult] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stackRef = useRef<UndoEntry[]>([])
  stackRef.current = stack

  const track: UndoApi['track'] = useCallback((label, undo, opts) => {
    const entry: UndoEntry = { id: Date.now() + Math.random(), label, undo, after: opts?.after, action: opts?.action, at: Date.now() }
    setStack((s) => [entry, ...s].slice(0, MAX))
    setResult(null)
    setToast(entry)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  const run = useCallback(async (entry: UndoEntry) => {
    setBusy(true)
    setStack((s) => s.filter((x) => x.id !== entry.id))
    setToast((t) => (t?.id === entry.id ? null : t))
    try {
      await entry.undo()
      entry.after?.()
      setResult({ text: `↶ Deshecho: ${entry.label}`, tone: 'ok' })
    } catch (e) {
      setResult({ text: `No se pudo deshacer: ${e instanceof Error ? e.message : 'error'}`, tone: 'error' })
    } finally {
      setBusy(false)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setResult(null), 4000)
    }
  }, [])

  const undoLast = useCallback(async () => {
    const top = stackRef.current.find((x) => Date.now() - x.at < KEEP_MS)
    if (top) await run(top)
  }, [run])

  // ⌘Z / Ctrl+Z, salvo mientras se escribe en un campo (ahí deshace el texto, como siempre).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing(e.target) && stackRef.current.length) {
        e.preventDefault()
        undoLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoLast])

  // Lo de hace más de 5 minutos ya no se ofrece.
  useEffect(() => {
    if (!stack.length) return
    const t = setInterval(() => setStack((s) => s.filter((x) => Date.now() - x.at < KEEP_MS)), 15_000)
    return () => clearInterval(t)
  }, [stack.length])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

  return (
    <UndoContext.Provider value={{ track, undoLast, stack }}>
      {children}
      {(toast || result) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-3">
          {toast ? (
            <div
              key={toast.id}
              className="pointer-events-auto relative flex w-full max-w-xl items-center gap-3 overflow-hidden rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-black/10 dark:bg-stone-100 dark:text-stone-900"
              role="status"
              aria-live="polite"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs text-white" aria-hidden="true">
                ✓
              </span>
              <span className="min-w-0 flex-1 leading-snug">{toast.label}</span>
              {toast.action && (
                <button
                  className="shrink-0 text-xs font-medium text-sky-300 hover:underline dark:text-sky-700"
                  onClick={() => {
                    toast.action!.onClick()
                    setToast(null)
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-amber-100 active:scale-95 disabled:opacity-60 dark:bg-stone-900 dark:text-white dark:hover:bg-stone-700"
                onClick={() => run(toast)}
                disabled={busy}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  ↶
                </span>
                Deshacer
                <kbd className="ml-1 hidden rounded bg-stone-200 px-1 text-[10px] font-normal text-stone-600 sm:inline dark:bg-stone-700 dark:text-stone-300">
                  {mac ? '⌘Z' : 'Ctrl+Z'}
                </kbd>
              </button>
              <button className="shrink-0 px-1 text-lg leading-none text-stone-400 hover:text-white dark:hover:text-stone-900" onClick={() => setToast(null)} aria-label="Cerrar aviso">
                ×
              </button>
              <span
                className="absolute bottom-0 left-0 h-1 bg-emerald-400"
                style={{ animation: `undo-countdown ${TOAST_MS}ms linear forwards` }}
                aria-hidden="true"
              />
            </div>
          ) : (
            <div
              className={`pointer-events-auto rounded-2xl px-4 py-2.5 text-sm shadow-xl ${result!.tone === 'ok' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-red-600 text-white'}`}
              role="status"
              aria-live="polite"
            >
              {result!.text}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes undo-countdown { from { width: 100% } to { width: 0% } }`}</style>
    </UndoContext.Provider>
  )
}

// Botón fijo en la barra de arriba: deshace la última acción (de los últimos 5 minutos).
export function UndoButton() {
  const { stack, undoLast } = useUndo()
  const available = stack.filter((x) => Date.now() - x.at < KEEP_MS)
  if (!available.length) return null
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  return (
    <button
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 active:scale-95 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
      onClick={() => undoLast()}
      title={`Deshacer: ${available[0].label} (${mac ? '⌘Z' : 'Ctrl+Z'})`}
      aria-label={`Deshacer: ${available[0].label}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        ↶
      </span>
      Deshacer
      {available.length > 1 && <span className="rounded-full bg-amber-200 px-1.5 text-[11px] tabular-nums dark:bg-amber-800">{available.length}</span>}
    </button>
  )
}
