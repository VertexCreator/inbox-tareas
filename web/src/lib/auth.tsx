import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, workspaceDomain } from './supabase'

interface CurrentMember {
  id: string
  name: string
  email: string
  is_admin: boolean
}

interface AuthState {
  session: Session | null
  member: CurrentMember | null
  isAdmin: boolean
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<CurrentMember | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Con sesión, buscamos al usuario en el equipo. Si no está, la RLS no le deja ver nada.
  useEffect(() => {
    const email = session?.user.email
    if (!email) {
      setMember(null)
      return
    }
    setLoading(true)
    supabase
      .from('team_members')
      .select('id, name, email, is_admin')
      .ilike('email', email)
      .eq('active', true)
      .maybeSingle()
      .then(({ data }) => {
        setMember(data)
        setLoading(false)
      })
  }, [session?.user.email])

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account', ...(workspaceDomain ? { hd: workspaceDomain } : {}) },
      },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setMember(null)
  }

  return (
    <AuthContext.Provider
      value={{ session, member, isAdmin: member?.is_admin ?? false, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
