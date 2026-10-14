import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { UndoProvider } from './lib/undo'
import { ChangePassword, Login, NoAccess } from './pages/Login'
import { Hoy } from './pages/Hoy'
import { Equipo } from './pages/Equipo'
import { Configuracion } from './pages/Configuracion'
import { MisTareas } from './pages/MisTareas'
import { Iniciativas } from './pages/Iniciativas'
import { MiCorreo } from './pages/MiCorreo'
import { Ayuda } from './pages/Ayuda'

// Pestañas que cambiaron de nombre (Tickets → Mis tareas; Listas y Tablero → Iniciativas): los enlaces viejos
// (por ejemplo, en correos ya enviados) siguen funcionando.
function Redirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function Gate() {
  const { session, member, isAdmin, loading, mustChangePassword, signOut } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-stone-400">Cargando…</div>
  }
  if (!session) return <Login />
  if (mustChangePassword) return <ChangePassword forced />
  if (!member) return <NoAccess email={session.user.email ?? ''} onSignOut={signOut} />

  return (
    <UndoProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Hoy />} />
          <Route path="iniciativas" element={<Iniciativas />} />
          <Route path="listas" element={<Redirect to="/iniciativas" />} />
          <Route path="tablero" element={<Redirect to="/iniciativas" />} />
          <Route path="mis-tareas" element={<MisTareas />} />
          <Route path="mi-correo" element={<MiCorreo />} />
          <Route path="tickets" element={<Redirect to="/mis-tareas" />} />
          <Route path="ayuda" element={<Ayuda />} />
          <Route path="equipo" element={<Equipo />} />
          {isAdmin && <Route path="configuracion" element={<Configuracion />} />}
          <Route path="reglas" element={<Navigate to="/configuracion" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </UndoProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
