import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUndo } from '../lib/undo'
import plantilla from '../content/MiCorreo.gs?raw'
import { EmailTaskModal, type ExistingItem } from '../components/EmailTaskModal'
import { SummaryBoard } from '../components/SummaryBoard'
import { Card, btn, btnPrimary, relativeDate } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useBoard } from '../lib/data'
import type { Level } from '../lib/summary'
import { supabase, uniqueChannel } from '../lib/supabase'
import type { AnalysisRequest, Email, Priority } from '../lib/types'

// Mi correo: cada persona del equipo conecta su Gmail con un script personal y ve aquí su bandeja,
// clasificada por reglas. Si el gerente la habilitó, puede pedir al agente que analice un correo.

interface Connection {
  token: string
  last_ingest_at: string | null
  last_forward_check: string | null
  last_count: number
  last_junk: number
}

async function ok(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p
  if (error) throw new Error(error.message)
}

export function MiCorreo() {
  const { member } = useAuth()
  const { members, brands, stickers } = useBoard()
  const me = members.find((m) => m.id === member?.id)
  const [conn, setConn] = useState<Connection | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [quiet, setQuiet] = useState<Email[]>([])
  const [existing, setExisting] = useState<Record<string, ExistingItem[]>>({})
  const [analyses, setAnalyses] = useState<AnalysisRequest[]>([])
  const [modal, setModal] = useState<{ email: Email; fromAnalysis?: AnalysisRequest } | null>(null)
  const [viewing, setViewing] = useState<AnalysisRequest | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(10)

  const loadConn = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_gmail_connection')
    if (error) setError(error.message)
    else setConn(data as Connection)
  }, [])

  const load = useCallback(async () => {
    if (!member) return
    const [e, q, a, s] = await Promise.all([
      supabase.from('emails').select('*').eq('owner_member_id', member.id).eq('status', 'pendiente').neq('priority', 'ninguna').order('received_at', { ascending: false }).limit(200),
      supabase.from('emails').select('*').eq('owner_member_id', member.id).eq('status', 'pendiente').eq('priority', 'ninguna').order('received_at', { ascending: false }).limit(30),
      supabase.from('email_analysis_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('settings').select('ai_analysis_daily_limit').eq('id', 1).maybeSingle(),
    ])
    const list = (e.data ?? []) as Email[]
    setEmails(list)
    setQuiet((q.data ?? []) as Email[])
    setAnalyses((a.data ?? []) as AnalysisRequest[])
    if (s.data?.ai_analysis_daily_limit) setLimit(s.data.ai_analysis_daily_limit)
    const ids = list.map((x) => x.id)
    if (ids.length) {
      const { data: items } = await supabase.from('list_items').select('id, title, status, task_id, email_id').in('email_id', ids).neq('status', 'descartado')
      const map: Record<string, ExistingItem[]> = {}
      for (const it of (items ?? []) as (ExistingItem & { email_id: string })[]) (map[it.email_id] ??= []).push(it)
      setExisting(map)
    } else setExisting({})
  }, [member])

  useEffect(() => {
    loadConn()
    load()
    const channel = supabase
      .channel(uniqueChannel('mi-correo'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_analysis_requests' }, () => load())
      .subscribe()
    // El estado del script se consulta cada minuto (la tabla de buzones no se transmite en tiempo real).
    const t = setInterval(loadConn, 60_000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(t)
    }
  }, [load, loadConn])

  const connected = !!conn?.last_ingest_at
  const stale = connected && Date.now() - new Date(conn!.last_ingest_at!).getTime() > 60 * 60_000
  const code = useMemo(
    () =>
      conn
        ? plantilla
            .replace('__SUPABASE_URL__', import.meta.env.VITE_SUPABASE_URL)
            .replace('__SUPABASE_KEY__', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
            .replace('__TEAMFLOW_TOKEN__', conn.token)
            .replace('__NOMBRE__', member?.name ?? '')
        : '',
    [conn, member?.name],
  )
  const analysisOf = (emailId: string) => analyses.find((a) => a.email_id === emailId && a.status !== 'cancelado')
  const usedToday = analyses.filter((a) => new Date(a.created_at).toDateString() === new Date().toDateString() && a.status !== 'cancelado').length
  const canAnalyze = !!me?.ai_analysis_allowed

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    load()
  }
  const { track } = useUndo()
  const move = async (e: Email, to: Level | 'ninguna') => {
    const prev = e.priority
    await run(() => supabase.rpc('set_my_email_priority', { p_email_id: e.id, p_priority: to }))
    track(`Moviste «${e.subject ?? 'el correo'}» a ${to === 'ninguna' ? 'sin prioridad' : to}`, () => ok(supabase.rpc('set_my_email_priority', { p_email_id: e.id, p_priority: prev })), { after: load })
  }
  const done = async (id: string) => {
    await run(() => supabase.rpc('mark_my_email', { p_email_id: id, p_status: 'respondido' }))
    const e = emails.find((x) => x.id === id) ?? quiet.find((x) => x.id === id)
    track(`Marcaste como listo el correo «${e?.subject ?? ''}»`, () => ok(supabase.rpc('mark_my_email', { p_email_id: id, p_status: 'pendiente' })), { after: load })
  }
  const ask = (e: Email, wantsReply: boolean) => run(() => supabase.rpc('request_email_analysis', { p_email_id: e.id, p_wants_reply: wantsReply }))

  if (!member) return null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Mi correo</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Tu bandeja de Gmail ordenada por prioridad. Solo tú la ves. Convierte un correo en tarea con <b>Crear tarea</b>.
          </p>
        </div>
        {connected && (
          <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${stale ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
            {stale ? '⚠ Tu script no envía correos desde' : '✓ Gmail conectado · última revisión'} {relativeDate(conn!.last_ingest_at!)}
            <button className="underline" onClick={() => setShowSetup((v) => !v)}>
              {showSetup ? 'Ocultar el script' : 'Ver el script'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>}

      {conn && (!connected || showSetup) && <Setup code={code} connected={connected} onRegenerate={() => run(() => supabase.rpc('regenerate_my_gmail_token')).then(loadConn)} />}

      {connected && (
        <>
          {canAnalyze && (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              ✦ Puedes pedir al agente que analice un correo ({usedToday}/{limit} hoy). Lo procesa el agente del gerente en horario laboral, en 30 minutos o menos.
            </p>
          )}
          <SummaryBoard
            title="✦ Tus correos"
            run={null}
            prevRun={null}
            todayCount={emails.filter((e) => e.received_at && new Date(e.received_at).toDateString() === new Date().toDateString()).length}
            emails={emails}
            brands={brands}
            account={member.email}
            created={Object.keys(existing)}
            onDone={done}
            onPending={(e) => setModal({ email: e })}
            onMove={(e, to) => move(e, to)}
            renderExtra={(e) => <AnalysisButton request={analysisOf(e.id)} allowed={canAnalyze} onAsk={(r) => ask(e, r)} onView={(a) => setViewing(a)} />}
          />
          {quiet.length > 0 && <QuietList emails={quiet} onMove={move} onDone={done} />}
        </>
      )}

      {viewing && (
        <AnalysisModal
          request={viewing}
          email={emails.find((e) => e.id === viewing.email_id) ?? quiet.find((e) => e.id === viewing.email_id)}
          onClose={() => setViewing(null)}
          onApplyPriority={(e, p) => move(e, p).then(() => setViewing(null))}
          onCreate={(e) => {
            setModal({ email: e, fromAnalysis: viewing })
            setViewing(null)
          }}
        />
      )}

      {modal && (
        <EmailTaskModal
          email={modal.email}
          members={members}
          brands={brands}
          stickers={stickers}
          existing={existing[modal.email.id] ?? []}
          prefill={modal.fromAnalysis?.result?.pendiente ? toPrefill(modal.fromAnalysis, brands) : undefined}
          onClose={() => setModal(null)}
          onCreated={load}
        />
      )}
    </div>
  )
}

function toPrefill(a: AnalysisRequest, brands: { id: string; name: string }[]) {
  const p = a.result!.pendiente!
  const names = (p.brands ?? a.result?.brands ?? []).map((n) => n.toLowerCase())
  return {
    title: p.title,
    description: [p.notes, a.result?.summary].filter(Boolean).join('\n'),
    brand_ids: brands.filter((b) => names.includes(b.name.toLowerCase())).map((b) => b.id),
    priority: p.priority,
    due_date: p.due_date ?? null,
  }
}

function Setup({ code, connected, onRegenerate }: { code: string; connected: boolean; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-medium">{connected ? 'Tu script de Gmail' : 'Conecta tu Gmail (una sola vez, 3 minutos)'}</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Un script de Google, en tu propia cuenta, revisa tu correo cada 10 minutos y lo trae aquí ya ordenado. No usa IA y no le cuesta nada a nadie.
        </p>
      </div>
      <ol className="space-y-2 text-sm">
        <li>
          <b>1.</b> Copia el script:{' '}
          <button className={btnPrimary} onClick={copy}>
            {copied ? '✓ Copiado' : 'Copiar el script'}
          </button>
        </li>
        <li>
          <b>2.</b> Abre{' '}
          <a className="font-medium text-indigo-600 underline dark:text-indigo-400" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">
            script.google.com → Proyecto nuevo ↗
          </a>{' '}
          con tu correo de Dimassi. Borra lo que trae, pega el script y guarda (⌘S o Ctrl+S).
        </li>
        <li>
          <b>3.</b> Arriba, elige la función <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">instalar</code> y pulsa <b>Ejecutar</b>. Google pide permisos: <b>Revisar permisos</b> → tu cuenta → si dice "Google no verificó esta app", <b>Configuración avanzada → Ir a…</b> → <b>Permitir</b>. Es tu propio script: lee tu Gmail y envía los reenvíos de las tareas que asignes.
        </li>
        <li>
          <b>4.</b> Si después de aceptar no aparece "Revisados …" en el registro, pulsa <b>Ejecutar</b> otra vez. {connected ? '' : 'Esta página se actualiza sola cuando llegue tu primer envío.'}
        </li>
      </ol>
      {!connected && <div className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">⏳ Esperando el primer envío de tu script…</div>}
      <details className="text-xs">
        <summary className="cursor-pointer text-stone-500">Ver el código</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-stone-950 p-3 text-[11px] leading-relaxed text-stone-200">{code}</pre>
      </details>
      <div className="border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
        El script lleva una clave personal: no lo compartas.{' '}
        {confirm ? (
          <>
            ¿Generar una clave nueva? El script que ya instalaste dejará de funcionar hasta que pegues el nuevo.{' '}
            <button className={`${btn} px-2 py-0.5 text-xs`} onClick={() => { setConfirm(false); onRegenerate() }}>
              Sí, generar
            </button>{' '}
            <button className={`${btn} px-2 py-0.5 text-xs`} onClick={() => setConfirm(false)}>
              No
            </button>
          </>
        ) : (
          <button className="underline" onClick={() => setConfirm(true)}>
            Generar una clave nueva
          </button>
        )}
      </div>
    </Card>
  )
}

function AnalysisButton({ request, allowed, onAsk, onView }: { request?: AnalysisRequest; allowed: boolean; onAsk: (wantsReply: boolean) => void; onView: (a: AnalysisRequest) => void }) {
  const [choosing, setChoosing] = useState(false)
  if (request?.status === 'listo') {
    return (
      <button className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300" onClick={() => onView(request)}>
        ✦ Ver análisis
      </button>
    )
  }
  if (request?.status === 'pendiente') {
    return (
      <span className="rounded px-1.5 py-0.5 text-[11px] text-violet-600 dark:text-violet-300" title="El agente del gerente lo analiza en su próxima pasada (cada 30 minutos en horario laboral)">
        ✦ En cola del agente…
      </span>
    )
  }
  if (!allowed) return null
  if (choosing) {
    return (
      <span className="flex items-center gap-1 text-[11px]">
        <button className="rounded bg-violet-600 px-1.5 py-0.5 font-medium text-white" onClick={() => { setChoosing(false); onAsk(false) }}>
          Analizar
        </button>
        <button className="rounded bg-violet-600 px-1.5 py-0.5 font-medium text-white" onClick={() => { setChoosing(false); onAsk(true) }}>
          + respuesta
        </button>
        <button className="px-1 text-stone-400" onClick={() => setChoosing(false)} aria-label="Cancelar">
          ×
        </button>
      </span>
    )
  }
  return (
    <button
      className="rounded px-1.5 py-0.5 text-[11px] text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950"
      onClick={() => setChoosing(true)}
      title="Este correo lo analizará el agente del gerente"
    >
      ✦ Pedir análisis
    </button>
  )
}

function AnalysisModal({
  request: a,
  email,
  onClose,
  onApplyPriority,
  onCreate,
}: {
  request: AnalysisRequest
  email?: Email
  onClose: () => void
  onApplyPriority: (e: Email, p: Priority | 'ninguna') => void
  onCreate: (e: Email) => void
}) {
  const [copied, setCopied] = useState(false)
  const r = a.result ?? {}
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 py-8" onClick={onClose}>
      <div className="w-full max-w-xl space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Análisis del agente">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-violet-600 dark:text-violet-300">✦ Análisis del agente</div>
            <div className="font-medium">{email?.subject ?? 'Correo'}</div>
          </div>
          <button className={btn} onClick={onClose}>
            Cerrar
          </button>
        </div>
        {r.summary && <p className="text-sm">{r.summary}</p>}
        {r.priority && email && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Prioridad sugerida: <b>{r.priority === 'ninguna' ? 'sin prioridad' : r.priority}</b>
            {r.reason && <span className="text-xs text-stone-500">· {r.reason}</span>}
            {r.priority !== email.priority && (
              <button className={`${btn} px-2 py-0.5 text-xs`} onClick={() => onApplyPriority(email, r.priority!)}>
                Aplicar
              </button>
            )}
          </div>
        )}
        {r.pendiente && email && (
          <div className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
            <div className="text-xs text-stone-500">Tarea propuesta</div>
            <div className="font-medium">{r.pendiente.title}</div>
            {r.pendiente.notes && <div className="text-xs text-stone-600 dark:text-stone-300">{r.pendiente.notes}</div>}
            <button className={`${btnPrimary} mt-2`} onClick={() => onCreate(email)}>
              Crear tarea con esto
            </button>
          </div>
        )}
        {r.reply && (
          <div className="space-y-1.5">
            <div className="text-xs text-stone-500">Respuesta sugerida (cópiala en Gmail y ajústala)</div>
            <div className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800">{r.reply}</div>
            <button
              className={`${btn} px-2 py-1 text-xs`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.reply ?? '')
                  setCopied(true)
                } catch {
                  setCopied(false)
                }
              }}
            >
              {copied ? '✓ Copiada' : 'Copiar respuesta'}
            </button>
          </div>
        )}
        {!r.summary && !r.pendiente && !r.reply && <p className="text-sm text-stone-500">El agente no devolvió detalles para este correo.</p>}
      </div>
    </div>
  )
}

// Correos que las reglas dejaron sin prioridad: por si alguno sí importaba.
function QuietList({ emails, onMove, onDone }: { emails: Email[]; onMove: (e: Email, to: Level) => void; onDone: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-3">
      <button className="flex w-full items-center gap-2 text-left text-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="text-xs text-stone-400">{open ? '▾' : '▸'}</span>
        <span className="font-medium">Sin prioridad</span>
        <span className="text-xs text-stone-500">{emails.length} · informativos, en copia o automáticos</span>
      </button>
      {open && (
        <div className="mt-2 divide-y divide-stone-100 dark:divide-stone-800">
          {emails.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate">{e.subject}</div>
                <div className="truncate text-xs text-stone-500">{e.from_name || e.from_email}</div>
              </div>
              {(['P1', 'P2', 'P3'] as Level[]).map((l) => (
                <button key={l} className="rounded px-1.5 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => onMove(e, l)}>
                  →{l}
                </button>
              ))}
              <button className="rounded px-1.5 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400" onClick={() => onDone(e.id)}>
                ✓ Listo
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
