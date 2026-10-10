export type Priority = 'P1' | 'P2' | 'P3'
export type TaskStatus = 'por_hacer' | 'en_curso' | 'hecho'
export type AssignmentMode = 'auto' | 'sugerida' | 'aprobada' | 'corregida' | 'manual'

// Fila de la vista member_load: el miembro más su carga actual.
export interface Member {
  id: string
  name: string
  email: string
  specialties: string[]
  capacity_points: number
  is_admin: boolean
  active: boolean
  available: boolean
  open_points: number
  open_tasks: number
  load_ratio: number
}

export interface Task {
  id: string
  email_id: string | null
  title: string
  description: string | null
  specialty: string | null
  effort_points: number
  priority: Priority
  due_date: string | null
  status: TaskStatus
  assignee_id: string | null
  suggested_assignee_id: string | null
  needs_approval: boolean
  assignment_mode: AssignmentMode | null
  assignment_reason: string | null
  source: 'correo' | 'manual'
  created_at: string
  updated_at: string
}

export interface Email {
  id: string
  gmail_message_id: string
  gmail_thread_id: string | null
  from_name: string | null
  from_email: string | null
  subject: string | null
  summary: string | null
  category: string
  priority: Priority | 'ninguna'
  needs_reply: boolean
  draft_created: boolean
  reply_by: string | null
  status: 'pendiente' | 'respondido' | 'archivado'
  received_at: string | null
}

export interface Rule {
  id: string
  keyword: string
  member_id: string
  active: boolean
  created_at: string
}

export interface LogEntry {
  id: number
  task_id: string
  member_id: string | null
  previous_member_id: string | null
  mode: string
  reason: string | null
  actor: string
  created_at: string
}

export interface AgentRun {
  id: number
  ran_at: string
  slot: string | null
  emails_processed: number
  tasks_created: number
  summary: string | null
}

export interface Settings {
  id: number
  autonomy: 'sugerencia' | 'automatico'
  saturation_threshold: number
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  por_hacer: 'Por hacer',
  en_curso: 'En curso',
  hecho: 'Hecho',
}

export const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, ninguna: 3 }
