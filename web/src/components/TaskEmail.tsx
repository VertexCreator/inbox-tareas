import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ForwardCountdown } from './ForwardStatus'
import type { ForwardSchedule } from '../lib/forwards'
import { useAuth } from '../lib/auth'
import { gmailThreadUrl, memberName, relativeShort } from '../lib/data'
import { supabase, uniqueChannel } from '../lib/supabase'
import type { Member, Task } from '../lib/types'
import { btn } from './ui'

interface Content {
  from_name: string | null
  from_email: string | null
  to_list: string | null
  cc_list: string | null
  subject: string | null
  sent_at: string | null
  body_text: string | null
  attachments: { name: string; size: number; type: string; inline?: boolean }[]
  fetched_at: string
}

interface Forward {
  id: number
  member_id: string
  status: 'pendiente' | 'enviado' | 'omitido' | 'error'
  detail: string | null
  attempts: number
  created_at: string
  sent_at: string | null
  sender_member_id: string | null
}

function size(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

// Dónde empieza el historial del hilo (lo citado de correos anteriores).
const HISTORY = /^(El .{4,120} escribió:|On .{4,120} wrote:|-{5,}\s*(Mensaje reenviado|Forwarded message|Mensaje original|Original Message)\s*-{5,}|De: .+\n(Enviado|Fecha|Sent|Date): )/im

const URL = /(https?:\/\/[^\s)]+)/g

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-indigo-600 underline dark:text-indigo-400">
            {p.length > 70 ? `${p.slice(0, 67)}…` : p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

// Texto del correo: los renglones citados (">") en gris y el historial del hilo plegado.
function Body({ text, full: fullView = false }: { text: string; full?: boolean }) {
  const [showHistory, setShowHistory] = useState(false)
  const [full, setFull] = useState(false)
  const { main, history } = useMemo(() => {
    const m = text.match(HISTORY)
    if (!m || m.index === undefined || m.index < 20) return { main: text, history: '' }
    return { main: text.slice(0, m.index).trimEnd(), history: text.slice(m.index) }
  }, [text])
  const long = !fullView && main.length > 1500
  const render = (t: string): ReactNode =>
    t.split('\n').map((line, i) => (
      <div key={i} className={line.startsWith('>') ? 'border-l-2 border-stone-300 pl-2 text-stone-500 dark:border-stone-700 dark:text-stone-400' : ''}>
        {line.trim() ? <Linkified text={line.replace(/^>+\s?/, '')} /> : ' '}
      </div>
    ))

  return (
    <div className="text-[13px] leading-relaxed">
      <div className={`whitespace-pre-wrap break-words ${long && !full ? 'max-h-80 overflow-hidden' : ''}`}>{render(main)}</div>
      {long && (
        <button className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setFull((v) => !v)}>
          {full ? 'Ver menos' : 'Ver todo el correo'}
        </button>
      )}
      {history && (
        <div className="mt-2">
          <button className="text-xs text-stone-500 hover:underline dark:text-stone-400" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? '▾ Ocultar' : '▸ Mostrar'} el historial del hilo
          </button>
          {showHistory && <div className="mt-1 whitespace-pre-wrap break-words text-stone-500 dark:text-stone-400">{render(history)}</div>}
        </div>
      )}
    </div>
  )
}

const FORWARD_TEXT: Record<Forward['status'], string> = {
  pendiente: 'Reenvío en camino: el script lo envía en los próximos 5 minutos.',
  enviado: 'Reenviado',
  omitido: 'No se reenvió',
  error: 'No se pudo reenviar',
}

// Correo original de la iniciativa, guardado por el script al asignarla. Lo ven el gerente, el responsable y
// quienes tienen subtareas en ella (la base no se lo entrega a nadie más).
export function TaskEmail({ task, members, schedule, variant = 'section' }: { task: Task; members: Member[]; schedule?: ForwardSchedule; variant?: 'section' | 'modal' }) {
  const modal = variant === 'modal'
  const [big, setBig] = useState(false)
  const { isAdmin } = useAuth()
  const [content, setContent] = useState<Content | null>(null)
  const [forwards, setForwards] = useState<Forward[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([
      supabase.from('task_email_content').select('*').eq('task_id', task.id).maybeSingle(),
      supabase.from('email_forwards').select('id, member_id, status, detail, attempts, created_at, sent_at, sender_member_id').eq('task_id', task.id).order('created_at', { ascending: false }),
    ])
    setContent((c.data as Content | null) ?? null)
    setForwards((f.data ?? []) as Forward[])
    setLoaded(true)
  }, [task.id])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(uniqueChannel(`task-email-${task.id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_email_content', filter: `task_id=eq.${task.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_forwards', filter: `task_id=eq.${task.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, task.id])

  const retry = async () => {
    setError(null)
    const { error } = await supabase.rpc('retry_email_forward', { p_task_id: task.id })
    if (error) setError(error.message)
    load()
  }

  if (!loaded || !task.email_id) return modal && loaded ? <p className="text-sm text-stone-500">Esta tarea no tiene un correo vinculado.</p> : null
  if (!content && forwards.length === 0) {
    if (modal) {
      return (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          El texto del correo todavía no está guardado. Se guarda cuando la iniciativa se asigna a alguien.
          {isAdmin && task.assignee_id && (
            <button className={`${btn} ml-2 px-2 py-0.5 text-xs`} onClick={retry}>
              Guardar y reenviar ahora
            </button>
          )}
        </p>
      )
    }
    if (!isAdmin) return null
    return (
      <section className="mt-5 rounded-lg border border-dashed border-stone-300 p-3 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
        ✉ Al asignar un responsable, el script le reenvía el correo original con sus adjuntos y lo guarda aquí.
        {task.assignee_id && (
          <button className={`${btn} ml-2 px-2 py-0.5 text-[11px]`} onClick={retry}>
            Reenviar ahora
          </button>
        )}
        {error && <span className="ml-2 text-red-600 dark:text-red-400">{error}</span>}
      </section>
    )
  }

  const last = forwards[0]
  const files = content?.attachments.filter((a) => !a.inline) ?? []
  const images = content?.attachments.filter((a) => a.inline) ?? []

  return (
    <section className={modal ? '' : 'mt-5 rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'}>
      {!modal && (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <span className="text-xs text-stone-400">{open ? '▾' : '▸'}</span>
            <span className="text-xs font-medium text-stone-600 dark:text-stone-300">✉ Correo original</span>
          </button>
          {content && (
            <button className="rounded-md px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950" onClick={() => setBig(true)}>
              ⤢ Ver en grande
            </button>
          )}
        </div>
      )}
      {big && <EmailModal task={task} members={members} schedule={schedule} onClose={() => setBig(false)} />}
      {(open || modal) && (
        <div className={modal ? 'space-y-3' : 'space-y-3 border-t border-stone-200 px-3 py-3 dark:border-stone-800'}>
          {last && (
            <div
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                last.status === 'enviado'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : last.status === 'error'
                    ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              {last.status === 'pendiente' && schedule ? <ForwardCountdown schedule={schedule} name={memberName(members, last.member_id)} sender={last.sender_member_id} /> : FORWARD_TEXT[last.status]}
              {last.status === 'enviado' && ` a ${memberName(members, last.member_id) ?? 'la persona asignada'}${last.sent_at ? ` el ${relativeShort(last.sent_at)}` : ''}, con todos sus adjuntos.`}
              {last.status !== 'enviado' && last.status !== 'pendiente' && last.detail ? `: ${last.detail}.` : ''}
              {last.status === 'enviado' && last.detail ? ` ${last.detail}.` : ''}
              {isAdmin && (last.status === 'error' || last.status === 'enviado' || last.status === 'omitido') && (
                <button className={`${btn} ml-2 px-2 py-0.5 text-[11px]`} onClick={retry}>
                  Reenviar de nuevo
                </button>
              )}
            </div>
          )}
          {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
          {!content && <div className="text-xs text-stone-500">El texto del correo aparece aquí cuando el script lo procese.</div>}
          {content && (
            <>
              <div className="space-y-0.5 text-xs text-stone-600 dark:text-stone-300">
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{content.subject}</div>
                <div>
                  <span className="text-stone-400">De:</span> {content.from_name ? `${content.from_name} <${content.from_email}>` : content.from_email}
                </div>
                {content.sent_at && (
                  <div>
                    <span className="text-stone-400">Fecha:</span> {relativeShort(content.sent_at)}
                  </div>
                )}
                {content.to_list && (
                  <div className="truncate" title={content.to_list}>
                    <span className="text-stone-400">Para:</span> {content.to_list}
                  </div>
                )}
                {content.cc_list && (
                  <div className="truncate" title={content.cc_list}>
                    <span className="text-stone-400">CC:</span> {content.cc_list}
                  </div>
                )}
              </div>
              {(files.length > 0 || images.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {files.map((a, i) => (
                    <span key={i} className="rounded border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600 dark:border-stone-700 dark:text-stone-300" title={a.type}>
                      📎 {a.name} · {size(a.size)}
                    </span>
                  ))}
                  {images.length > 0 && (
                    <span className="rounded border border-stone-200 px-2 py-0.5 text-[11px] text-stone-500 dark:border-stone-700">
                      🖼 {images.length} {images.length === 1 ? 'imagen' : 'imágenes'} en el cuerpo
                    </span>
                  )}
                  <span className="basis-full text-[11px] text-stone-400">Los archivos llegaron en el correo "Asignación TeamFlow".</span>
                </div>
              )}
              {content.body_text ? <Body text={content.body_text} full={modal} /> : <div className="text-xs text-stone-500">El correo no tiene texto.</div>}
            </>
          )}
        </div>
      )}
    </section>
  )
}

// Ventana grande con todo el correo: para leerlo completo sin abrir el detalle.
export function EmailModal({ task, members, schedule, onClose }: { task: Task; members: Member[]; schedule?: ForwardSchedule; onClose: () => void }) {
  const { isAdmin, member } = useAuth()
  const [thread, setThread] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Solo el gerente tiene el correo en su Gmail.
  useEffect(() => {
    if (!isAdmin || !task.email_id) return
    supabase
      .from('emails')
      .select('gmail_thread_id')
      .eq('id', task.email_id)
      .maybeSingle()
      .then(({ data }) => setThread(data?.gmail_thread_id ?? null))
  }, [isAdmin, task.email_id])
  const gmail = gmailThreadUrl(thread, member?.email)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 py-6 sm:px-6" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Correo de ${task.title}`}
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-stone-200 bg-white px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="min-w-0">
            <div className="text-xs text-stone-500 dark:text-stone-400">✉ Correo de la tarea</div>
            <div className="truncate font-medium">{task.title}</div>
          </div>
          <div className="flex items-center gap-2">
            {gmail && (
              <a className={btn} href={gmail} target="_blank" rel="noreferrer">
                Abrir en Gmail ↗
              </a>
            )}
            <button className={btn} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <TaskEmail task={task} members={members} schedule={schedule} variant="modal" />
        </div>
      </div>
    </div>
  )
}
