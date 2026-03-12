import { 
  AgentsMap, 
  Handoff, 
  CreateHandoffPayload, 
  AgentContextSummary,
  Template,
  AgentStatus,
  DashboardData,
  AutoAssignResponse,
  SchedulePayload,
  ScheduleResponse,
  ParallelPayload,
  ParallelResponse,
  ConditionalPayload,
  ConditionalResponse,
  EscalateResponse,
  FeedbackPayload,
  FeedbackResponse,
  SimilarTasksResponse,
  AutocompleteResponse,
  ContextAwareResponse,
  HistoryResponse,
  TaskPayload,
  ChatPayload,
  ChatResponse,
  TemplateExecutePayload,
  TemplateExecuteResponse
} from './types';

let envApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3461/api';
try { envApiUrl = decodeURIComponent(envApiUrl); } catch (e) {}
const rawApiUrl = envApiUrl
  .replace(/^["']|["']$/g, '')
  .replace(/\/$/, '');
const API_BASE = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchAgents(): Promise<AgentsMap> {
  const data = await apiFetch<{ agents: AgentsMap }>('/agents');
  return data.agents;
}

export async function fetchAllHandoffs(): Promise<Handoff[]> {
  const data = await apiFetch<{ handoffs: Handoff[] }>('/handoffs');
  return data.handoffs;
}

export async function fetchAgentContext(agentId: string): Promise<AgentContextSummary> {
  return apiFetch<AgentContextSummary>(`/context/${agentId}`);
}

export async function fetchPendingHandoffs(agentId: string): Promise<Handoff[]> {
  const data = await apiFetch<{ pending: Handoff[] }>(`/pending/${agentId}`);
  return data.pending;
}

export async function createHandoff(payload: CreateHandoffPayload): Promise<{ success: boolean; handoffId: string; handoff: Handoff }> {
  return apiFetch('/handoff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function completeHandoff(handoffId: string): Promise<{ success: boolean; handoff: Handoff }> {
  return apiFetch(`/handoff/${handoffId}/complete`, {
    method: 'POST',
  });
}

// ==================== NEW BACKEND API FUNCTIONS ====================

export async function fetchTemplates(): Promise<Array<Template & { key: string; stepCount: number }>> {
  const data = await apiFetch<{ templates: Array<Template & { key: string; stepCount: number }> }>('/templates');
  return data.templates;
}

export async function executeTemplate(name: string, payload: TemplateExecutePayload): Promise<TemplateExecuteResponse> {
  return apiFetch(`/template/${name}/execute`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAgentStatus(agentId: string): Promise<AgentStatus> {
  return apiFetch<AgentStatus>(`/agents/${agentId}/status`);
}

export async function fetchDashboard(): Promise<DashboardData> {
  return apiFetch<DashboardData>('/dashboard');
}

export async function autoAssignTask(payload: { task: string; context?: string; priority?: string }): Promise<AutoAssignResponse> {
  return apiFetch('/auto-assign', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function scheduleHandoff(payload: SchedulePayload): Promise<ScheduleResponse> {
  return apiFetch('/schedule', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createParallelHandoffs(payload: ParallelPayload): Promise<ParallelResponse> {
  return apiFetch('/parallel', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createConditionalHandoff(payload: ConditionalPayload): Promise<ConditionalResponse> {
  return apiFetch('/conditional', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function escalateHandoff(handoffId: string): Promise<EscalateResponse> {
  return apiFetch(`/escalate/${handoffId}`, {
    method: 'POST',
  });
}

export async function submitFeedback(handoffId: string, payload: FeedbackPayload): Promise<FeedbackResponse> {
  return apiFetch(`/feedback/${handoffId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchSimilarTasks(task: string): Promise<SimilarTasksResponse> {
  return apiFetch<SimilarTasksResponse>(`/similar?task=${encodeURIComponent(task)}`);
}

export async function fetchAutocomplete(task: string): Promise<AutocompleteResponse> {
  return apiFetch<AutocompleteResponse>(`/autocomplete?task=${encodeURIComponent(task)}`);
}

export async function fetchContextAware(toAgent: string, task: string): Promise<ContextAwareResponse> {
  return apiFetch<ContextAwareResponse>('/context-aware', {
    method: 'POST',
    body: JSON.stringify({ toAgent, task }),
  });
}

export async function fetchHistory(agent?: string, limit = 20): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (agent) params.set('agent', agent);
  return apiFetch<HistoryResponse>(`/history?${params}`);
}

export async function sendTaskToAgent(agentId: string, payload: TaskPayload): Promise<{ success: boolean; handoffId: string }> {
  return apiFetch(`/task/${agentId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function sendChatToAgent(agentId: string, payload: ChatPayload): Promise<ChatResponse> {
  return apiFetch(`/chat/${agentId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ==================== FILE UPLOAD ====================

export interface UploadedFile {
  id: string;
  name: string;
  storedName: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: string;
}

export async function createPipeline(payload: {
  agents: string[];
  task: string;
  context: string;
  priority: string;
  runMode?: 'sequential' | 'parallel';
}): Promise<{ success: boolean; pipelineId: string; steps: number; results: { handoffId: string }[] }> {
  return apiFetch('/pipeline', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface DeliverableFile {
  name: string;
  path: string;
  fullPath: string;
  size: number;
  modified: string;
  ext: string;
}

export async function fetchHandoffDeliverables(handoffId: string): Promise<{ files: DeliverableFile[]; path: string; count: number }> {
  return apiFetch(`/handoff/${handoffId}/deliverables`, {
    method: 'GET',
  });
}

export async function cancelHandoff(handoffId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/handoff/${handoffId}/cancel`, {
    method: 'POST',
  });
}

export async function uploadFiles(files: File[]): Promise<{ success: boolean; files: UploadedFile[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Upload failed: ${res.status}`);
  }

  return res.json();
}

export async function createHandoffWithFiles(
  payload: { fromAgent: string; toAgent: string; task: string; context: string; priority: string },
  files: File[]
): Promise<{ success: boolean; handoffId: string; files: UploadedFile[] }> {
  const formData = new FormData();
  formData.append('fromAgent', payload.fromAgent);
  formData.append('toAgent', payload.toAgent);
  formData.append('task', payload.task);
  formData.append('context', payload.context);
  formData.append('priority', payload.priority);
  files.forEach((file) => formData.append('files', file));

  const res = await fetch(`${API_BASE}/handoff-with-files`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Upload failed: ${res.status}`);
  }

  return res.json();
}

// Metrics
export async function fetchMetrics() {
  const res = await fetch(`${API_BASE}/metrics`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

// ==================== NEW BACKEND API FUNCTIONS ====================

import {
  Schedule,
  ScheduleCreatePayload,
  ScheduleCreateResponse,
  Webhook,
  WebhookCreatePayload,
  WebhookCreateResponse,
  WebhookTestResponse,
  Automation,
  AutomationCreatePayload,
  AutomationCreateResponse,
  AutomationRunResponse,
} from './types';

// Schedules
export async function fetchSchedules(): Promise<Schedule[]> {
  return apiFetch<Schedule[]>('/schedules');
}

export async function createSchedule(payload: ScheduleCreatePayload): Promise<ScheduleCreateResponse> {
  return apiFetch('/schedules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteSchedule(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/schedules/${id}`, { method: 'DELETE' });
}

// Cron Schedules
export async function createCronSchedule(payload: {
  cron: string;
  task: string;
  name?: string;
  type?: 'handoff' | 'automation' | 'webhook';
  fromAgent?: string;
  toAgent?: string;
  priority?: 'low' | 'medium' | 'high';
}): Promise<ScheduleCreateResponse> {
  return apiFetch('/cron', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Webhooks
export async function fetchWebhooks(): Promise<Webhook[]> {
  return apiFetch<Webhook[]>('/webhooks');
}

export async function createWebhook(payload: WebhookCreatePayload): Promise<WebhookCreateResponse> {
  return apiFetch('/webhooks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhook(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<WebhookTestResponse> {
  return apiFetch(`/webhooks/${id}/test`, { method: 'POST' });
}

// Automations
export async function fetchAutomations(): Promise<Automation[]> {
  return apiFetch<Automation[]>('/automations');
}

export async function createAutomation(payload: AutomationCreatePayload): Promise<AutomationCreateResponse> {
  return apiFetch('/automations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function runAutomation(id: string): Promise<AutomationRunResponse> {
  return apiFetch<AutomationRunResponse>(`/automations/${id}`, { method: 'GET' });
}

export async function scheduleAutomation(
  id: string,
  schedule: { cron?: string; scheduledAt?: string }
): Promise<{ success: boolean; scheduleId: string }> {
  return apiFetch(`/automations/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify(schedule),
  });
}

export async function deleteAutomation(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/automations/${id}`, { method: 'DELETE' });
}
