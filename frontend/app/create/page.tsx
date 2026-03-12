'use client';

import { useEffect, useState } from 'react';
import { fetchAgents, createHandoff, createPipeline, fetchTemplates, executeTemplate } from '@/lib/api';
import { AgentsMap, CreateHandoffPayload, type Template } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { GitBranch, ArrowRight, Plus, X, ChevronUp, ChevronDown, Play, Loader2, FileCode } from 'lucide-react';
import { CreateHandoffSchema, type CreateHandoffInput } from '@/lib/validation';

type Mode = 'single' | 'pipeline' | 'templates';

interface LocalTemplate extends Template {
  key: string;
  stepCount: number;
}

export default function CreateHandoffPage() {
  const [agents, setAgents] = useState<AgentsMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [mode, setMode] = useState<Mode>('single');

  // Single mode state
  const [fromAgent, setFromAgent] = useState('');
  const [toAgent, setToAgent] = useState('');
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [decisions, setDecisions] = useState<string[]>([]);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newDecision, setNewDecision] = useState('');
  const [newStep, setNewStep] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // Pipeline mode state
  const [pipelineAgents, setPipelineAgents] = useState<string[]>([]);
  const [pipelineMode, setPipelineMode] = useState<'sequential' | 'parallel'>('sequential');

  // Delegate mode state (for sub-agents)
  const [delegateMode, setDelegateMode] = useState(false);

  // Templates mode state
  const [templates, setTemplates] = useState<LocalTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [templateTask, setTemplateTask] = useState('');
  const [templateContext, setTemplateContext] = useState('');
  const [templatePriority, setTemplatePriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [runMode, setRunMode] = useState<'async' | 'sequential'>('async');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(console.error);
  }, []);

  // Load templates when mode changes to templates
  useEffect(() => {
    if (mode === 'templates' && templates.length === 0) {
      setTemplatesLoading(true);
      fetchTemplates()
        .then(data => setTemplates(data))
        .catch(() => setTemplatesLoading(false))
        .finally(() => setTemplatesLoading(false));
    }
  }, [mode, templates.length]);

  // Helper: Identify parent agents and their sub-agents
  const PARENT_AGENTS = ['bender', 'prism'];
  const SUB_AGENTS: Record<string, string[]> = {
    bender: ['frontend-dev', 'backend-dev', 'code-reviewer', 'qa-tester', 'mobile-dev'],
    prism: ['market-researcher', 'competitor-analyst']
  };
  
  const isParentAgent = (agentId: string) => PARENT_AGENTS.includes(agentId);
  const getSubAgents = (parentId: string) => SUB_AGENTS[parentId] || [];
  const getParentOfSubAgent = (agentId: string): string | null => {
    for (const parent of PARENT_AGENTS) {
      if (SUB_AGENTS[parent]?.includes(agentId)) return parent;
    }
    return null;
  };

  // Execute template
  const executeTemplateHandler = async (templateKey: string) => {
    if (!templateTask.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a task' });
      return;
    }

    setExecuting(templateKey);
    setFeedback(null);
    try {
      const data = await executeTemplate(templateKey, {
        task: templateTask,
        context: templateContext,
        priority: templatePriority,
        runAsync: runMode === 'async'
      });
      
      if (runMode === 'sequential') {
        setFeedback({
          type: 'success',
          message: `Sequential pipeline started! Pipeline ID: ${data.pipelineId}`
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Template executed! Created ${data.executed} handoffs`
        });
      }
      setTemplateTask('');
      setTemplateContext('');
      setSelectedTemplate(null);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to execute template' });
    } finally {
      setExecuting(null);
    }
  };

  // Pipeline helpers
  const addToPipeline = (agentId: string) => {
    setPipelineAgents(prev => [...prev, agentId]);
  };

  const removeFromPipeline = (index: number) => {
    setPipelineAgents(prev => prev.filter((_, i) => i !== index));
  };

  const movePipelineStep = (index: number, dir: -1 | 1) => {
    setPipelineAgents(prev => {
      const next = [...prev];
      const swapIdx = index + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  };

  function addDecision() {
    if (newDecision.trim()) {
      setDecisions([...decisions, newDecision.trim()]);
      setNewDecision('');
    }
  }

  function addStep() {
    if (newStep.trim()) {
      setNextSteps([...nextSteps, newStep.trim()]);
      setNewStep('');
    }
  }

  function removeDecision(index: number) {
    setDecisions(decisions.filter((_, i) => i !== index));
  }

  function removeStep(index: number) {
    setNextSteps(nextSteps.filter((_, i) => i !== index));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (mode === 'pipeline') {
        if (pipelineAgents.length < 2) {
          setFeedback({ type: 'error', message: 'Add at least 2 agents to create a pipeline' });
          setIsSubmitting(false);
          return;
        }
        const result = await createPipeline({
          agents: pipelineAgents,
          task,
          context,
          priority,
          runMode: pipelineMode,
        });
        setFeedback({
          type: 'success',
          message: pipelineMode === 'parallel' 
            ? `Parallel pipeline created: ${pipelineAgents.length} agents working simultaneously`
            : `Pipeline created: ${result.steps} steps, ID: ${result.pipelineId}`,
        });
        setPipelineAgents([]);
        setTask('');
        setContext('');
        setPriority('medium');
      } else {
        if (!fromAgent || !toAgent) {
          setFeedback({ type: 'error', message: 'Select both source and target agents' });
          setIsSubmitting(false);
          return;
        }
        if (fromAgent === toAgent) {
          setFeedback({ type: 'error', message: 'Source and target agents must be different' });
          setIsSubmitting(false);
          return;
        }

        // Use file upload API if files are present
        if (files.length > 0) {
          const formData = new FormData();
          formData.append('fromAgent', fromAgent);
          formData.append('toAgent', toAgent);
          formData.append('task', task);
          formData.append('context', context);
          formData.append('priority', priority);
          files.forEach((file) => formData.append('files', file));

          const res = await fetch('http://localhost:3461/api/handoff-with-files', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error('Failed to create handoff with files');
          const result = await res.json();
          
          setFeedback({
            type: 'success',
            message: `Handoff created with ${files.length} file(s): ${result.handoffId}`,
          });
        } else {
          const payload: CreateHandoffPayload = {
            fromAgent,
            toAgent,
            task,
            context,
            decisions,
            nextSteps,
            priority,
          };

          const result = await createHandoff(payload);
          setFeedback({
            type: 'success',
            message: `Handoff created: ${result.handoffId}`,
          });
        }

        setFromAgent('');
        setToAgent('');
        setTask('');
        setContext('');
        setDecisions([]);
        setNextSteps([]);
        setPriority('medium');
        setFiles([]);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const agentEntries = Object.entries(agents);

  return (
    <div className="max-w-2xl">
      <PageHeader 
        title="Dispatch Handoff" 
        subtitle={mode === 'templates' ? `${templates.length} workflow templates available` : 'Transfer a task between agents with full context'}
      />

      {feedback && (
        <div className={`border px-4 py-3 mb-6 ${feedback.type === 'success' ? 'border-[#6B9E6B] text-[#6B9E6B] dark:border-[#6B9E6B] dark:text-[#6B9E6B]' : 'border-[#C1341A] text-[#C1341A] dark:border-[#EF4444] dark:text-[#EF4444]'}`}>
          <span className="text-sm">{feedback.message}</span>
        </div>
      )}

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-8">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`flex items-center gap-2 px-4 py-2.5 border transition-colors ${
            mode === 'single'
              ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10 text-[#1B4FD8]'
              : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/40'
          }`}
        >
          <ArrowRight className="h-4 w-4" />
          <span className="text-sm font-medium">Single Handoff</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('pipeline')}
          className={`flex items-center gap-2 px-4 py-2.5 border transition-colors ${
            mode === 'pipeline'
              ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10 text-[#1B4FD8]'
              : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/40'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          <span className="text-sm font-medium">Pipeline</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('templates')}
          className={`flex items-center gap-2 px-4 py-2.5 border transition-colors ${
            mode === 'templates'
              ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10 text-[#1B4FD8]'
              : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/40'
          }`}
        >
          <FileCode className="h-4 w-4" />
          <span className="text-sm font-medium">Templates</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Pipeline Mode: Agent Chain */}
        {mode === 'pipeline' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="section-label block">Agent Chain</label>
              
              {/* Parallel/Sequential Toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPipelineMode('sequential')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    pipelineMode === 'sequential' 
                      ? 'bg-[#1B4FD8] text-white' 
                      : 'bg-[#E4E2DC] dark:bg-[#3A3A3A] text-[#6B6B6B]'
                  }`}
                >
                  Sequential
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineMode('parallel')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    pipelineMode === 'parallel' 
                      ? 'bg-[#1B4FD8] text-white' 
                      : 'bg-[#E4E2DC] dark:bg-[#3A3A3A] text-[#6B6B6B]'
                  }`}
                >
                  Parallel
                </button>
              </div>
            </div>
            
            {pipelineMode === 'parallel' && pipelineAgents.length > 1 && (
              <div className="p-2 bg-[#F0F5FF] dark:bg-[#1A1A2E] border border-[#1B4FD8]/30 rounded text-xs text-[#1B4FD8]">
                ⚡ All agents will work simultaneously on the same task
              </div>
            )}
            
            {/* Current chain */}
            {pipelineAgents.length > 0 && (
              <div className="space-y-1">
                {pipelineAgents.map((agentId, idx) => {
                  const agent = agents[agentId];
                  if (!agent) return null;
                  return (
                    <div key={`${agentId}-${idx}`}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A]">
                        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] w-4 text-center font-mono">{idx + 1}.</span>
                        <span className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8] flex-1">{agent.name}</span>
                        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] uppercase">{agent.role}</span>
                        <div className="flex items-center gap-1 ml-1">
                          <button type="button" onClick={() => movePipelineStep(idx, -1)} disabled={idx === 0} className="p-0.5 text-[#A8A49E] hover:text-[#1A1A1A] disabled:opacity-20">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => movePipelineStep(idx, 1)} disabled={idx === pipelineAgents.length - 1} className="p-0.5 text-[#A8A49E] hover:text-[#1A1A1A] disabled:opacity-20">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => removeFromPipeline(idx)} className="p-0.5 text-[#A8A49E] hover:text-[#C1341A]">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {idx < pipelineAgents.length - 1 && (
                        <div className="flex justify-center py-0.5">
                          <ArrowRight className="h-3.5 w-3.5 text-[#1B4FD8]/50" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {pipelineAgents.length < 2 && (
              <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">Add at least 2 agents below to create a pipeline.</p>
            )}

            {/* Add agents */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              {agentEntries.map(([id, agent]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addToPipeline(id)}
                  className="flex items-center gap-2 px-3 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/60 text-left transition-colors"
                >
                  <span className="text-xs font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{agent.name}</span>
                  <Plus className="h-3 w-3 text-[#A8A49E] ml-auto" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single Mode: From / To */}
        {mode === 'single' && (
          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="section-label block mb-3">From</label>
              <select
                value={fromAgent}
                onChange={(e) => setFromAgent(e.target.value)}
                className="input-field"
              >
                <option value="">Select source...</option>
                {agentEntries.map(([id, agent]) => (
                  <option key={id} value={id}>
                    {agent.name} — {agent.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="section-label block mb-3">To</label>
              <select
                value={toAgent}
                onChange={(e) => {
                  setToAgent(e.target.value);
                  // Auto-enable delegate mode if selecting a parent agent
                  if (isParentAgent(e.target.value)) {
                    setDelegateMode(true);
                  }
                }}
                className="input-field"
              >
                <option value="">Select target...</option>
                {agentEntries.map(([id, agent]) => {
                  // In delegate mode, hide parent agents
                  if (delegateMode && isParentAgent(id)) return null;
                  return (
                    <option key={id} value={id}>
                      {agent.name} — {agent.role}
                    </option>
                  );
                })}
              </select>
              
              {/* Delegate Mode Toggle */}
              {toAgent && isParentAgent(toAgent) && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="delegateMode"
                    checked={delegateMode}
                    onChange={(e) => setDelegateMode(e.target.checked)}
                    className="w-4 h-4 accent-[#1B4FD8]"
                  />
                  <label htmlFor="delegateMode" className="text-xs text-[#6B6B6B] cursor-pointer">
                    Delegate to sub-agent
                  </label>
                  {delegateMode && (
                    <span className="text-xs text-[#1B4FD8] ml-auto">
                      {getSubAgents(toAgent).length} available
                    </span>
                  )}
                </div>
              )}
              
              {/* Sub-agent info when delegate mode is on */}
              {delegateMode && toAgent && (
                <div className="mt-2 p-2 bg-[#F0F5FF] dark:bg-[#1A1A2E] border border-[#1B4FD8]/30 rounded text-xs">
                  <span className="text-[#1B4FD8] font-medium">{agents[toAgent]?.name}</span> will delegate to:{' '}
                  {getSubAgents(toAgent).map(subId => agents[subId]?.name).filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task */}
        <div>
          <label className="section-label block mb-3">Task</label>
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What needs to be done?"
            className="input-field"
          />
        </div>

        {/* Context */}
        <div>
          <label className="section-label block mb-3">Context</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Background information, decisions made so far..."
            rows={3}
            className="input-field resize-none"
          />
        </div>

        {/* Decisions - single mode only */}
        {mode === 'single' && (
          <div>
            <label className="section-label block mb-3">Decisions</label>
            <div className="space-y-2">
              {decisions.map((d, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A] pb-2">
                  <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B] w-6">
                    {(i + 1).toString().padStart(2, '0')}.
                  </span>
                  <span className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] flex-1">{d}</span>
                  <button
                    type="button"
                    onClick={() => removeDecision(i)}
                    className="text-[#A8A49E] dark:text-[#6B6B6B] hover:text-[#C1341A] transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDecision}
                  onChange={(e) => setNewDecision(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDecision())}
                  placeholder="Add a decision..."
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={addDecision}
                  className="btn-secondary"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Next Steps - single mode only */}
        {mode === 'single' && (
          <div>
            <label className="section-label block mb-3">Next Steps</label>
            <div className="space-y-2">
              {nextSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A] pb-2">
                  <span className="text-[#1B4FD8]">→</span>
                  <span className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] flex-1">{s}</span>
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="text-[#A8A49E] dark:text-[#6B6B6B] hover:text-[#C1341A] transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
                  placeholder="Add a next step..."
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={addStep}
                  className="btn-secondary"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Priority */}
        <div>
          <label className="section-label block mb-3">Priority</label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`priority-box ${priority === p ? 'bg-[#1A1A1A] text-[#FAFAF8] border-[#1A1A1A] dark:bg-[#FAFAF8] dark:text-[#1A1A1A] dark:border-[#FAFAF8]' : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8]'}`}
              >
                {p.toUpperCase().charAt(0)}
              </button>
            ))}
          </div>
        </div>

        {/* File Upload - single mode only */}
        {mode === 'single' && (
          <div>
            <label className="section-label block mb-3">Attachments (Optional)</label>
            <div className="space-y-2">
              {files.length > 0 && (
                <div className="space-y-1 mb-2">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#FAFAF8] dark:bg-[#1A1A1A]">
                      <span className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-[#A8A49E] dark:text-[#6B6B6B] hover:text-[#C1341A] transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8] transition-colors cursor-pointer">
                <Plus className="h-4 w-4 text-[#A8A49E] dark:text-[#6B6B6B]" />
                <span className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">
                  {files.length === 0 ? 'Add files' : 'Add more files'}
                </span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting || (mode !== 'pipeline' && (!fromAgent || !toAgent))}
            className="btn-primary"
          >
            {isSubmitting ? 'Transmitting...' : mode === 'pipeline' ? 'Create Pipeline →' : 'Transmit Handoff →'}
          </button>
        </div>
      </form>

      {/* Templates View */}
      {mode === 'templates' && (
        <div className="space-y-6">
          {templatesLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#A8A49E]" />
            </div>
          )}

          {!templatesLoading && templates.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No templates found</p>
            </div>
          )}

          {!templatesLoading && templates.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Template List */}
              <div className="space-y-4">
                <h2 className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-4">
                  Available Templates
                </h2>
                {templates.map((template) => (
                  <div
                    key={template.key}
                    className={`border p-4 cursor-pointer transition-colors ${
                      selectedTemplate === template.key
                        ? 'border-[#1B4FD8] bg-[#1B4FD8]/5'
                        : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/50'
                    }`}
                    onClick={() => setSelectedTemplate(template.key)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8] mb-2">
                          {template.name}
                        </h3>
                        <div className="space-y-1">
                          {template.steps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-[#A8A49E] dark:text-[#6B6B6B]">{i + 1}.</span>
                              <span className="text-[#1A1A1A] dark:text-[#FAFAF8]">{step.from}</span>
                              <span className="text-[#A8A49E] dark:text-[#6B6B6B]">→</span>
                              <span className="text-[#1A1A1A] dark:text-[#FAFAF8]">{step.to}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-1 bg-[#E4E2DC] dark:bg-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E]">
                        {template.steps.length} steps
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Execution Form */}
              <div className="border border-[#E4E2DC] dark:border-[#3A3A3A] p-6">
                <h2 className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-4">
                  Execute Template
                </h2>

                {!selectedTemplate && (
                  <div className="text-center py-12 text-sm text-[#6B6B6B] dark:text-[#A8A49E]">
                    Select a template to execute
                  </div>
                )}

                {selectedTemplate && (
                  <div className="space-y-4">
                    <div>
                      <label className="section-label block mb-2">Task</label>
                      <textarea
                        value={templateTask}
                        onChange={(e) => setTemplateTask(e.target.value)}
                        placeholder="What needs to be done?"
                        rows={3}
                        className="input-field resize-none"
                      />
                    </div>

                    <div>
                      <label className="section-label block mb-2">Context (Optional)</label>
                      <textarea
                        value={templateContext}
                        onChange={(e) => setTemplateContext(e.target.value)}
                        placeholder="Background information..."
                        rows={3}
                        className="input-field resize-none"
                      />
                    </div>

                    <div>
                      <label className="section-label block mb-2">Priority</label>
                      <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setTemplatePriority(p)}
                            className={`flex-1 py-2 text-xs uppercase tracking-wider border transition-colors ${
                              templatePriority === p
                                ? 'border-[#1B4FD8] bg-[#1B4FD8] text-white'
                                : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/50'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="section-label block mb-2">Execution Mode</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRunMode('async')}
                          className={`flex-1 py-2 text-xs uppercase tracking-wider border transition-colors ${
                            runMode === 'async'
                              ? 'border-[#1B4FD8] bg-[#1B4FD8] text-white'
                              : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/50'
                          }`}
                        >
                          ⚡ Async
                        </button>
                        <button
                          type="button"
                          onClick={() => setRunMode('sequential')}
                          className={`flex-1 py-2 text-xs uppercase tracking-wider border transition-colors ${
                            runMode === 'sequential'
                              ? 'border-[#1B4FD8] bg-[#1B4FD8] text-white'
                              : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/50'
                          }`}
                        >
                          🔗 Sequential
                        </button>
                      </div>
                      <p className="text-xs text-[#6B6B6B] dark:text-[#A8A49E] mt-2">
                        {runMode === 'async'
                          ? 'All steps run in parallel immediately'
                          : 'Each step waits for previous to complete before starting'}
                      </p>
                    </div>

                    <button
                      onClick={() => selectedTemplate && executeTemplateHandler(selectedTemplate)}
                      disabled={!templateTask.trim() || executing === selectedTemplate}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {executing === selectedTemplate ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Execute Template
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
