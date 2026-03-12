export interface AgentConfig {
  name: string;
  role: string;
  reportsTo: string;
}

export interface AgentsMap {
  [agentId: string]: AgentConfig;
}

export interface Handoff {
  id: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  context: string;
  decisions: string[];
  nextSteps: string[];
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'in_progress' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt: string | null;
  agentResponse?: string;
  responseAt?: string;
  pipelineId?: string;
  pipelineStep?: number;
  pipelineTotalSteps?: number;
}

export interface CreateHandoffPayload {
  fromAgent: string;
  toAgent: string;
  task: string;
  context: string;
  decisions: string[];
  nextSteps: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface AgentContextSummary {
  agent: string;
  pendingCount: number;
  handoffs: {
    id: string;
    from: string;
    task: string;
    context: string;
    decisions: string[];
    nextSteps: string[];
    priority: string;
    createdAt: string;
  }[];
}

// ==================== NEW BACKEND TYPES ====================

export interface Template {
  name: string;
  steps: TemplateStep[];
}

export interface TemplateStep {
  from: string;
  to: string;
  task: string;
  context: string;
}

export interface AgentStatus {
  agent: string;
  name: string;
  role: string;
  status: 'busy' | 'working' | 'available';
  pending: { id: string; task: string; priority: string }[];
  completed: number;
  avgCompletionTimeMinutes: number;
}

export interface DashboardSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  overdue: number;
  activePipelines: number;
}

export interface DashboardAgentStats {
  name: string;
  role: string;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  status: 'busy' | 'working' | 'active' | 'available';
}

export interface DashboardRecentActivity {
  id: string;
  from: string;
  to: string;
  task: string;
  status: string;
  time: string;
  pipelineId?: string;
  pipelineStep?: number;
}

export interface PipelineStep {
  id: string;
  from: string;
  to: string;
  task: string;
  status: string;
  step: number;
  createdAt: string;
  completedAt: string | null;
  agentResponse?: string;
}

export interface Pipeline {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  totalSteps: number;
  completedSteps: number;
  inProgressSteps: number;
  pendingSteps: number;
  failedSteps: number;
  steps: PipelineStep[];
}

export interface DashboardData {
  summary: DashboardSummary;
  byAgent: Record<string, DashboardAgentStats>;
  pipelines: Pipeline[];
  recent: DashboardRecentActivity[];
  templates: string[];
}

export interface AutoAssignResponse {
  success: boolean;
  assignedTo: string;
  agentName: string;
  reason: string;
  handoffId: string;
  handoff: Handoff;
}

export interface SchedulePayload {
  fromAgent: string;
  toAgent: string;
  task: string;
  context: string;
  scheduledAt: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ScheduleResponse {
  success: boolean;
  scheduleId: string;
  scheduledFor: string;
  task: string;
}

export interface ParallelPayload {
  fromAgent: string;
  toAgents: string[];
  task: string;
  context: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ParallelResponse {
  success: boolean;
  executed: number;
  results: { handoffId: string }[];
}

export interface ConditionalCondition {
  type: 'keyword' | 'always';
  keywords?: string[];
}

export interface ConditionalPayload {
  trigger: string;
  condition: ConditionalCondition;
  ifTrue: string;
  ifFalse: string;
  context: string;
}

export interface ConditionalResponse {
  condition: 'met' | 'not_met' | 'none';
  selectedAgent: string;
  agentName: string;
  handoff: Handoff;
}

export interface EscalateResponse {
  success: boolean;
  escalated: boolean;
  from: string;
  to: string;
  escalationLevel: number;
  newHandoff: Handoff;
}

export interface FeedbackPayload {
  rating: number;
  comments: string;
}

export interface FeedbackResponse {
  success: boolean;
  feedbackId: string;
  rating: number;
}

export interface SimilarTask {
  id: string;
  task: string;
  agent: string;
  completed: boolean;
}

export interface SimilarTasksResponse {
  query: string;
  similar: SimilarTask[];
}

export interface AutocompleteResponse {
  input: string;
  suggestions: string[];
}

export interface ContextAwareResponse {
  agent: string;
  pendingCount: number;
  recentTasks: string[];
  suggestedContext: string;
  priority: 'low' | 'medium' | 'high';
}

export interface HistoryItem {
  id: string;
  from: string;
  to: string;
  task: string;
  status: string;
  priority: string;
  createdAt: string;
  completedAt: string | null;
}

export interface HistoryResponse {
  history: HistoryItem[];
  total: number;
}

export interface TaskPayload {
  task: string;
  context?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface ChatPayload {
  message: string;
  from?: string;
}

export interface ChatResponse {
  success: boolean;
  chatId: string;
  message: string;
}

export interface TemplateExecutePayload {
  task: string;
  context?: string;
  priority?: 'low' | 'medium' | 'high';
  runAsync?: boolean;
}

export interface TemplateExecuteResponse {
  success: boolean;
  template: string;
  executed: number;
  results: { handoffId: string }[];
  pipelineId?: string;
}

// ==================== NEW BACKEND TYPES ====================

export interface Schedule {
  id: string;
  name?: string;
  type: 'handoff' | 'automation' | 'webhook';
  task?: string;
  fromAgent?: string;
  toAgent?: string;
  context?: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high';
  scheduledAt: string;
  cron?: string;
  recurring: boolean;
  createdAt: number;
  executions: number;
  lastRun?: number;
  lastError?: string;
  nextRun?: number;
  automationId?: string;
  webhookId?: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  createdAt: number;
}

export interface AutomationStep {
  name: string;
  type: 'http' | 'request' | 'script' | 'delay' | 'transform' | 'log';
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  code?: string;
  ms?: number;
  input?: unknown;
  message?: string;
}

export interface Automation {
  id: string;
  name: string;
  description?: string;
  steps: AutomationStep[];
  context?: Record<string, unknown>;
  trigger?: string;
  createdAt: number;
}

export interface ScheduleCreatePayload {
  type?: 'handoff' | 'automation' | 'webhook';
  task?: string;
  fromAgent?: string;
  toAgent?: string;
  context?: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high';
  scheduledAt?: string;
  cron?: string;
  name?: string;
  automationId?: string;
  webhookId?: string;
}

export interface ScheduleCreateResponse {
  success: boolean;
  scheduleId: string;
  scheduledFor: string;
}

export interface WebhookCreatePayload {
  name: string;
  url: string;
  events?: string[];
  headers?: Record<string, string>;
}

export interface WebhookCreateResponse {
  success: boolean;
  webhookId: string;
}

export interface WebhookTestResponse {
  success: boolean;
  status?: number;
  error?: string;
}

export interface AutomationCreatePayload {
  name: string;
  description?: string;
  steps: AutomationStep[];
  context?: Record<string, unknown>;
  trigger?: string;
}

export interface AutomationCreateResponse {
  success: boolean;
  automationId: string;
}

export interface AutomationRunResponse {
  automationId: string;
  name: string;
  executedAt: string;
  steps: Array<{ step: string; status?: number; ok?: boolean; result?: unknown; error?: string; waited?: number; logged?: string }>;
}

export const AGENT_COLORS: Record<string, string> = {
  chroma: 'cyan',
  bender: 'green',
  pixel: 'purple',
  canvas: 'pink',
  flux: 'orange',
  prism: 'blue',
  lumen: 'yellow',
  momentum: 'red',
  glyph: 'indigo',
  chief: 'amber',
};

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'High', color: 'text-red-400', bg: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  medium: { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' },
  low: { label: 'Low', color: 'text-green-400', bg: 'bg-green-500/15 text-green-400 border border-green-500/20' },
};
