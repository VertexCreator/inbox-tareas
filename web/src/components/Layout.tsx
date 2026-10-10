import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ChangePassword } from '../pages/Login'
import { btn } from './ui'

export function Layout() {
  const { member, isAdmin, signOut } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  const links = [
    { to: '/', label: 'Hoy' },
    { to: '/tablero', label: 'Tablero' },
    { to: '/equipo', label: 'Equipo' },
    ...(isAdmin ? [{ to: '/reglas', label: 'Reglas' }] : []),
  ]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="font-medium">Inbox → Tareas</div>
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
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
            <span className="hidden sm:inline">
              {member?.name}
              {isAdmin ? ' · admin' : ''}
            </span>
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
        <Outlet />
      </main>
    </div>
  )
}
