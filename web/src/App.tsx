import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { ChangePassword, Login, NoAccess } from './pages/Login'
import { Hoy } from './pages/Hoy'
import { Tablero } from './pages/Tablero'
import { Equipo } from './pages/Equipo'
import { Configuracion } from './pages/Configuracion'
import { Listas } from './pages/Listas'
import { Tickets } from './pages/Tickets'
import { Ayuda } from './pages/Ayuda'

function Gate() {
  const { session, member, isAdmin, loading, mustChangePassword, signOut } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-stone-400">Cargando…</div>
  }
  if (!session) return <Login />
  if (mustChangePassword) return <ChangePassword forced />
  if (!member) return <NoAccess email={session.user.email ?? ''} onSignOut={signOut} />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Hoy />} />
        <Route path="listas" element={<Listas />} />
        <Route path="tablero" element={<Tablero />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="ayuda" element={<Ayuda />} />
        <Route path="equipo" element={<Equipo />} />
        {isAdmin && <Route path="configuracion" element={<Configuracion />} />}
        <Route path="reglas" element={<Navigate to="/configuracion" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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
