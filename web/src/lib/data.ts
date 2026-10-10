import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Member, Task } from './types'

// Tareas y equipo juntos: la carga de cada miembro cambia con cada tarea.
// Se recarga sola cuando alguien del equipo cambia una tarea (tiempo real).
export function useBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [t, m] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('member_load').select('*').order('name'),
    ])
    const err = t.error ?? m.error
    setError(err ? err.message : null)
    if (t.data) setTasks(t.data as Task[])
    if (m.data) setMembers(m.data as Member[])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])

  return { tasks, members, loading, error, reload }
}

export async function approveTask(taskId: string) {
  const { error } = await supabase.rpc('approve_task', { p_task_id: taskId })
  if (error) throw new Error(error.message)
}

export async function reassignTask(taskId: string, memberId: string, keyword?: string) {
  const { error } = await supabase.rpc('reassign_task', {
    p_task_id: taskId,
    p_member_id: memberId,
    p_keyword: keyword?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function updateTaskStatus(taskId: string, status: Task['status']) {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId)
  if (error) throw new Error(error.message)
}

export function memberName(members: Member[], id: string | null) {
  if (!id) return null
  return members.find((m) => m.id === id)?.name ?? null
}

export function allSpecialties(members: Member[]) {
  return [...new Set(members.flatMap((m) => m.specialties))].sort()
}

export function gmailThreadUrl(threadId: string | null, accountEmail?: string) {
  if (!threadId) return null
  const auth = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : ''
  return `https://mail.google.com/mail/${auth}#all/${threadId}`
}
