import { useCallback, useEffect, useState } from 'react'
import { supabase, uniqueChannel } from './supabase'
import type { Brand, Member, Sticker, Subtask, Task } from './types'

// Tareas, subtareas y equipo juntos: la carga de cada miembro cambia con cada tarea.
// Se recarga sola cuando alguien del equipo cambia una tarea o subtarea (tiempo real).
export function useBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [t, m, st, b, sk] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('member_load').select('*').order('name'),
      supabase.from('subtasks').select('*').order('position'),
      supabase.from('brands').select('*').order('name'),
      supabase.from('status_stickers').select('*').order('position'),
    ])
    if (b.data) setBrands(b.data as Brand[])
    if (sk.data) setStickers(sk.data as Sticker[])
    const err = t.error ?? m.error ?? st.error ?? b.error ?? sk.error
    setError(err ? err.message : null)
    if (t.data) setTasks(t.data as Task[])
    if (st.data) setSubtasks(st.data as Subtask[])
    if (m.data) setMembers(m.data as Member[])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const channel = supabase
      .channel(uniqueChannel('tasks-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'status_stickers' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])

  return { tasks, subtasks, members, brands, stickers, loading, error, reload }
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

export async function updateSubtask(id: string, patch: Partial<Pick<Subtask, 'done' | 'due_date' | 'assignee_id' | 'title'>>) {
  const { error } = await supabase.from('subtasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'due_date' | 'priority' | 'title' | 'description' | 'sticker_id' | 'observation' | 'brand_id' | 'assignee_id'>>,
) {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isOverdue(due: string | null, done: boolean) {
  return !done && !!due && due < todayISO()
}

export function shortDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

// Etiqueta para elegir responsable: nombre · nivel en la habilidad · carga.
export function memberOption(m: Member, skill: string | null) {
  const lvl = skill ? m.skill_levels?.[skill] : undefined
  const level = lvl ? ` · ${['', 'básico', 'intermedio', 'avanzado'][lvl]}` : ''
  return `${m.name}${level} · ${Math.round(m.load_ratio * 100)}%`
}

export async function addSubtask(taskId: string, title: string, position: number, assigneeId: string | null = null, due: string | null = null) {
  const { error } = await supabase
    .from('subtasks')
    .insert({ task_id: taskId, title: title.trim(), position, assignee_id: assigneeId, due_date: due })
  if (error) throw new Error(error.message)
}

export async function deleteSubtask(id: string) {
  const { error } = await supabase.from('subtasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Progreso de un conjunto de iniciativas: terminadas sobre las que no están canceladas.
export function progress(tasks: Task[], stickers: Sticker[]) {
  const cat = (t: Task) => stickers.find((s) => s.id === t.sticker_id)?.category
  const live = tasks.filter((t) => cat(t) !== 'cancelado')
  const done = live.filter((t) => cat(t) === 'terminado').length
  return { done, total: live.length, pct: live.length ? Math.round((done / live.length) * 100) : 0 }
}

export function relativeShort(iso: string) {
  return new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
