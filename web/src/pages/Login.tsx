import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { googleLoginEnabled } from '../lib/supabase'
import { Card, btn, btnPrimary, input } from '../components/ui'
import { ThemeToggle } from '../components/ThemeToggle'
import { TeamflowLogo } from '../components/TeamflowLogo'

export function Login() {
  const { signInWithPassword, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe tu correo de la empresa.')
    if (!password) return setError('Escribe tu contraseña.')
    setBusy(true)
    setError(await signInWithPassword(email, password))
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ThemeToggle className="fixed right-4 top-4" />
      <Card className="w-full max-w-sm p-6">
        <div className="text-center">
          <div className="flex justify-center"><TeamflowLogo className="h-10" /></div>
          <div className="mt-1 text-[10px] tracking-[0.25em] text-stone-400">HERRAMIENTAS DIMASSI</div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Prioridades del día y tareas del equipo, a partir de tus correos.
          </p>
        </div>
        <form className="mt-6 space-y-3" onSubmit={submit} noValidate>
          <input
            className={`${input} w-full`}
            type="email"
            autoComplete="username"
            placeholder="nombre@dimassicorp.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
            aria-label="Correo"
          />
          <input
            className={`${input} w-full`}
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            aria-label="Contraseña"
          />
          {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
          <button className={`${btnPrimary} w-full py-2`} type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        {googleLoginEnabled && (
          <button className={`${btn} mt-2 w-full py-2`} onClick={signInWithGoogle}>
            Entrar con Google
          </button>
        )}
        <p className="mt-4 text-center text-xs text-stone-400">
          ¿Sin acceso u olvidaste tu contraseña? Pídeselo al administrador.
        </p>
      </Card>
    </div>
  )
}

// Se usa al entrar con una contraseña temporal y también desde el menú.
export function ChangePassword({ forced, onDone }: { forced: boolean; onDone?: () => void }) {
  const { changePassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('Usa al menos 8 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    const err = await changePassword(password)
    setBusy(false)
    if (err) return setError(err)
    onDone?.()
  }

  const form = (
    <Card className="w-full max-w-sm p-6">
      <div className="text-lg font-medium">{forced ? 'Crea tu contraseña' : 'Cambiar contraseña'}</div>
      {forced && (
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Entraste con una contraseña temporal. Elige una nueva para seguir.
        </p>
      )}
      <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
        <input
          className={`${input} w-full`}
          type="password"
          autoComplete="new-password"
          placeholder="Nueva contraseña (mín. 8 caracteres)"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          aria-label="Nueva contraseña"
        />
        <input
          className={`${input} w-full`}
          type="password"
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
          aria-label="Repetir contraseña"
        />
        {error && <div className="text-[13px] text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex gap-2">
          <button className={btnPrimary} type="submit" disabled={busy}>
            Guardar
          </button>
          <button className={btn} type="button" onClick={forced ? signOut : onDone} disabled={busy}>
            {forced ? 'Salir' : 'Cancelar'}
          </button>
        </div>
      </form>
    </Card>
  )

  return forced ? <div className="flex min-h-screen items-center justify-center px-4">{form}</div> : form
}

export function NoAccess({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="text-lg font-medium">Tu cuenta aún no está en el equipo</div>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Entraste como <span className="font-medium text-stone-700 dark:text-stone-200">{email}</span>. Pide al
          administrador que te agregue en la página Equipo.
        </p>
        <button className={`${btn} mt-6 w-full py-2`} onClick={onSignOut}>
          Usar otra cuenta
        </button>
      </Card>
    </div>
  )
}
