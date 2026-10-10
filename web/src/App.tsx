import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { Login, NoAccess } from './pages/Login'
import { Hoy } from './pages/Hoy'
import { Tablero } from './pages/Tablero'
import { Equipo } from './pages/Equipo'
import { Reglas } from './pages/Reglas'

function Gate() {
  const { session, member, isAdmin, loading, signOut } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-stone-400">Cargando…</div>
  }
  if (!session) return <Login />
  if (!member) return <NoAccess email={session.user.email ?? ''} onSignOut={signOut} />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Hoy />} />
        <Route path="tablero" element={<Tablero />} />
        <Route path="equipo" element={<Equipo />} />
        {isAdmin && <Route path="reglas" element={<Reglas />} />}
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
