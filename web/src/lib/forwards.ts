import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, uniqueChannel } from './supabase'

// Reenvío del correo a la persona asignada (lo hace el script de Gmail cada 5 minutos).
export interface ForwardRow {
  id: number
  task_id: string
  member_id: string
  status: 'pendiente' | 'enviado' | 'omitido' | 'error'
  detail: string | null
  attempts: number
  created_at: string
  sent_at: string | null
}

export interface ForwardSchedule {
  lastCheck: string | null
  everyMinutes: number
}

// El último reenvío de cada iniciativa y cuándo pasó el script por última vez. En tiempo real.
export function useForwards() {
  const [rows, setRows] = useState<ForwardRow[]>([])
  const [schedule, setSchedule] = useState<ForwardSchedule>({ lastCheck: null, everyMinutes: 5 })

  const loadSchedule = useCallback(async () => {
    const { data } = await supabase.rpc('forward_schedule')
    if (data) setSchedule({ lastCheck: data.last_check ?? null, everyMinutes: data.every_minutes ?? 5 })
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('email_forwards')
      .select('id, task_id, member_id, status, detail, attempts, created_at, sent_at')
      .order('created_at', { ascending: false })
      .limit(500)
    setRows((data ?? []) as ForwardRow[])
    loadSchedule()
  }, [loadSchedule])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(uniqueChannel('email-forwards'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_forwards' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  // Mientras haya algo en camino, se consulta cada 30 s cuándo pasó el script (para el contador).
  const anyPending = rows.some((r) => r.status === 'pendiente')
  useEffect(() => {
    if (!anyPending) return
    const t = setInterval(loadSchedule, 30_000)
    return () => clearInterval(t)
  }, [anyPending, loadSchedule])

  const byTask = useMemo(() => {
    const m: Record<string, ForwardRow> = {}
    for (const r of rows) if (!m[r.task_id]) m[r.task_id] = r
    return m
  }, [rows])

  return { byTask, schedule, reload: load }
}

// Reloj que avanza cada segundo solo mientras se necesita.
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

export type Eta =
  | { kind: 'countdown'; seconds: number }
  | { kind: 'soon' }
  | { kind: 'stalled'; lastCheck: string | null }

// Cuánto falta para la próxima pasada del script. Si lleva más de 15 minutos sin pasar, está detenido.
export function forwardEta(schedule: ForwardSchedule, now: number): Eta {
  if (!schedule.lastCheck) return { kind: 'stalled', lastCheck: null }
  const last = new Date(schedule.lastCheck).getTime()
  if (now - last > 15 * 60_000) return { kind: 'stalled', lastCheck: schedule.lastCheck }
  const next = last + schedule.everyMinutes * 60_000
  const seconds = Math.round((next - now) / 1000)
  return seconds > 0 ? { kind: 'countdown', seconds } : { kind: 'soon' }
}

export function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
