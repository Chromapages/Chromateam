'use client';

import { useState, useCallback, useRef } from 'react';
import {
  BarChart3,
  Briefcase,
  Clapperboard,
  Headphones,
  Lightbulb,
  Megaphone,
  Palette,
  Search,
  Settings,
  Wrench,
  ArrowLeft,
  ArrowRight,
  Send,
  Sparkles,
  Users,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  AlertTriangle,
  Zap,
  X,
  Upload,
  FileText,
  Image,
  File,
  Trash2,
  GitBranch,
  ArrowDown,
  Plus,
  Minus,
} from 'lucide-react';
import { AgentsMap, Template } from '@/lib/types';
import {
  createHandoff,
  autoAssignTask,
  createParallelHandoffs,
  createHandoffWithFiles,
  createPipeline,
  fetchTemplates,
  executeTemplate,
  fetchAutocomplete,
  fetchSimilarTasks,
  scheduleHandoff,
  createConditionalHandoff,
} from '@/lib/api';

interface TaskWizardProps {
  agents: AgentsMap;
  preSelectedAgent?: string | null;
  preSelectedFrom?: string | null;
  preSelectedTo?: string | null;
  onClose: () => void;
  onComplete: () => void;
}

type WizardStep = 'task' | 'who' | 'review';
type UrgencyLevel = 'low' | 'medium' | 'high';
type SendMode = 'single' | 'multiple' | 'pipeline' | 'ai' | 'conditional' | 'scheduled';

function getRoleIcon(role: string) {
  const icons: Record<string, typeof Briefcase> = {
    Architect: Lightbulb,
    Developer: Briefcase,
    Marketing: Megaphone,
    Design: Palette,
    Video: Clapperboard,
    Research: Search,
    Support: Headphones,
    Markets: BarChart3,
    'GHL Wizard': Wrench,
    Operations: Settings,
  };
  return icons[role] || Briefcase;
}

export default function TaskWizard({
  agents,
  preSelectedAgent,
  preSelectedFrom,
  preSelectedTo,
  onClose,
  onComplete,
}: TaskWizardProps) {
  const [step, setStep] = useState<WizardStep>(
    preSelectedFrom && preSelectedTo ? 'review' : 'task'
  );
  const [task, setTask] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('pipeline');
  // single/multiple mode
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    preSelectedAgent ? [preSelectedAgent] : preSelectedTo ? [preSelectedTo] : []
  );
  const [fromAgent] = useState<string>(preSelectedFrom || 'chroma');
  // pipeline mode — ordered chain
  const [pipelineAgents, setPipelineAgents] = useState<string[]>(
    preSelectedFrom && preSelectedTo ? [preSelectedFrom, preSelectedTo] : []
  );
  const [urgency, setUrgency] = useState<UrgencyLevel>('medium');
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New states for unused endpoints
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const [similarTasks, setSimilarTasks] = useState<{id: string; task: string; agent: string; completed: boolean}[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [conditionalKeywords, setConditionalKeywords] = useState('');
  const [ifTrueAgent, setIfTrueAgent] = useState('');
  const [ifFalseAgent, setIfFalseAgent] = useState('');
  const autocompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const agentEntries = Object.entries(agents);

  const canProceedFromTask = task.trim().length > 0;
  const canProceedFromWho =
    sendMode === 'ai' ||
    (sendMode === 'pipeline' && pipelineAgents.length >= 2) ||
    (sendMode === 'single' && selectedAgents.length === 1) ||
    (sendMode === 'multiple' && selectedAgents.length > 1);

  // ---- pipeline helpers ----
  const addToPipeline = useCallback((agentId: string) => {
    setPipelineAgents((prev) => [...prev, agentId]);
  }, []);

  const removeFromPipeline = useCallback((index: number) => {
    setPipelineAgents((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const movePipelineStep = useCallback((index: number, dir: -1 | 1) => {
    setPipelineAgents((prev) => {
      const next = [...prev];
      const swapIdx = index + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  }, []);

  // ---- single/multiple helpers ----
  const handleAgentToggle = useCallback((agentId: string) => {
    if (sendMode === 'multiple') {
      setSelectedAgents((prev) =>
        prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]
      );
    } else {
      setSelectedAgents([agentId]);
    }
  }, [sendMode]);

  const handleLoadTemplates = useCallback(async () => {
    setShowTemplates((prev) => !prev);
    if (templates.length === 0) {
      try {
        const data = await fetchTemplates();
        setTemplates(data);
      } catch (err) {
        console.error('Failed to load templates:', err);
      }
    }
  }, [templates.length]);

  // ---- file helpers ----
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setAttachedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachedFiles((prev) => [...prev, ...(e.target.files ? Array.from(e.target.files) : [])]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type === 'application/pdf' || /\.(md|txt|doc|docx)$/.test(file.name)) return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ---- submit ----
  const handleSubmit = async () => {
    if (!task.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (sendMode === 'ai') {
        const result = await autoAssignTask({ task });
        alert(`Assigned to ${result.agentName}: ${result.reason}`);
      } else if (sendMode === 'pipeline') {
        await createPipeline({ agents: pipelineAgents, task, context: '', priority: urgency });
      } else if (sendMode === 'multiple' && selectedAgents.length > 1) {
        await createParallelHandoffs({ fromAgent, toAgents: selectedAgents, task, context: '', priority: urgency });
      } else if (sendMode === 'single' && selectedAgents.length === 1) {
        if (attachedFiles.length > 0) {
          await createHandoffWithFiles(
            { fromAgent, toAgent: selectedAgents[0], task, context: '', priority: urgency },
            attachedFiles
          );
        } else {
          await createHandoff({ fromAgent, toAgent: selectedAgents[0], task, context: '', decisions: [], nextSteps: [], priority: urgency });
        }
      } else if (sendMode === 'scheduled' && selectedAgents.length === 1 && scheduleTime) {
        await scheduleHandoff({
          fromAgent,
          toAgent: selectedAgents[0],
          task,
          context: '',
          scheduledAt: new Date(scheduleTime).toISOString(),
          priority: urgency
        });
        alert(`Task scheduled for ${new Date(scheduleTime).toLocaleString()}`);
      } else if (sendMode === 'conditional' && ifTrueAgent && ifFalseAgent) {
        const result = await createConditionalHandoff({
          trigger: task,
          condition: {
            type: 'keyword',
            keywords: conditionalKeywords.split(',').map(k => k.trim()).filter(Boolean)
          },
          ifTrue: ifTrueAgent,
          ifFalse: ifFalseAgent,
          context: ''
        });
        alert(`Conditional route: ${result.condition === 'met' ? ifTrueAgent : ifFalseAgent} (${result.condition})`);
      }
      onComplete();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
      console.error('Failed to send task:', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNext = () => {
    if (step === 'task') setStep('who');
    else if (step === 'who') setStep('review');
  };

  const goBack = () => {
    if (step === 'who') setStep('task');
    else if (step === 'review') setStep('who');
  };

  const stepIndex = step === 'task' ? 0 : step === 'who' ? 1 : 2;

  return (
    <div className="flex flex-col h-full">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-3 py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === stepIndex
                ? 'w-8 bg-[#1B4FD8]'
                : i < stepIndex
                ? 'w-2 bg-[#1B4FD8]/40'
                : 'w-2 bg-[#E4E2DC] dark:bg-[#3A3A3A]'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* STEP 1: What needs to be done? */}
        {step === 'task' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-[#FAFAF8] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                What needs to be done?
              </h3>
              <p className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">
                Describe the task in your own words.
              </p>
            </div>

            <textarea
              value={task}
              onChange={(e) => {
                const value = e.target.value;
                setTask(value);
                
                // Fetch autocomplete suggestions
                if (value.length >= 2) {
                  if (autocompleteTimeoutRef.current) clearTimeout(autocompleteTimeoutRef.current);
                  autocompleteTimeoutRef.current = setTimeout(async () => {
                    try {
                      const data = await fetchAutocomplete(value);
                      setAutocompleteSuggestions(data.suggestions || []);
                      setShowAutocomplete(data.suggestions?.length > 0);
                      
                      // Also fetch similar tasks
                      const similar = await fetchSimilarTasks(value);
                      setSimilarTasks(similar.similar || []);
                    } catch {
                      // silently fail
                    }
                  }, 300);
                } else {
                  setShowAutocomplete(false);
                  setAutocompleteSuggestions([]);
                }
              }}
              placeholder="e.g., Design the new landing page for the product launch"
              rows={5}
              autoFocus
              className="w-full px-4 py-3 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] text-sm placeholder:text-[#A8A49E] dark:placeholder:text-[#6B6B6B] focus:outline-none focus:border-[#1B4FD8] resize-none transition-colors"
            />
            
            {/* Autocomplete suggestions */}
            {showAutocomplete && autocompleteSuggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] shadow-lg mt-1">
                {autocompleteSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setTask(suggestion + task.slice(suggestion.length));
                      setShowAutocomplete(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-[#1A1A1A] dark:text-[#FAFAF8] hover:bg-[#F5F5F3] dark:hover:bg-[#2A2A2A] transition-colors"
                  >
                    <span className="text-[#1B4FD8]">{suggestion.slice(0, task.length)}</span>
                    <span>{suggestion.slice(task.length)}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Similar tasks */}
            {similarTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">Similar completed tasks:</p>
                {similarTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-xs">
                    <span className={t.completed ? 'text-[#1B7A4A]' : 'text-[#A07020]'}>
                      {t.completed ? '✓' : '○'}
                    </span>
                    <span className="flex-1 truncate">{t.task}</span>
                    <span className="text-[#A8A49E] capitalize">{t.agent}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Saved workflows / templates */}
            <button
              onClick={handleLoadTemplates}
              className="flex items-center gap-2 text-sm text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1B4FD8] dark:hover:text-[#1B4FD8] transition-colors"
            >
              {showTemplates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Or pick a saved workflow
            </button>

            {showTemplates && templates.length > 0 && (
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.name}
                    onClick={async () => {
                      if (!task.trim()) {
                        setTask(`Run ${t.name} workflow`);
                      }
                      try {
                        await executeTemplate(t.name, { task: task || `Run ${t.name}`, context: '' });
                        onComplete();
                        onClose();
                      } catch (err) {
                        console.error('Template failed:', err);
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8] transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8] capitalize">{t.name.replace(/-/g, ' ')}</span>
                    <span className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">{String(t.steps.length)} steps</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Build the pipeline / pick who */}
        {step === 'who' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-[#FAFAF8] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Build the pipeline
              </h3>
              <p className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">
                Choose how to route this task.
              </p>
            </div>

            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { mode: 'pipeline' as SendMode, icon: GitBranch, label: 'Pipeline', desc: 'A → B → C chain' },
                { mode: 'single' as SendMode, icon: ArrowRight, label: 'Single Agent', desc: 'One person' },
                { mode: 'multiple' as SendMode, icon: Users, label: 'Parallel', desc: 'Same task, many' },
                { mode: 'ai' as SendMode, icon: Sparkles, label: 'AI Picks', desc: 'Auto-route' },
                { mode: 'scheduled' as SendMode, icon: Clock, label: 'Scheduled', desc: 'Future time' },
                { mode: 'conditional' as SendMode, icon: AlertTriangle, label: 'Conditional', desc: 'Smart routing' },
              ]).map(({ mode, icon: Icon, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => setSendMode(mode)}
                  className={`flex items-center gap-3 px-3 py-3 border transition-colors text-left ${
                    sendMode === mode
                      ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10'
                      : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/40 bg-white dark:bg-[#242424]'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${sendMode === mode ? 'text-[#1B4FD8]' : 'text-[#6B6B6B] dark:text-[#A8A49E]'}`} strokeWidth={1.5} />
                  <div>
                    <div className="text-xs font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">{label}</div>
                    <div className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">{desc}</div>
                  </div>
                  {sendMode === mode && <Check className="h-3.5 w-3.5 text-[#1B4FD8] ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>

            {/* PIPELINE MODE */}
            {sendMode === 'pipeline' && (
              <div className="space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">
                  Chain order — task flows top to bottom
                </span>

                {/* Current chain */}
                {pipelineAgents.length > 0 && (
                  <div className="space-y-1">
                    {pipelineAgents.map((agentId, idx) => {
                      const agent = agents[agentId];
                      if (!agent) return null;
                      const Icon = getRoleIcon(agent.role);
                      return (
                        <div key={`${agentId}-${idx}`}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A]">
                            <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] w-4 text-center font-mono">{idx + 1}</span>
                            <Icon className="h-4 w-4 text-[#1B4FD8] flex-shrink-0" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8] flex-1">{agent.name}</span>
                            <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] uppercase">{agent.role}</span>
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => movePipelineStep(idx, -1)}
                                disabled={idx === 0}
                                className="p-0.5 text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] disabled:opacity-20 transition-colors"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => movePipelineStep(idx, 1)}
                                disabled={idx === pipelineAgents.length - 1}
                                className="p-0.5 text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] disabled:opacity-20 transition-colors"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => removeFromPipeline(idx)}
                                className="p-0.5 text-[#A8A49E] hover:text-[#C1341A] transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {idx < pipelineAgents.length - 1 && (
                            <div className="flex justify-center py-0.5">
                              <ArrowDown className="h-3.5 w-3.5 text-[#1B4FD8]/50" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {pipelineAgents.length < 2 && (
                  <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">
                    Add at least 2 agents below to create a pipeline.
                  </p>
                )}

                {/* Add agents */}
                <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] block pt-1">
                  Add to pipeline
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {agentEntries.map(([id, agent]) => {
                    const Icon = getRoleIcon(agent.role);
                    return (
                      <button
                        key={id}
                        onClick={() => addToPipeline(id)}
                        className="flex items-center gap-2 px-3 py-2.5 border border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/60 bg-white dark:bg-[#242424] transition-colors text-left"
                      >
                        <Icon className="h-4 w-4 text-[#6B6B6B] dark:text-[#A8A49E] flex-shrink-0" strokeWidth={1.5} />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#1A1A1A] dark:text-[#FAFAF8] truncate">{agent.name}</div>
                          <div className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] uppercase">{agent.role}</div>
                        </div>
                        <Plus className="h-3.5 w-3.5 text-[#A8A49E] ml-auto flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SINGLE / MULTIPLE MODE */}
            {(sendMode === 'single' || sendMode === 'multiple') && (
              <div className="space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">
                  {sendMode === 'single' ? 'Pick one agent' : 'Pick agents (same task sent to all)'}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {agentEntries.map(([id, agent]) => {
                    const Icon = getRoleIcon(agent.role);
                    const isSelected = selectedAgents.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => handleAgentToggle(id)}
                        className={`relative flex flex-col items-center gap-2 p-4 border transition-all duration-200 ${
                          isSelected
                            ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10'
                            : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/50 bg-white dark:bg-[#242424]'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 h-5 w-5 bg-[#1B4FD8] flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                          </div>
                        )}
                        <span className="flex h-10 w-10 items-center justify-center border border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#FAFAF8] dark:bg-[#1A1A1A]">
                          <Icon className="h-5 w-5 text-[#1A1A1A] dark:text-[#FAFAF8]" strokeWidth={1.5} />
                        </span>
                        <span className="text-xs font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">{agent.name}</span>
                        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] uppercase tracking-wider">{agent.role}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI MODE */}
            {sendMode === 'ai' && (
              <div className="px-4 py-5 border border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#FAFAF8] dark:bg-[#1A1A1A] text-center space-y-2">
                <Sparkles className="h-8 w-8 text-[#1B4FD8] mx-auto" strokeWidth={1.5} />
                <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] font-medium">AI will route this automatically</p>
                <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">Based on task keywords and agent workload.</p>
              </div>
            )}

            {/* SCHEDULED MODE */}
            {sendMode === 'scheduled' && (
              <div className="space-y-4">
                <div className="px-4 py-5 border border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#FAFAF8] dark:bg-[#1A1A1A] text-center space-y-2">
                  <Clock className="h-8 w-8 text-[#1B4FD8] mx-auto" strokeWidth={1.5} />
                  <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] font-medium">Schedule for later</p>
                </div>
                
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] block mb-2">
                    Schedule Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] text-sm focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] block mb-2">
                    Target Agent
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {agentEntries.map(([id, agent]) => {
                      const Icon = getRoleIcon(agent.role);
                      const isSelected = selectedAgents.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => setSelectedAgents([id])}
                          className={`flex items-center gap-2 px-3 py-2 border transition-colors text-left ${
                            isSelected
                              ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10'
                              : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/60 bg-white dark:bg-[#242424]'
                          }`}
                        >
                          <Icon className="h-4 w-4 text-[#6B6B6B] dark:text-[#A8A49E]" strokeWidth={1.5} />
                          <span className="text-xs text-[#1A1A1A] dark:text-[#FAFAF8]">{agent.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* CONDITIONAL MODE */}
            {sendMode === 'conditional' && (
              <div className="space-y-4">
                <div className="px-4 py-5 border border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#FAFAF8] dark:bg-[#1A1A1A] text-center space-y-2">
                  <AlertTriangle className="h-8 w-8 text-[#A07020] mx-auto" strokeWidth={1.5} />
                  <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] font-medium">Smart keyword routing</p>
                  <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">Route based on task content.</p>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] block mb-2">
                    Keywords (comma separated)
                  </label>
                  <input
                    type="text"
                    value={conditionalKeywords}
                    onChange={(e) => setConditionalKeywords(e.target.value)}
                    placeholder="e.g., urgent, bug, design"
                    className="w-full px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] text-sm placeholder:text-[#A8A49E] focus:outline-none focus:border-[#1B4FD8]"
                  />
                  <p className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] mt-1">
                    If task contains these keywords → True agent, else → False agent
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#1B7A4A] block mb-2">
                      If Match (True)
                    </label>
                    <select
                      value={ifTrueAgent}
                      onChange={(e) => setIfTrueAgent(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] text-sm focus:outline-none focus:border-[#1B4FD8]"
                    >
                      <option value="">Select agent...</option>
                      {agentEntries.map(([id, agent]) => (
                        <option key={id} value={id}>{agent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#C1341A] block mb-2">
                      If No Match (False)
                    </label>
                    <select
                      value={ifFalseAgent}
                      onChange={(e) => setIfFalseAgent(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] text-sm focus:outline-none focus:border-[#1B4FD8]"
                    >
                      <option value="">Select agent...</option>
                      {agentEntries.map(([id, agent]) => (
                        <option key={id} value={id}>{agent.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Review & Send */}
        {step === 'review' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-[#FAFAF8] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Review & Send
              </h3>
              <p className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">
                Almost there. Confirm the details.
              </p>
            </div>

            {/* Summary card */}
            <div className="border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Task</span>
                <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] mt-1">{task}</p>
              </div>
              <div className="border-t border-[#E4E2DC] dark:border-[#3A3A3A] pt-3">
                <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">
                  {sendMode === 'ai' ? 'Routed by' : sendMode === 'pipeline' ? 'Pipeline' : sendMode === 'multiple' ? 'Parallel to' : 'Assigned to'}
                </span>
                <div className="mt-2">
                  {sendMode === 'ai' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] w-fit">
                      <Sparkles className="h-4 w-4 text-[#1B4FD8]" strokeWidth={1.5} />
                      <span className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8]">AI Auto-Pick</span>
                    </div>
                  )}
                  {sendMode === 'pipeline' && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {pipelineAgents.map((id, idx) => {
                        const agent = agents[id];
                        if (!agent) return null;
                        const Icon = getRoleIcon(agent.role);
                        return (
                          <div key={`review-${id}-${idx}`} className="flex items-center gap-1">
                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A]">
                              <Icon className="h-3.5 w-3.5 text-[#1B4FD8]" strokeWidth={1.5} />
                              <span className="text-xs text-[#1A1A1A] dark:text-[#FAFAF8]">{agent.name}</span>
                            </div>
                            {idx < pipelineAgents.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-[#1B4FD8]/60 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {(sendMode === 'single' || sendMode === 'multiple') && (
                    <div className="flex flex-wrap gap-2">
                      {selectedAgents.map((id) => {
                        const agent = agents[id];
                        if (!agent) return null;
                        const Icon = getRoleIcon(agent.role);
                        return (
                          <div key={id} className="flex items-center gap-2 px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A]">
                            <Icon className="h-4 w-4 text-[#1A1A1A] dark:text-[#FAFAF8]" strokeWidth={1.5} />
                            <span className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8]">{agent.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Urgency selection */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] block mb-3">How urgent is this?</span>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 'low' as UrgencyLevel, label: 'Whenever', icon: Clock, color: 'text-[#1B7A4A]', border: 'border-[#1B7A4A]', bg: 'bg-[#1B7A4A]/5 dark:bg-[#1B7A4A]/10' },
                  { value: 'medium' as UrgencyLevel, label: 'Soon', icon: AlertTriangle, color: 'text-[#A07020]', border: 'border-[#A07020]', bg: 'bg-[#A07020]/5 dark:bg-[#A07020]/10' },
                  { value: 'high' as UrgencyLevel, label: 'ASAP', icon: Zap, color: 'text-[#C1341A]', border: 'border-[#C1341A]', bg: 'bg-[#C1341A]/5 dark:bg-[#C1341A]/10' },
                ]).map(({ value, label, icon: UrgIcon, color, border, bg }) => (
                  <button
                    key={value}
                    onClick={() => setUrgency(value)}
                    className={`flex flex-col items-center gap-2 py-4 px-3 border transition-all duration-200 ${
                      urgency === value
                        ? `${border} ${bg}`
                        : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#6B6B6B]'
                    }`}
                  >
                    <UrgIcon className={`h-5 w-5 ${urgency === value ? color : 'text-[#A8A49E] dark:text-[#6B6B6B]'}`} strokeWidth={1.5} />
                    <span className={`text-xs font-medium uppercase tracking-wider ${urgency === value ? color : 'text-[#6B6B6B] dark:text-[#A8A49E]'}`}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* File attachments (progressive disclosure) */}
            <button
              onClick={() => setShowAttachments(!showAttachments)}
              className="flex items-center gap-2 text-sm text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1B4FD8] dark:hover:text-[#1B4FD8] transition-colors"
            >
              {showAttachments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {attachedFiles.length > 0 ? `Attachments (${attachedFiles.length})` : 'Attach files'}
            </button>

            {showAttachments && (
              <div className="space-y-3">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 py-6 px-4 border-2 border-dashed cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 dark:bg-[#1B4FD8]/10'
                      : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/50 bg-[#FAFAF8] dark:bg-[#1A1A1A]'
                  }`}
                >
                  <Upload className={`h-6 w-6 ${isDragging ? 'text-[#1B4FD8]' : 'text-[#A8A49E] dark:text-[#6B6B6B]'}`} strokeWidth={1.5} />
                  <div className="text-center">
                    <span className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8]">Drop files here</span>
                    <span className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]"> or click to browse</span>
                  </div>
                  <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] uppercase tracking-wider">
                    PDF, Markdown, Images, Code — up to 50MB
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.md,.txt,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.svg,.json,.csv,.html,.css,.js,.ts,.tsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* File list */}
                {attachedFiles.length > 0 && (
                  <div className="space-y-2">
                    {attachedFiles.map((file, index) => {
                      const FileIcon = getFileIcon(file);
                      return (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-3 px-3 py-2 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A]"
                        >
                          <FileIcon className="h-4 w-4 text-[#1B4FD8] flex-shrink-0" strokeWidth={1.5} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] truncate">{file.name}</p>
                            <p className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">{formatFileSize(file.size)}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                            className="flex-shrink-0 p-1 text-[#A8A49E] hover:text-[#C1341A] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {submitError && (
              <div className="px-4 py-3 border border-[#C1341A]/30 bg-[#C1341A]/5 text-sm text-[#C1341A]">
                {submitError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="border-t border-[#E4E2DC] dark:border-[#3A3A3A] px-5 py-4 flex items-center justify-between">
        {step === 'task' ? (
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] transition-colors"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : (
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {step === 'review' ? (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1B4FD8] text-white text-sm font-medium uppercase tracking-wider hover:bg-[#3B64DD] disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              'Sending...'
            ) : (
              <>
                <Send className="h-4 w-4" strokeWidth={1.5} />
                Send Task
              </>
            )}
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={step === 'task' ? !canProceedFromTask : !canProceedFromWho}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1B4FD8] text-white text-sm font-medium uppercase tracking-wider hover:bg-[#3B64DD] disabled:opacity-50 transition-colors"
          >
            Continue
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
