'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';
import {
  fetchAllHandoffs,
  fetchSchedules,
  fetchAutomations,
  deleteSchedule,
  runAutomation,
  fetchHandoffDeliverables,
  cancelHandoff,
  DeliverableFile,
  WS_BASE,
  API_ORIGIN,
} from '@/lib/api';
import { Handoff, Schedule, Automation } from '@/lib/types';
import {
  Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Play,
  Calendar, Zap, ArrowRight, Trash2, Filter, Search, ChevronDown,
  MoreHorizontal, User, Circle, Activity, Folder, FileText, X, Ban,
  ChevronUp, LayoutGrid, List,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useWebSocket } from '@/lib/useWebSocket';

// ============================
// Types
// ============================

type JobType = 'handoff' | 'schedule' | 'automation';
type KanbanColumn = 'scheduled' | 'active' | 'completed' | 'failed';

interface KanbanJob {
  id: string;
  type: JobType;
  title: string;
  subtitle?: string;
  agent?: string;
  fromAgent?: string;
  priority?: 'low' | 'medium' | 'high';
  column: KanbanColumn;
  createdAt: number;
  meta?: string;
  raw: Handoff | Schedule | Automation;
}

// ============================
// Priority pill config
// ============================

const PRIORITY_PILL: Record<string, { label: string; classes: string }> = {
  high:   { label: 'High',   classes: 'border-[#C1341A]/40 text-[#C1341A]' },
  medium: { label: 'Med',    classes: 'border-[#A07020]/40 text-[#A07020]' },
  low:    { label: 'Low',    classes: 'border-[#1B7A4A]/40 text-[#1B7A4A]' },
};

const TYPE_ICON: Record<JobType, React.ElementType> = {
  handoff:    ArrowRight,
  schedule:   Calendar,
  automation: Zap,
};

const TYPE_LABEL: Record<JobType, string> = {
  handoff:    'Handoff',
  schedule:   'Schedule',
  automation: 'Automation',
};

const COLUMN_CONFIG: Record<KanbanColumn, {
  label: string;
  accent: string;
  bg: string;
  icon: React.ElementType;
  textColor: string;
}> = {
  scheduled: {
    label:     'Scheduled',
    accent:    'border-t-[#1B4FD8]',
    bg:        'bg-[#F5F5F8] dark:bg-[#1A1F2E]',
    icon:      Clock,
    textColor: 'text-[#1B4FD8]',
  },
  active: {
    label:     'Active',
    accent:    'border-t-[#A07020]',
    bg:        'bg-[#F8F6F0] dark:bg-[#1E1A0A]',
    icon:      Activity,
    textColor: 'text-[#A07020]',
  },
  completed: {
    label:     'Completed',
    accent:    'border-t-[#1B7A4A]',
    bg:        'bg-[#F0F8F4] dark:bg-[#0A1E14]',
    icon:      CheckCircle,
    textColor: 'text-[#1B7A4A]',
  },
  failed: {
    label:     'Failed / Cancelled',
    accent:    'border-t-[#C1341A]',
    bg:        'bg-[#FAF0EE] dark:bg-[#1E0A0A]',
    icon:      XCircle,
    textColor: 'text-[#C1341A]',
  },
};

const COLUMN_ORDER: KanbanColumn[] = ['scheduled', 'active', 'completed', 'failed'];

// ============================
// Helpers
// ============================

function relativeTime(ts: number | string | undefined): string {
  if (!ts) return '';
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diff = Date.now() - ms;
  const abs  = Math.abs(diff);
  const s    = Math.floor(abs / 1000);
  const m    = Math.floor(s / 60);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  if (d > 0)  return `${d}d ${diff > 0 ? 'ago' : 'from now'}`;
  if (h > 0)  return `${h}h ${diff > 0 ? 'ago' : 'from now'}`;
  if (m > 0)  return `${m}m ${diff > 0 ? 'ago' : 'from now'}`;
  return `${s}s ago`;
}

// Convert raw data → KanbanJob
function handoffToJob(h: Handoff): KanbanJob {
  let column: KanbanColumn = 'scheduled';
  if (h.status === 'in_progress')                    column = 'active';
  else if (h.status === 'completed')                  column = 'completed';
  else if (h.status === 'failed' || h.status === 'cancelled') column = 'failed';
  else                                                column = 'scheduled';

  return {
    id:        h.id,
    type:      'handoff',
    title:     h.task?.substring(0, 60) || 'Untitled handoff',
    subtitle:  `${h.fromAgent} → ${h.toAgent}`,
    agent:     h.toAgent,
    fromAgent: h.fromAgent,
    priority:  h.priority as KanbanJob['priority'],
    column,
    createdAt: new Date(h.createdAt).getTime(),
    meta:      relativeTime(h.createdAt),
    raw:       h,
  };
}

function scheduleToJob(s: Schedule): KanbanJob {
  const now      = Date.now();
  const nextRun  = s.nextRun || new Date(s.scheduledAt).getTime();
  const hasRun   = (s.executions ?? 0) > 0;
  const column: KanbanColumn = nextRun > now ? 'scheduled' : (hasRun ? 'completed' : 'scheduled');

  return {
    id:       s.id,
    type:     'schedule',
    title:    s.name || s.task?.substring(0, 60) || 'Untitled schedule',
    subtitle: s.cron ? `Cron: ${s.cron}` : `Runs: ${new Date(s.scheduledAt).toLocaleDateString()}`,
    agent:    s.toAgent,
    priority: s.priority as KanbanJob['priority'],
    column,
    createdAt: s.createdAt,
    meta:     `${s.executions ?? 0} run${(s.executions ?? 0) !== 1 ? 's' : ''}`,
    raw:      s,
  };
}

function automationToJob(a: Automation): KanbanJob {
  return {
    id:       a.id,
    type:     'automation',
    title:    a.name,
    subtitle: a.description || `${a.steps.length} steps`,
    column:   'scheduled',
    createdAt: a.createdAt,
    meta:     `${a.steps.length} step${a.steps.length !== 1 ? 's' : ''}`,
    raw:      a,
  };
}

// ============================
// Sub-components
// ============================

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-3 space-y-2">
      <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded w-3/4" />
      <div className="h-2 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded w-1/2" />
      <div className="h-2 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded w-1/4" />
    </div>
  );
}

interface JobCardProps {
  job: KanbanJob;
  onDelete: (job: KanbanJob) => void;
  onRun: (job: KanbanJob) => void;
  runningId: string | null;
}

function JobCard({ job, onDelete, onRun, runningId }: JobCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const TypeIcon = TYPE_ICON[job.type];
  const pill = job.priority ? PRIORITY_PILL[job.priority] : null;

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="group bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-3 hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors cursor-default">
      {/* Top row: type badge + priority + menu */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">
            <TypeIcon className="h-3 w-3" strokeWidth={1.5} />
            {TYPE_LABEL[job.type]}
          </span>
          {pill && (
            <span className={`text-[9px] uppercase tracking-wider border px-1.5 py-0.5 ${pill.classes}`}>
              {pill.label}
            </span>
          )}
        </div>

        {/* Context menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="opacity-0 group-hover:opacity-100 p-1 text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] transition-all"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-5 z-30 bg-white dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] shadow-lg min-w-[110px]">
              {(job.type === 'automation' || job.type === 'schedule') && (
                <button
                  onClick={() => { setMenuOpen(false); onRun(job); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#1A1A1A] dark:text-[#FAFAF8] hover:bg-[#E4E2DC] dark:hover:bg-[#3A3A3A] transition-colors"
                >
                  <Play className="h-3 w-3" />
                  Run now
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); onDelete(job); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#C1341A] hover:bg-[#FAF0EE] dark:hover:bg-[#3A0A0A] transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] font-medium leading-snug mb-1 line-clamp-2">
        {job.title}
      </p>

      {/* Subtitle */}
      {job.subtitle && (
        <p className="text-[11px] text-[#6B6B6B] dark:text-[#A8A49E] mb-2 truncate">
          {job.subtitle}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E4E2DC]/60 dark:border-[#3A3A3A]/60">
        {job.agent ? (
          <span className="flex items-center gap-1 text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">
            <User className="h-3 w-3" />
            {job.agent}
          </span>
        ) : <span />}
        <div className="flex items-center gap-2">
          {runningId === job.id && (
            <RefreshCw className="h-3 w-3 text-[#1B4FD8] animate-spin" />
          )}
          {job.meta && (
            <span className="text-[10px] font-mono text-[#A8A49E] dark:text-[#6B6B6B]">
              {job.meta}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  column: KanbanColumn;
  jobs: KanbanJob[];
  isLoading: boolean;
  onDelete: (job: KanbanJob) => void;
  onRun: (job: KanbanJob) => void;
  runningId: string | null;
}

function KanbanColumnView({ column, jobs, isLoading, onDelete, onRun, runningId }: KanbanColumnProps) {
  const cfg = COLUMN_CONFIG[column];
  const ColIcon = cfg.icon;

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className={`border-t-2 ${cfg.accent} bg-white dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] border-t-0 px-3 py-2.5 mb-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ColIcon className={`h-4 w-4 ${cfg.textColor}`} strokeWidth={1.5} />
            <span className="text-xs font-bold uppercase tracking-widest text-[#1A1A1A] dark:text-[#FAFAF8]">
              {cfg.label}
            </span>
          </div>
          <span className={`text-xs font-mono font-bold ${cfg.textColor}`}>
            {isLoading ? '—' : jobs.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className={`flex-1 rounded-sm p-2 space-y-2 min-h-[200px] ${cfg.bg}`}>
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 text-center">
            <Circle className="h-5 w-5 text-[#E4E2DC] dark:text-[#3A3A3A] mb-2" strokeWidth={1} />
            <p className="text-[11px] text-[#A8A49E] dark:text-[#6B6B6B]">Nothing here</p>
          </div>
        ) : (
          jobs.map(job => (
            <JobCard
              key={`${job.type}-${job.id}`}
              job={job}
              onDelete={onDelete}
              onRun={onRun}
              runningId={runningId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================
// Main Page
// ============================

type ViewMode = 'board' | 'chronicle';
type ChronicleFilter = 'all' | 'pending' | 'completed';

export default function BoardPage() {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [jobs, setJobs] = useState<KanbanJob[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('board');

  // Board filter state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<JobType | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Chronicle filter state
  const [chronicleFilter, setChronicleFilter] = useState<ChronicleFilter>('all');

  // ── Data loading ──────────────────────────────────────
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rawHandoffs, schedules, automations] = await Promise.all([
        fetchAllHandoffs(),
        fetchSchedules(),
        fetchAutomations(),
      ]);

      // Sorted for chronicle
      const sorted = [...rawHandoffs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setHandoffs(sorted);

      // Mapped for board
      const mapped: KanbanJob[] = [
        ...rawHandoffs.map(handoffToJob),
        ...schedules.map(scheduleToJob),
        ...automations.map(automationToJob),
      ].sort((a, b) => b.createdAt - a.createdAt);
      setJobs(mapped);
    } catch {
      showToast('Failed to load data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // ── WebSocket (live updates for Chronicle) ────────────
  const handleWebSocketMessage = useCallback((message: { type: string; handoff: Handoff }) => {
    setHandoffs(prev => {
      const existing = prev.find(h => h.id === message.handoff.id);
      if (message.type === 'created' && !existing) {
        return [message.handoff, ...prev].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else if (existing) {
        return prev.map(h => h.id === message.handoff.id ? message.handoff : h);
      }
      return prev;
    });
    // Also refresh board jobs for handoff updates
    setJobs(prev => {
      const updated = handoffToJob(message.handoff);
      const exists = prev.find(j => j.id === message.handoff.id && j.type === 'handoff');
      if (message.type === 'created' && !exists) return [updated, ...prev];
      if (exists) return prev.map(j => j.id === message.handoff.id && j.type === 'handoff' ? updated : j);
      return prev;
    });
  }, []);

  useWebSocket(WS_BASE, handleWebSocketMessage);

  // ── Board handlers ────────────────────────────────────
  const handleDelete = useCallback(async (job: KanbanJob) => {
    if (!confirm(`Delete "${job.title.substring(0, 40)}"?`)) return;
    try {
      if (job.type === 'schedule') {
        await deleteSchedule(job.id);
        showToast('Schedule deleted', 'success');
      } else if (job.type === 'automation') {
        const { deleteAutomation } = await import('@/lib/api');
        await deleteAutomation(job.id);
        showToast('Automation deleted', 'success');
      } else {
        showToast('Handoffs must be cancelled from the Chronicle view', 'error');
        return;
      }
      loadAll();
    } catch {
      showToast('Delete failed', 'error');
    }
  }, [loadAll, showToast]);

  const handleRun = useCallback(async (job: KanbanJob) => {
    if (job.type !== 'automation') return;
    setRunningId(job.id);
    try {
      await runAutomation(job.id);
      showToast(`"${job.title}" executed`, 'success');
    } catch {
      showToast('Execution failed', 'error');
    } finally {
      setRunningId(null);
    }
  }, [showToast]);

  // ── Chronicle handler ─────────────────────────────────
  const handleCancel = useCallback(async (id: string) => {
    try {
      await cancelHandoff(id);
      setHandoffs(prev => prev.filter(h => h.id !== id));
      setJobs(prev => prev.filter(j => !(j.id === id && j.type === 'handoff')));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel', 'error');
    }
  }, [showToast]);

  // ── Board filtering ───────────────────────────────────
  const filteredJobs = jobs.filter(job => {
    if (filterType !== 'all' && job.type !== filterType) return false;
    if (filterPriority !== 'all' && job.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        job.title.toLowerCase().includes(q) ||
        (job.subtitle?.toLowerCase().includes(q) ?? false) ||
        (job.agent?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const byColumn = COLUMN_ORDER.reduce((acc, col) => {
    acc[col] = filteredJobs.filter(j => j.column === col);
    return acc;
  }, {} as Record<KanbanColumn, KanbanJob[]>);

  // ── Chronicle filtering ───────────────────────────────
  const filteredHandoffs = chronicleFilter === 'all'
    ? handoffs
    : handoffs.filter(h => h.status === chronicleFilter);

  const pendingCount   = handoffs.filter(h => h.status === 'pending').length;
  const completedCount = handoffs.filter(h => h.status === 'completed').length;

  // ── Stats ─────────────────────────────────────────────
  const totalJobs  = jobs.length;
  const activeJobs = jobs.filter(j => j.column === 'active').length;
  const doneJobs   = jobs.filter(j => j.column === 'completed').length;
  const failedJobs = jobs.filter(j => j.column === 'failed').length;

  return (
    <div>
      <PageHeader
        title="Board"
        subtitle={`${totalJobs} total · ${activeJobs} active · ${doneJobs} completed · ${failedJobs} failed`}
      />

      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between mb-6">
        {/* View toggle */}
        <div className="flex items-center border border-[#E4E2DC] dark:border-[#3A3A3A]">
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-wider transition-colors ${
              viewMode === 'board'
                ? 'bg-[#1A1A1A] dark:bg-[#FAFAF8] text-white dark:text-[#1A1A1A]'
                : 'text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            onClick={() => setViewMode('chronicle')}
            className={`flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-wider transition-colors border-l border-[#E4E2DC] dark:border-[#3A3A3A] ${
              viewMode === 'chronicle'
                ? 'bg-[#1A1A1A] dark:bg-[#FAFAF8] text-white dark:text-[#1A1A1A]'
                : 'text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Chronicle
            {pendingCount > 0 && (
              <span className="font-mono text-[#1B4FD8] ml-0.5">{pendingCount}</span>
            )}
          </button>
        </div>

        {/* Right: stats + refresh */}
        <div className="flex items-center gap-4">
          {viewMode === 'board' && (
            <div className="flex items-center gap-3">
              {[
                { label: 'Handoffs',    count: jobs.filter(j => j.type === 'handoff').length,    color: 'text-[#1B4FD8]' },
                { label: 'Schedules',   count: jobs.filter(j => j.type === 'schedule').length,   color: 'text-[#A07020]' },
                { label: 'Automations', count: jobs.filter(j => j.type === 'automation').length, color: 'text-[#1B7A4A]' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1 text-xs text-[#6B6B6B] dark:text-[#A8A49E]">
                  <span className={`font-bold font-mono ${s.color}`}>{s.count}</span>
                  {s.label}
                </div>
              ))}
            </div>
          )}
          {viewMode === 'chronicle' && (
            <div className="flex items-center gap-3 text-xs text-[#6B6B6B] dark:text-[#A8A49E]">
              <span><span className="font-mono font-bold text-[#1A1A1A] dark:text-[#FAFAF8]">{handoffs.length}</span> total</span>
              <span><span className="font-mono font-bold text-[#A07020]">{pendingCount}</span> pending</span>
              <span><span className="font-mono font-bold text-[#1B7A4A]">{completedCount}</span> done</span>
            </div>
          )}
          <button
            onClick={loadAll}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* BOARD VIEW                                      */}
      {/* ════════════════════════════════════════════════ */}
      {viewMode === 'board' && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-5">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A8A49E]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search jobs..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] focus:outline-none focus:border-[#1B4FD8] placeholder:text-[#A8A49E]"
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider border transition-colors ${
                showFilters || filterType !== 'all' || filterPriority !== 'all'
                  ? 'border-[#1B4FD8] text-[#1B4FD8]'
                  : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8]'
              }`}
            >
              <Filter className="h-3 w-3" />
              Filter
              <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            {filterType !== 'all' && (
              <button
                onClick={() => setFilterType('all')}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-[#1B4FD8]/10 text-[#1B4FD8] border border-[#1B4FD8]/30 hover:bg-[#1B4FD8]/20 transition-colors"
              >
                {TYPE_LABEL[filterType as JobType]} ×
              </button>
            )}
            {filterPriority !== 'all' && (
              <button
                onClick={() => setFilterPriority('all')}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-[#A07020]/10 text-[#A07020] border border-[#A07020]/30 hover:bg-[#A07020]/20 transition-colors"
              >
                {filterPriority} ×
              </button>
            )}
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 mb-5 flex flex-wrap gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-2">Type</p>
                <div className="flex gap-2">
                  {(['all', 'handoff', 'schedule', 'automation'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-2.5 py-1 text-[10px] uppercase tracking-wider border transition-colors ${
                        filterType === t
                          ? 'border-[#1B4FD8] text-[#1B4FD8] bg-[#1B4FD8]/5'
                          : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-2">Priority</p>
                <div className="flex gap-2">
                  {(['all', 'high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setFilterPriority(p)}
                      className={`px-2.5 py-1 text-[10px] uppercase tracking-wider border transition-colors ${
                        filterPriority === p
                          ? 'border-[#1B4FD8] text-[#1B4FD8] bg-[#1B4FD8]/5'
                          : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => { setFilterType('all'); setFilterPriority('all'); setSearch(''); setShowFilters(false); }}
                className="self-end text-[10px] text-[#C1341A] hover:underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Kanban columns */}
          <div className="grid grid-cols-4 gap-4">
            {COLUMN_ORDER.map(col => (
              <KanbanColumnView
                key={col}
                column={col}
                jobs={byColumn[col]}
                isLoading={isLoading}
                onDelete={handleDelete}
                onRun={handleRun}
                runningId={runningId}
              />
            ))}
          </div>

          {!isLoading && filteredJobs.length === 0 && jobs.length > 0 && (
            <div className="mt-8 text-center py-12 border border-[#E4E2DC] dark:border-[#3A3A3A]">
              <Search className="h-6 w-6 text-[#A8A49E] mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No jobs match your filters</p>
              <button
                onClick={() => { setSearch(''); setFilterType('all'); setFilterPriority('all'); }}
                className="mt-2 text-xs text-[#1B4FD8] hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {!isLoading && jobs.length === 0 && (
            <div className="mt-8 text-center py-16 border border-[#E4E2DC] dark:border-[#3A3A3A]">
              <Activity className="h-8 w-8 text-[#A8A49E] mx-auto mb-3" strokeWidth={1} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No jobs yet</p>
              <p className="text-xs text-[#A8A49E] mt-1">
                Create handoffs, schedules, or automations to see them here
              </p>
            </div>
          )}

          <p className="mt-6 text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] text-center">
            Auto-refreshes every 30s · WebSocket live
          </p>
        </>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* CHRONICLE VIEW                                  */}
      {/* ════════════════════════════════════════════════ */}
      {viewMode === 'chronicle' && (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-6 mb-8">
            {(['all', 'pending', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setChronicleFilter(f)}
                className={`text-xs uppercase tracking-widest pb-2 border-b-2 transition-colors ${
                  chronicleFilter === f
                    ? 'border-[#1B4FD8] text-[#1A1A1A] dark:text-[#FAFAF8] font-medium'
                    : 'border-transparent text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]'
                }`}
              >
                {f}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-2 font-mono text-[#1B4FD8]">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Loading skeletons */}
          {isLoading && (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
                  <div className="w-2 h-2 rounded-full bg-[#E4E2DC] dark:bg-[#3A3A3A] mt-2" />
                  <div className="flex-1">
                    <div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-1/4 mb-2" />
                    <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && filteredHandoffs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No handoffs yet</p>
              <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B] mt-1">
                Create a handoff to see it appear here
              </p>
            </div>
          )}

          {/* Timeline */}
          {!isLoading && filteredHandoffs.length > 0 && (
            <div className="relative">
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[#D1CFC8] dark:bg-[#3A3A3A]" />
              <div className="space-y-0">
                {filteredHandoffs.map((h, i) => (
                  <ChronicleEntry
                    key={h.id}
                    handoff={h}
                    isLast={i === filteredHandoffs.length - 1}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================
// Chronicle Sub-Components
// ============================

function DeliverablesModal({
  handoffId,
  onClose,
}: {
  handoffId: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DeliverableFile[]>([]);
  const [outputPath, setOutputPath] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHandoffDeliverables(handoffId)
      .then(data => { setFiles(data.files); setOutputPath(data.path); })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load files'))
      .finally(() => setIsLoading(false));
  }, [handoffId]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (ext: string) => {
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return '🖼';
    if (['.md', '.txt'].includes(ext)) return '📝';
    if (ext === '.json') return '📋';
    if (['.html', '.css'].includes(ext)) return '🌐';
    if (['.js', '.ts', '.tsx', '.py'].includes(ext)) return '💻';
    if (ext === '.pdf') return '📄';
    return '📁';
  };

  const BASE_URL = API_ORIGIN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-[#1B4FD8]" strokeWidth={1.5} />
            <span className="text-sm font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">Deliverables</span>
            {!isLoading && !error && (
              <span className="text-[10px] text-[#A8A49E]">{files.length} file{files.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={onClose} className="text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {outputPath && (
          <div className="px-5 py-2 border-b border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#F5F4F0] dark:bg-[#242424]">
            <span className="text-[10px] font-mono text-[#A8A49E] break-all">{outputPath}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse" />
              ))}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-[#C1341A] text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!isLoading && !error && files.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <Folder className="h-10 w-10 text-[#E4E2DC] dark:text-[#3A3A3A] mx-auto" strokeWidth={1} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No files found</p>
              <p className="text-xs text-[#A8A49E]">Files will appear here once the agent saves deliverables</p>
            </div>
          )}
          {!isLoading && !error && files.length > 0 && (
            <div className="space-y-1">
              {files.map((file, i) => (
                <a
                  key={i}
                  href={`${BASE_URL}/output/${file.fullPath.split('/output/')[1]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 border border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/50 hover:bg-[#1B4FD8]/5 transition-colors group"
                >
                  <span className="text-lg flex-shrink-0">{getFileIcon(file.ext)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8] truncate group-hover:text-[#1B4FD8] transition-colors">
                      {file.path}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[#A8A49E]">{formatSize(file.size)}</span>
                      <span className="text-[10px] text-[#A8A49E]">·</span>
                      <span className="text-[10px] text-[#A8A49E]">{new Date(file.modified).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <FileText className="h-3.5 w-3.5 text-[#A8A49E] group-hover:text-[#1B4FD8] flex-shrink-0 transition-colors" strokeWidth={1.5} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChronicleEntry({
  handoff,
  isLast,
  onCancel,
}: {
  handoff: Handoff;
  isLast: boolean;
  onCancel?: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeliverables, setShowDeliverables] = useState(false);

  const time = new Date(handoff.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const truncatedTask = handoff.task.length > 50 ? handoff.task.substring(0, 50) + '...' : handoff.task;
  const hasResponse = handoff.agentResponse && handoff.agentResponse.trim().length > 0;
  const hasDetails  = hasResponse || handoff.context || handoff.pipelineId;

  const statusDotMap: Record<string, string> = {
    completed:   'bg-[#6B9E6B]',
    in_progress: 'bg-[#1B4FD8]',
    failed:      'bg-[#C1341A]',
    pending:     'bg-[#A8A49E]',
    cancelled:   'bg-[#A8A49E]',
  };
  const statusDot = statusDotMap[handoff.status] ?? 'bg-[#A8A49E]';

  const statusIconMap: Record<string, React.ReactElement> = {
    completed:   <CheckCircle className="h-4 w-4 text-[#6B9E6B]" />,
    in_progress: <Clock className="h-4 w-4 text-[#1B4FD8]" />,
    failed:      <AlertCircle className="h-4 w-4 text-[#C1341A]" />,
    pending:     <Clock className="h-4 w-4 text-[#A8A49E]" />,
    cancelled:   <XCircle className="h-4 w-4 text-[#A8A49E]" />,
  };
  const statusIcon = statusIconMap[handoff.status] ?? <Clock className="h-4 w-4 text-[#A8A49E]" />;

  const statusPillMap: Record<string, string> = {
    completed:   'border-[#6B9E6B] text-[#6B9E6B]',
    failed:      'border-[#C1341A] text-[#C1341A]',
    pending:     'border-[#1B4FD8] text-[#1B4FD8]',
    in_progress: 'border-[#1B4FD8] text-[#1B4FD8]',
    cancelled:   'border-[#A8A49E] text-[#A8A49E]',
  };
  const statusPillColor = statusPillMap[handoff.status] ?? 'border-[#1B4FD8] text-[#1B4FD8]';

  return (
    <div className={`relative py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A] ${isLast ? 'border-b-0' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`relative z-10 w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B]">{time}</span>
              <span className="text-[#6B6B6B] dark:text-[#A8A49E]">→</span>
              <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{handoff.fromAgent}</span>
              <span className="text-[#A8A49E] dark:text-[#6B6B6B]">→</span>
              <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{handoff.toAgent}</span>
              {handoff.pipelineId && (
                <span className="text-[10px] px-2 py-0.5 bg-[#1B4FD8]/10 text-[#1B4FD8] border border-[#1B4FD8]/20 font-mono">
                  Step {handoff.pipelineStep}/{handoff.pipelineTotalSteps}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {statusIcon}
              <span className={`status-pill ${statusPillColor}`}>
                {handoff.status.toUpperCase()}
              </span>
            </div>
          </div>

          <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] mt-1">
            {isExpanded ? handoff.task : truncatedTask || '(no task)'}
          </p>

          <div className="flex items-center gap-3 mt-2">
            {hasDetails && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-[#1B4FD8] hover:text-[#1B4FD8]/80 transition-colors"
              >
                {isExpanded
                  ? <><ChevronUp className="h-3 w-3" />Hide details</>
                  : <><ChevronDown className="h-3 w-3" />{hasResponse ? 'Show agent response' : 'Show details'}</>
                }
              </button>
            )}
            {handoff.status === 'completed' && (
              <button
                onClick={() => setShowDeliverables(true)}
                className="flex items-center gap-1 text-xs text-[#6B9E6B] hover:text-[#6B9E6B]/80 transition-colors"
              >
                <Folder className="h-3 w-3" />
                View Deliverables
              </button>
            )}
            {handoff.status === 'pending' && onCancel && (
              <button
                onClick={() => onCancel(handoff.id)}
                className="flex items-center gap-1 text-xs text-[#C1341A] hover:text-[#C1341A]/80 transition-colors"
              >
                <Ban className="h-3 w-3" />
                Cancel
              </button>
            )}
          </div>

          {isExpanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-[#E4E2DC] dark:border-[#3A3A3A]">
              {handoff.context && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] block mb-1">Context</span>
                  <p className="text-xs text-[#6B6B6B] dark:text-[#A8A49E] whitespace-pre-wrap">{handoff.context}</p>
                </div>
              )}
              {hasResponse && (
                <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#A8A49E]">Agent Response</span>
                    {handoff.responseAt && (
                      <span className="text-[10px] text-[#A8A49E] font-mono">
                        {new Date(handoff.responseAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] whitespace-pre-wrap">{handoff.agentResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showDeliverables && (
        <DeliverablesModal
          handoffId={handoff.id}
          onClose={() => setShowDeliverables(false)}
        />
      )}
    </div>
  );
}
