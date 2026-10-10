import { useAuth } from '../lib/auth'
import { Card, btn, btnPrimary } from '../components/ui'

export function Login() {
  const { signIn } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="text-lg font-medium">Inbox → Tareas</div>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Prioridades del día y tareas del equipo, a partir de tus correos.
        </p>
        <button className={`${btnPrimary} mt-6 w-full py-2`} onClick={signIn}>
          Entrar con Google
        </button>
        <p className="mt-3 text-xs text-stone-400">Usa tu cuenta de Google Workspace de la empresa.</p>
      </Card>
    </div>
  )
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
