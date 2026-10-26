export type Priority = 'P1' | 'P2' | 'P3'
export type TaskStatus = 'por_hacer' | 'en_curso' | 'hecho' | 'cancelado'
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
  can_own: boolean
  ai_analysis_allowed: boolean
}

export interface Brand {
  id: string
  name: string
  color: string
  archived: boolean
  aliases: string[]
}

export interface Agency {
  id: string
  name: string
  color: string
  domains: string[]
  archived: boolean
}

export type StickerCategory = 'abierto' | 'en_curso' | 'terminado' | 'cancelado'

export interface Sticker {
  id: string
  name: string
  color: string
  category: StickerCategory
  position: number
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
  brand_id: string | null
  brand_ids: string[]
  agency_id: string | null
  sticker_id: string | null
  observation: string | null
  observation_at: string | null
  observation_by: string | null
  recurring_id: string | null
  recurrence_date: string | null
  duplicated_from: string | null
  created_by_member: string | null
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
  brand_id: string | null
  brand_ids: string[]
  agency_id: string | null
  suggested_brand: string | null
  auto_plan: boolean
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
  brand_id?: string | null
  brand_ids?: string[]
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
  brand_id: string | null
  brand_ids: string[]
  agency_id: string | null
  suggested_brand: string | null
  mentioned: boolean
  addressed: 'para' | 'copia' | 'lista' | null
  priority_locked: boolean
  owner_member_id: string | null
  body_preview: string | null
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
  summary_data: SummaryData | null
}

export interface SummaryItem {
  title: string
  detail?: string | null
  from?: string | null
  brand?: string | null
  due?: string | null
  mentioned?: boolean
  gmail_message_id?: string | null
}

export interface SummaryData {
  headline?: string | null
  p1?: SummaryItem[]
  p2?: SummaryItem[]
  p3?: SummaryItem[]
  p1_total?: number
  p2_total?: number
  p3_total?: number
  pendientes?: { title: string; brand?: string | null; recommended?: string | null }[]
  equipo?: string | null
  junk?: number | null
  suspicious?: string[]
  iniciativas?: { title: string; brand?: string | null; owner?: string | null; due?: string | null; overdue?: boolean }[]
}

export interface Settings {
  id: number
  autonomy: 'sugerencia' | 'automatico'
  saturation_threshold: number
  email_search_days: number
  forward_on_assign: boolean
  dashboard_url: string | null
  ai_analysis_daily_limit: number
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  por_hacer: 'Por hacer',
  en_curso: 'En curso',
  hecho: 'Hecho',
  cancelado: 'Cancelado',
}

export const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, ninguna: 3 }

// Resultado del análisis que el agente del gerente hace a pedido de un miembro.
export interface AnalysisResult {
  summary?: string
  priority?: Priority | 'ninguna'
  reason?: string
  brands?: string[]
  pendiente?: { title: string; notes?: string | null; due_date?: string | null; priority?: Priority; brands?: string[] } | null
  reply?: string | null
}

export interface AnalysisRequest {
  id: number
  email_id: string
  status: 'pendiente' | 'listo' | 'error' | 'cancelado'
  wants_reply: boolean
  result: AnalysisResult | null
  detail: string | null
  created_at: string
  done_at: string | null
}
