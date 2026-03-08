'use client';

import { useEffect, useState } from 'react';
import { fetchAgents, createHandoff, createPipeline } from '@/lib/api';
import { AgentsMap, CreateHandoffPayload } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { GitBranch, ArrowRight, Plus, X, ChevronUp, ChevronDown } from 'lucide-react';

type Mode = 'single' | 'pipeline';

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

  useEffect(() => {
    fetchAgents().then(setAgents).catch(console.error);
  }, []);

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
        });
        setFeedback({
          type: 'success',
          message: `Pipeline created: ${result.steps} steps, ID: ${result.pipelineId}`,
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
      <PageHeader title="Dispatch Handoff" subtitle="Transfer a task between agents with full context" />

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
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Pipeline Mode: Agent Chain */}
        {mode === 'pipeline' && (
          <div className="space-y-4">
            <label className="section-label block">Agent Chain</label>
            
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
                onChange={(e) => setToAgent(e.target.value)}
                className="input-field"
              >
                <option value="">Select target...</option>
                {agentEntries.map(([id, agent]) => (
                  <option key={id} value={id}>
                    {agent.name} — {agent.role}
                  </option>
                ))}
              </select>
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
            disabled={isSubmitting || !fromAgent || !toAgent}
            className="btn-primary"
          >
            {isSubmitting ? 'Transmitting...' : 'Transmit Handoff →'}
          </button>
        </div>
      </form>
    </div>
  );
}
