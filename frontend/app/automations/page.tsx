'use client';

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { 
  fetchSchedules, 
  createSchedule, 
  createCronSchedule, 
  deleteSchedule,
  fetchWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  fetchAutomations,
  createAutomation,
  deleteAutomation,
  runAutomation,
  scheduleAutomation,
} from '@/lib/api';
import { Schedule, Webhook, Automation, AutomationStep } from '@/lib/types';
import { 
  Calendar, Clock, Trash2, Play, Plus, CheckCircle, XCircle, 
  AlertCircle, RefreshCw, Webhook as WebhookIcon, Zap, ChevronDown, ChevronRight,
  Copy, Check, Terminal, Settings, Bell, Code
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

type TabType = 'schedules' | 'webhooks' | 'automations';

// Helper to format relative time
function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return 'Never';
  const diff = timestamp - Date.now();
  const absDiff = Math.abs(diff);
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  const prefix = diff < 0 ? '' : 'in ';
  const suffix = diff < 0 ? ' ago' : '';
  
  if (days > 0) return `${prefix}${days}d${suffix}`;
  if (hours > 0) return `${prefix}${hours}h${suffix}`;
  if (minutes > 0) return `${prefix}${minutes}m${suffix}`;
  return `${prefix}${seconds}s${suffix}`;
}

// Helper to format absolute time
function formatAbsoluteTime(isoString: string | undefined): string {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleString();
}

export default function AutomationsPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('schedules');
  const [isLoading, setIsLoading] = useState(true);
  
  // Data states
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  
  // Form states
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showCronForm, setShowCronForm] = useState(false);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [showAutomationForm, setShowAutomationForm] = useState(false);
  
  // Schedule form fields
  const [scheduleType, setScheduleType] = useState<'handoff' | 'automation' | 'webhook'>('handoff');
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleTask, setScheduleTask] = useState('');
  const [scheduleFromAgent, setScheduleFromAgent] = useState('chroma');
  const [scheduleToAgent, setScheduleToAgent] = useState('');
  const [schedulePriority, setSchedulePriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * 1-5');
  
  // Webhook form fields
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['*']);
  const [webhookHeaders, setWebhookHeaders] = useState('{}');
  
  // Automation form fields
  const [automationName, setAutomationName] = useState('');
  const [automationDescription, setAutomationDescription] = useState('');
  const [automationSteps, setAutomationSteps] = useState<AutomationStep[]>([
    { name: 'Step 1', type: 'http', url: '', method: 'GET' }
  ]);
  
  // Testing states
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [runningAutomationId, setRunningAutomationId] = useState<string | null>(null);
  const [automationResults, setAutomationResults] = useState<Record<string, unknown> | null>(null);
  
  // Expanded states
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);
  const [expandedAutomation, setExpandedAutomation] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [schedulesData, webhooksData, automationsData] = await Promise.all([
        fetchSchedules(),
        fetchWebhooks(),
        fetchAutomations(),
      ]);
      setSchedules(schedulesData);
      setWebhooks(webhooksData);
      setAutomations(automationsData);
    } catch (err) {
      showToast('Failed to load operations data', 'error');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Schedule handlers
  const handleCreateSchedule = async () => {
    try {
      const payload = {
        type: scheduleType,
        name: scheduleName || scheduleTask?.substring(0, 30),
        task: scheduleTask,
        fromAgent: scheduleFromAgent,
        toAgent: scheduleToAgent,
        priority: schedulePriority,
        scheduledAt: new Date(scheduleDateTime).toISOString(),
      };
      await createSchedule(payload);
      showToast('Schedule created successfully', 'success');
      setShowScheduleForm(false);
      loadData();
      // Reset form
      setScheduleName('');
      setScheduleTask('');
      setScheduleToAgent('');
    } catch (err) {
      showToast('Failed to create schedule', 'error');
    }
  };

  const handleCreateCronSchedule = async () => {
    try {
      await createCronSchedule({
        cron: cronExpression,
        task: scheduleTask,
        name: scheduleName || `Cron: ${scheduleTask?.substring(0, 20)}`,
        type: scheduleType,
        fromAgent: scheduleFromAgent,
        toAgent: scheduleToAgent,
        priority: schedulePriority,
      });
      showToast('Recurring schedule created', 'success');
      setShowCronForm(false);
      loadData();
    } catch (err) {
      showToast('Failed to create cron schedule', 'error');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await deleteSchedule(id);
      showToast('Schedule deleted', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to delete schedule', 'error');
    }
  };

  // Webhook handlers
  const handleCreateWebhook = async () => {
    try {
      const headers = webhookHeaders ? JSON.parse(webhookHeaders) : {};
      await createWebhook({
        name: webhookName,
        url: webhookUrl,
        events: webhookEvents,
        headers,
      });
      showToast('Webhook created', 'success');
      setShowWebhookForm(false);
      loadData();
      setWebhookName('');
      setWebhookUrl('');
      setWebhookHeaders('{}');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create webhook', 'error');
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await deleteWebhook(id);
      showToast('Webhook deleted', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to delete webhook', 'error');
    }
  };

  const handleTestWebhook = async (id: string) => {
    setTestingWebhookId(id);
    try {
      const result = await testWebhook(id);
      if (result.success) {
        showToast(`Webhook test successful: ${result.status}`, 'success');
      } else {
        showToast(`Webhook test failed: ${result.error}`, 'error');
      }
    } catch (err) {
      showToast('Webhook test failed', 'error');
    } finally {
      setTestingWebhookId(null);
    }
  };

  // Automation handlers
  const handleCreateAutomation = async () => {
    try {
      await createAutomation({
        name: automationName,
        description: automationDescription,
        steps: automationSteps,
      });
      showToast('Automation created', 'success');
      setShowAutomationForm(false);
      loadData();
      setAutomationName('');
      setAutomationDescription('');
      setAutomationSteps([{ name: 'Step 1', type: 'http', url: '', method: 'GET' }]);
    } catch (err) {
      showToast('Failed to create automation', 'error');
    }
  };

  const handleDeleteAutomation = async (id: string) => {
    if (!confirm('Delete this automation?')) return;
    try {
      await deleteAutomation(id);
      showToast('Automation deleted', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to delete automation', 'error');
    }
  };

  const handleRunAutomation = async (id: string) => {
    setRunningAutomationId(id);
    try {
      const result = await runAutomation(id);
      setAutomationResults(result as unknown as Record<string, unknown>);
      showToast('Automation executed', 'success');
    } catch (err) {
      showToast('Automation execution failed', 'error');
    } finally {
      setRunningAutomationId(null);
    }
  };

  const handleScheduleAutomation = async (id: string) => {
    const cron = prompt('Enter cron expression (e.g., 0 9 * * 1-5 for weekdays at 9am):');
    if (!cron) return;
    try {
      await scheduleAutomation(id, { cron });
      showToast('Automation scheduled', 'success');
      loadData();
    } catch (err) {
      showToast('Failed to schedule automation', 'error');
    }
  };

  // Step management for automation builder
  const addStep = () => {
    setAutomationSteps([...automationSteps, { name: `Step ${automationSteps.length + 1}`, type: 'http', url: '', method: 'GET' }]);
  };

  const removeStep = (index: number) => {
    setAutomationSteps(automationSteps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, updates: Partial<AutomationStep>) => {
    const newSteps = [...automationSteps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setAutomationSteps(newSteps);
  };

  const availableAgents = [
    'chroma', 'bender', 'pixel', 'canvas', 'flux', 'prism', 'lumen', 'momentum', 'glyph', 'chief',
    // Sub-agents
    'frontend-dev', 'backend-dev', 'code-reviewer', 'qa-tester', 'mobile-dev',
    'market-researcher', 'competitor-analyst'
  ];

  return (
    <div>
      <PageHeader 
        title="Operations" 
        subtitle={`${schedules.length} schedules · ${webhooks.length} webhooks · ${automations.length} automations`}
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
        {[
          { id: 'schedules', label: 'Schedules', icon: Calendar, count: schedules.length },
          { id: 'webhooks', label: 'Webhooks', icon: WebhookIcon, count: webhooks.length },
          { id: 'automations', label: 'Automations', icon: Zap, count: automations.length },
        ].map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as TabType)}
            className={`flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-widest transition-colors border-b-2 ${
              activeTab === id
                ? 'border-[#1B4FD8] text-[#1B4FD8]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
            {label}
            <span className="ml-1 px-1.5 py-0.5 bg-[#E4E2DC] dark:bg-[#3A3A3A] text-[10px] rounded">
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowScheduleForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1B4FD8] text-white text-xs uppercase tracking-widest hover:bg-[#3B64DD] transition-colors"
            >
              <Plus className="h-4 w-4" />
              One-time Schedule
            </button>
            <button
              onClick={() => setShowCronForm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] text-xs uppercase tracking-widest hover:border-[#1B4FD8] transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Recurring (Cron)
            </button>
          </div>

          {/* Create One-time Schedule Form */}
          {showScheduleForm && (
            <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">Create One-time Schedule</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Name (optional)</label>
                  <input
                    type="text"
                    value={scheduleName}
                    onChange={(e) => setScheduleName(e.target.value)}
                    placeholder="e.g., Daily Report"
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Schedule For</label>
                  <input
                    type="datetime-local"
                    value={scheduleDateTime}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Task</label>
                <textarea
                  value={scheduleTask}
                  onChange={(e) => setScheduleTask(e.target.value)}
                  placeholder="What needs to be done?"
                  rows={2}
                  className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">From Agent</label>
                  <select
                    value={scheduleFromAgent}
                    onChange={(e) => setScheduleFromAgent(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  >
                    {availableAgents.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">To Agent</label>
                  <select
                    value={scheduleToAgent}
                    onChange={(e) => setScheduleToAgent(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  >
                    <option value="">Select...</option>
                    {availableAgents.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Priority</label>
                  <select
                    value={schedulePriority}
                    onChange={(e) => setSchedulePriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateSchedule}
                  disabled={!scheduleTask || !scheduleToAgent || !scheduleDateTime}
                  className="px-4 py-2 bg-[#1B7A4A] text-white text-xs uppercase tracking-widest hover:bg-[#1B7A4A]/90 transition-colors disabled:opacity-50"
                >
                  Create Schedule
                </button>
                <button
                  onClick={() => setShowScheduleForm(false)}
                  className="px-4 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] text-xs uppercase tracking-widest hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Create Cron Form */}
          {showCronForm && (
            <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">Create Recurring Schedule (Cron)</h3>
              
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Cron Expression</label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="* * * * *"
                  className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm font-mono"
                />
                <p className="text-[10px] text-[#A8A49E] mt-1">
                  Format: minute hour day month weekday · Examples: <code className="bg-[#E4E2DC] dark:bg-[#3A3A3A] px-1">0 9 * * 1-5</code> (weekdays 9am)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Task</label>
                  <input
                    type="text"
                    value={scheduleTask}
                    onChange={(e) => setScheduleTask(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">To Agent</label>
                  <select
                    value={scheduleToAgent}
                    onChange={(e) => setScheduleToAgent(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  >
                    <option value="">Select...</option>
                    {availableAgents.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateCronSchedule}
                  disabled={!cronExpression || !scheduleTask || !scheduleToAgent}
                  className="px-4 py-2 bg-[#1B7A4A] text-white text-xs uppercase tracking-widest hover:bg-[#1B7A4A]/90 transition-colors disabled:opacity-50"
                >
                  Create Recurring
                </button>
                <button
                  onClick={() => setShowCronForm(false)}
                  className="px-4 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] text-xs uppercase tracking-widest hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Schedules List */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 border border-[#E4E2DC] dark:border-[#3A3A3A]">
              <Calendar className="h-8 w-8 text-[#A8A49E] mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No schedules yet</p>
              <p className="text-xs text-[#A8A49E] mt-1">Create a one-time or recurring schedule</p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                          schedule.type === 'handoff' ? 'border-[#1B4FD8]/30 text-[#1B4FD8]' :
                          schedule.type === 'automation' ? 'border-[#1B7A4A]/30 text-[#1B7A4A]' :
                          'border-[#A07020]/30 text-[#A07020]'
                        }`}>
                          {schedule.type}
                        </span>
                        {schedule.recurring && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider border border-[#A8A49E]/30 text-[#A8A49E]">
                            <RefreshCw className="h-3 w-3" />
                            Recurring
                          </span>
                        )}
                        <span className={`inline-flex px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                          schedule.priority === 'high' ? 'border-[#C1341A]/30 text-[#C1341A]' :
                          schedule.priority === 'medium' ? 'border-[#A07020]/30 text-[#A07020]' :
                          'border-[#1B7A4A]/30 text-[#1B7A4A]'
                        }`}>
                          {schedule.priority}
                        </span>
                      </div>
                      
                      <h4 className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8] truncate">
                        {schedule.name || schedule.task || 'Untitled Schedule'}
                      </h4>
                      
                      <div className="flex items-center gap-4 mt-2 text-[11px] text-[#A8A49E] dark:text-[#6B6B6B]">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(schedule.nextRun)}
                        </span>
                        {schedule.cron && <span className="font-mono">{schedule.cron}</span>}
                        <span>{schedule.executions} run{schedule.executions !== 1 ? 's' : ''}</span>
                        {schedule.lastError && (
                          <span className="text-[#C1341A] flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Error
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      className="p-2 text-[#A8A49E] hover:text-[#C1341A] transition-colors"
                      title="Delete schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowWebhookForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B4FD8] text-white text-xs uppercase tracking-widest hover:bg-[#3B64DD] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Webhook
          </button>

          {showWebhookForm && (
            <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">Create Webhook</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Name</label>
                  <input
                    type="text"
                    value={webhookName}
                    onChange={(e) => setWebhookName(e.target.value)}
                    placeholder="e.g., Slack Notifications"
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">URL</label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/..."
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Events</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {['*', 'handoff_created', 'handoff_completed', 'schedule_executed', 'automation_run'].map((event) => (
                    <button
                      key={event}
                      onClick={() => {
                        if (event === '*') {
                          setWebhookEvents(['*']);
                        } else {
                          setWebhookEvents(prev => 
                            prev.includes('*') ? [event] :
                            prev.includes(event) ? prev.filter(e => e !== event) :
                            [...prev, event]
                          );
                        }
                      }}
                      className={`px-2 py-1 text-[10px] uppercase tracking-wider border transition-colors ${
                        webhookEvents.includes(event) || webhookEvents.includes('*')
                          ? 'border-[#1B4FD8] text-[#1B4FD8]'
                          : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B]'
                      }`}
                    >
                      {event}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Headers (JSON)</label>
                <textarea
                  value={webhookHeaders}
                  onChange={(e) => setWebhookHeaders(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm font-mono text-xs"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateWebhook}
                  disabled={!webhookName || !webhookUrl}
                  className="px-4 py-2 bg-[#1B7A4A] text-white text-xs uppercase tracking-widest hover:bg-[#1B7A4A]/90 transition-colors disabled:opacity-50"
                >
                  Create Webhook
                </button>
                <button
                  onClick={() => setShowWebhookForm(false)}
                  className="px-4 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] text-xs uppercase tracking-widest hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded" />
              ))}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-12 border border-[#E4E2DC] dark:border-[#3A3A3A]">
              <WebhookIcon className="h-8 w-8 text-[#A8A49E] mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No webhooks configured</p>
              <p className="text-xs text-[#A8A49E] mt-1">Add a webhook to receive notifications</p>
            </div>
          ) : (
            <div className="space-y-2">
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{webhook.name}</h4>
                      <p className="text-xs text-[#6B6B6B] dark:text-[#A8A49E] font-mono mt-1 truncate">{webhook.url}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {webhook.events.map((event) => (
                          <span
                            key={event}
                            className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-[#E4E2DC] dark:bg-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E]"
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleTestWebhook(webhook.id)}
                        disabled={testingWebhookId === webhook.id}
                        className="p-2 text-[#A8A49E] hover:text-[#1B7A4A] transition-colors disabled:opacity-50"
                        title="Test webhook"
                      >
                        {testingWebhookId === webhook.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="p-2 text-[#A8A49E] hover:text-[#C1341A] transition-colors"
                        title="Delete webhook"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Automations Tab */}
      {activeTab === 'automations' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowAutomationForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B4FD8] text-white text-xs uppercase tracking-widest hover:bg-[#3B64DD] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Automation
          </button>

          {showAutomationForm && (
            <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">Create Automation</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Name</label>
                  <input
                    type="text"
                    value={automationName}
                    onChange={(e) => setAutomationName(e.target.value)}
                    placeholder="e.g., Data Sync"
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Description</label>
                  <input
                    type="text"
                    value={automationDescription}
                    onChange={(e) => setAutomationDescription(e.target.value)}
                    placeholder="What does this automation do?"
                    className="w-full px-3 py-2 bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Steps</label>
                  <button
                    onClick={addStep}
                    className="text-[10px] text-[#1B4FD8] hover:underline"
                  >
                    + Add Step
                  </button>
                </div>
                
                <div className="space-y-2">
                  {automationSteps.map((step, index) => (
                    <div key={index} className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-[#A8A49E]">Step {index + 1}</span>
                        <select
                          value={step.type}
                          onChange={(e) => updateStep(index, { type: e.target.value as AutomationStep['type'] })}
                          className="px-2 py-1 text-xs bg-[#E4E2DC] dark:bg-[#3A3A3A] border-0"
                        >
                          <option value="http">HTTP Request</option>
                          <option value="delay">Delay</option>
                          <option value="log">Log</option>
                          <option value="script">Script</option>
                          <option value="transform">Transform</option>
                        </select>
                        <input
                          type="text"
                          value={step.name}
                          onChange={(e) => updateStep(index, { name: e.target.value })}
                          placeholder="Step name"
                          className="flex-1 px-2 py-1 text-xs bg-transparent border-b border-[#E4E2DC] dark:border-[#3A3A3A] focus:border-[#1B4FD8] outline-none"
                        />
                        {automationSteps.length > 1 && (
                          <button
                            onClick={() => removeStep(index)}
                            className="text-[#A8A49E] hover:text-[#C1341A]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      
                      {step.type === 'http' && (
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={step.method || 'GET'}
                            onChange={(e) => updateStep(index, { method: e.target.value })}
                            className="px-2 py-1 text-xs bg-[#E4E2DC] dark:bg-[#3A3A3A] border-0"
                          >
                            <option>GET</option>
                            <option>POST</option>
                            <option>PUT</option>
                            <option>DELETE</option>
                          </select>
                          <input
                            type="text"
                            value={step.url || ''}
                            onChange={(e) => updateStep(index, { url: e.target.value })}
                            placeholder="https://..."
                            className="col-span-2 px-2 py-1 text-xs bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A]"
                          />
                        </div>
                      )}
                      
                      {step.type === 'delay' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={step.ms || 1000}
                            onChange={(e) => updateStep(index, { ms: parseInt(e.target.value) })}
                            className="w-24 px-2 py-1 text-xs bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A]"
                          />
                          <span className="text-xs text-[#A8A49E]">milliseconds</span>
                        </div>
                      )}
                      
                      {step.type === 'log' && (
                        <input
                          type="text"
                          value={step.message || ''}
                          onChange={(e) => updateStep(index, { message: e.target.value })}
                          placeholder="Message to log"
                          className="w-full px-2 py-1 text-xs bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A]"
                        />
                      )}
                      
                      {(step.type === 'script' || step.type === 'transform') && (
                        <textarea
                          value={step.code || ''}
                          onChange={(e) => updateStep(index, { code: e.target.value })}
                          placeholder="// JavaScript code"
                          rows={3}
                          className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateAutomation}
                  disabled={!automationName || automationSteps.length === 0}
                  className="px-4 py-2 bg-[#1B7A4A] text-white text-xs uppercase tracking-widest hover:bg-[#1B7A4A]/90 transition-colors disabled:opacity-50"
                >
                  Create Automation
                </button>
                <button
                  onClick={() => setShowAutomationForm(false)}
                  className="px-4 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] text-xs uppercase tracking-widest hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Automation Results */}
          {automationResults && (
            <div className="bg-[#1A1A1A] text-[#FAFAF8] p-4 font-mono text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#A8A49E]">Execution Results</span>
                <button onClick={() => setAutomationResults(null)} className="text-[#A8A49E] hover:text-white">×</button>
              </div>
              <pre className="overflow-x-auto">{JSON.stringify(automationResults, null, 2)}</pre>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded" />
              ))}
            </div>
          ) : automations.length === 0 ? (
            <div className="text-center py-12 border border-[#E4E2DC] dark:border-[#3A3A3A]">
              <Zap className="h-8 w-8 text-[#A8A49E] mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No automations yet</p>
              <p className="text-xs text-[#A8A49E] mt-1">Create multi-step workflows</p>
            </div>
          ) : (
            <div className="space-y-2">
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{automation.name}</h4>
                        <span className="text-[10px] text-[#A8A49E]">{automation.steps.length} step{automation.steps.length !== 1 ? 's' : ''}</span>
                      </div>
                      {automation.description && (
                        <p className="text-xs text-[#6B6B6B] dark:text-[#A8A49E] mt-1">{automation.description}</p>
                      )}
                      
                      <button
                        onClick={() => setExpandedAutomation(expandedAutomation === automation.id ? null : automation.id)}
                        className="flex items-center gap-1 mt-2 text-[10px] text-[#A8A49E] hover:text-[#1B4FD8] transition-colors"
                      >
                        {expandedAutomation === automation.id ? (
                          <>
                            <ChevronDown className="h-3 w-3" />
                            Hide steps
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-3 w-3" />
                            Show steps
                          </>
                        )}
                      </button>
                      
                      {expandedAutomation === automation.id && (
                        <div className="mt-2 pl-3 border-l-2 border-[#E4E2DC] dark:border-[#3A3A3A] space-y-1">
                          {automation.steps.map((step, idx) => (
                            <div key={idx} className="text-xs text-[#6B6B6B] dark:text-[#A8A49E]">
                              {idx + 1}. {step.name} ({step.type})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRunAutomation(automation.id)}
                        disabled={runningAutomationId === automation.id}
                        className="p-2 text-[#A8A49E] hover:text-[#1B7A4A] transition-colors disabled:opacity-50"
                        title="Run now"
                      >
                        {runningAutomationId === automation.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleScheduleAutomation(automation.id)}
                        className="p-2 text-[#A8A49E] hover:text-[#1B4FD8] transition-colors"
                        title="Schedule"
                      >
                        <Calendar className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAutomation(automation.id)}
                        className="p-2 text-[#A8A49E] hover:text-[#C1341A] transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
