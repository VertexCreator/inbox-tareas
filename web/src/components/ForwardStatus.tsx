import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { relativeShort } from '../lib/data'
import { forwardEta, mmss, useNow, type ForwardRow, type ForwardSchedule } from '../lib/forwards'
import { supabase, uniqueChannel } from '../lib/supabase'

function etaText(schedule: ForwardSchedule, now: number, sender?: string | null) {
  const eta = forwardEta(schedule, now, sender)
  if (eta.kind === 'countdown') return { short: mmss(eta.seconds), long: `se envía en ${mmss(eta.seconds)}`, stalled: false }
  if (eta.kind === 'soon') return { short: 'ya', long: 'se envía en cualquier momento', stalled: false }
  return {
    short: 'script detenido',
    long: eta.lastCheck
      ? `el script de Gmail ${sender ? 'de quien asignó ' : ''}no revisa desde ${relativeShort(eta.lastCheck)}: revisa Apps Script`
      : sender
        ? 'quien asignó todavía no conectó su Gmail en Mi correo'
        : 'el script de Gmail todavía no tiene la versión nueva: pégala en Apps Script y ejecuta instalar',
    stalled: true,
  }
}

// Indicador pequeño para las tarjetas: ✉ con el contador mientras está en camino, ✓ cuando se envió.
export function ForwardBadge({ forward, schedule, name }: { forward?: ForwardRow; schedule: ForwardSchedule; name?: string | null }) {
  const now = useNow(forward?.status === 'pendiente')
  if (!forward) return null
  const who = name ?? 'la persona asignada'

  if (forward.status === 'pendiente') {
    const t = etaText(schedule, now, forward.sender_member_id)
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
          t.stalled ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
        }`}
        title={`Correo para ${who}: ${t.long}`}
        aria-label={`Correo para ${who}: ${t.long}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${t.stalled ? 'bg-red-500' : 'animate-pulse bg-amber-500'}`} aria-hidden="true" />✉ {t.short}
      </span>
    )
  }
  if (forward.status === 'enviado') {
    const text = `Correo enviado a ${who}${forward.sent_at ? ` · ${relativeShort(forward.sent_at)}` : ''}`
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" title={text} aria-label={text}>
        ✉✓
      </span>
    )
  }
  if (forward.status === 'error') {
    const text = `No se pudo enviar el correo a ${who}${forward.detail ? `: ${forward.detail}` : ''}${forward.attempts < 3 ? ' · se reintenta en la próxima pasada' : ''}`
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300" title={text} aria-label={text}>
        ✉!
      </span>
    )
  }
  const text = `Correo no reenviado${forward.detail ? `: ${forward.detail}` : ''}`
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400" title={text} aria-label={text}>
      ✉–
    </span>
  )
}

// Línea completa para el detalle de la iniciativa mientras el correo está en camino.
export function ForwardCountdown({ schedule, name, sender }: { schedule: ForwardSchedule; name?: string | null; sender?: string | null }) {
  const now = useNow(true)
  const t = etaText(schedule, now, sender)
  return (
    <span className="tabular-nums">
      Correo para {name ?? 'la persona asignada'}: {t.long}.
    </span>
  )
}

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
}

// Aviso al gerente cuando el script termina un reenvío (aparece abajo a la derecha en cualquier página).
export function ForwardToasts() {
  const { isAdmin } = useAuth()
  const [toasts, setToasts] = useState<Toast[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase
      .channel(uniqueChannel('forward-toasts'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'email_forwards' }, async (payload) => {
        const row = payload.new as ForwardRow
        if (row.status !== 'enviado' && row.status !== 'error') return
        const key = `${row.id}-${row.status}-${row.attempts}`
        if (seen.current.has(key)) return
        seen.current.add(key)
        const [t, m] = await Promise.all([
          supabase.from('tasks').select('title').eq('id', row.task_id).maybeSingle(),
          supabase.from('team_members').select('name').eq('id', row.member_id).maybeSingle(),
        ])
        const title = t.data?.title ?? 'la iniciativa'
        const name = m.data?.name ?? 'la persona asignada'
        const toast: Toast = {
          id: Date.now() + Math.random(),
          tone: row.status === 'enviado' ? 'ok' : 'error',
          text: row.status === 'enviado' ? `✉ Correo enviado a ${name}: "${title}"` : `✉ No se pudo enviar el correo de "${title}" a ${name}${row.detail ? `: ${row.detail}` : ''}`,
        }
        setToasts((list) => [...list, toast])
        setTimeout(() => setToasts((list) => list.filter((x) => x.id !== toast.id)), 8000)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAdmin])

  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm shadow-lg ${
            t.tone === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <span className="flex-1">{t.text}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
