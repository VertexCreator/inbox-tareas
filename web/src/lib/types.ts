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
  skill_levels: Record<string, number>
  open_subtasks: number
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
  list_item_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  skill: string | null
  assignee_id: string | null
  due_date: string | null
  done: boolean
  done_at: string | null
  position: number
}

export interface ListRow {
  id: string
  name: string
  description: string | null
  is_inbox: boolean
  archived: boolean
  created_at: string
}

export type ItemStatus = 'sin_planificar' | 'planificando' | 'planificado' | 'descartado'

export interface ListItem {
  id: string
  list_id: string
  title: string
  notes: string | null
  priority: Priority | null
  due_date: string | null
  status: ItemStatus
  task_id: string | null
  email_id: string | null
  created_by: string | null
  created_at: string
}

export interface TemplateItem {
  title: string
  skill: string | null
  days_before: number
  optional: boolean
}

export interface PlanTemplate {
  id: string
  name: string
  description: string | null
  keywords: string[]
  main_skill: string | null
  effort_points: number
  items: TemplateItem[]
  usage_count: number
}

export interface ProposalSubtask {
  title: string
  skill: string | null
  assignee_id: string | null
  recommended_id: string | null
  reason?: string | null
  due_date: string | null
  include: boolean
  template_index?: number | null
}

export interface Proposal {
  title: string
  description: string | null
  main_skill: string | null
  assignee_id: string | null
  recommended_id: string | null
  reason: string | null
  due_date: string
  priority: Priority
  effort_points: number
  subtasks: ProposalSubtask[]
}

export interface PlanRecommendation {
  id: string
  list_item_id: string
  template_id: string | null
  status: 'borrador' | 'afinada' | 'confirmada' | 'descartada'
  refined_by_ai: boolean
  proposal: Proposal
  updated_at: string
}

export interface Activity {
  id: number
  kind: string
  actor: string
  message: string
  task_id: string | null
  created_at: string
}

export interface PrioritiesConfig {
  p1: string[]
  p2: string[]
  junk: string[]
  categories: string[]
  create_items: string
  notes: string
  summary: {
    length: 'corto' | 'normal' | 'detallado'
    include: Record<'p1' | 'p2' | 'tasks' | 'load' | 'junk' | 'suspicious', boolean>
  }
}

export const LEVEL_LABEL: Record<number, string> = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado' }

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
