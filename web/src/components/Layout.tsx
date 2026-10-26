import { useEffect, useState } from 'react'
import { UndoButton } from '../lib/undo'
import { ForwardToasts } from './ForwardStatus'
import { supabase, uniqueChannel } from '../lib/supabase'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ChangePassword } from '../pages/Login'
import { btn } from './ui'
import { ThemeToggle } from './ThemeToggle'
import { TeamflowLogo } from './TeamflowLogo'
import { QuickAdd } from './QuickAdd'
import { ErrorBoundary } from './ErrorBoundary'

export function Layout() {
  const { member, isAdmin, perms, can, signOut } = useAuth()
  // Guarda la dirección del dashboard para el enlace "Ver en TeamFlow" de los correos de asignación.
  useEffect(() => {
    if (isAdmin && window.location.protocol === 'https:') supabase.rpc('remember_dashboard_url', { p_url: window.location.origin }).then(() => {})
  }, [isAdmin])
  const [changingPassword, setChangingPassword] = useState(false)
  const [adding, setAdding] = useState(false)
  const location = useLocation()
  // Contador para quien reparte: lo que está por planificar y espera que lo asigne.
  const canPlan = can('repartir')
  const [toAssign, setToAssign] = useState(0)
  useEffect(() => {
    if (!canPlan) return
    const count = () =>
      supabase
        .from('list_items')
        .select('id', { count: 'exact', head: true })
        .in('status', ['sin_planificar', 'planificando'])
        .is('task_id', null)
        .then(({ count }) => setToAssign(count ?? 0))
    count()
    const channel = supabase
      .channel(uniqueChannel('nav-por-asignar'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => count())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [canPlan])
  const links = [
    { to: '/', label: 'Hoy' },
    { to: '/mis-tareas', label: 'Mis tareas' },
    { to: '/iniciativas', label: 'Iniciativas', badge: canPlan ? toAssign : 0 },
    ...(!isAdmin && can('mi_correo') ? [{ to: '/mi-correo', label: 'Mi correo' }] : []),
    { to: '/equipo', label: 'Equipo' },
    ...(isAdmin ? [{ to: '/configuracion', label: 'Configuración' }] : []),
  ]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" aria-label="Teamflow, ir a Hoy" className="shrink-0">
            <TeamflowLogo className="h-7" />
          </NavLink>
          <nav className="flex gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm ${
                    isActive
                      ? 'bg-stone-200 font-medium dark:bg-stone-800'
                      : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900'
                  }`
                }
              >
                {l.label}
                {'badge' in l && l.badge ? (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white tabular-nums" title={`${l.badge} por asignar`} aria-label={`${l.badge} por asignar`}>
                    {l.badge}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
            <UndoButton />
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 active:scale-95"
              onClick={() => setAdding(true)}
              title="Agregar una tarea a mano"
            >
              + Nueva tarea
            </button>
            <span className="hidden sm:inline">
              {member?.name}
              {isAdmin ? ' · admin' : perms?.role ? ` · ${perms.role}` : ''}
            </span>
            <NavLink
              to="/ayuda"
              title="Manual de uso y preguntas frecuentes"
              className={({ isActive }) =>
                `inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition active:scale-95 ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900'
                }`
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
              Ayuda
            </NavLink>
            <ThemeToggle />
            <button className={btn} onClick={() => setChangingPassword((v) => !v)}>
              Contraseña
            </button>
            <button className={btn} onClick={signOut}>
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {changingPassword && (
          <div className="mb-6 flex justify-end">
            <ChangePassword forced={false} onDone={() => setChangingPassword(false)} />
          </div>
        )}
        <ErrorBoundary key={location.pathname} label="esta página">
          <Outlet />
        </ErrorBoundary>
      </main>
      <ForwardToasts />
      {adding && (
        <ErrorBoundary label="la ventana Nueva tarea" onClose={() => setAdding(false)}>
          <QuickAdd onClose={() => setAdding(false)} />
        </ErrorBoundary>
      )}
    </div>
  )
}
