'use client';

import { useState } from 'react';
import AgentBadge from './AgentBadge';
import { PRIORITY_CONFIG } from '@/lib/types';
import { completeHandoff } from '@/lib/api';
import { CheckCircle, Clock, ArrowRight, ListChecks, FileText, Lightbulb } from 'lucide-react';

interface HandoffCardProps {
  id: string;
  fromAgent: string;
  toAgent?: string;
  task: string;
  context: string;
  decisions: string[];
  nextSteps: string[];
  priority: string;
  createdAt: string;
  status?: string;
  showCompleteButton?: boolean;
  onCompleted?: () => void;
}

export default function HandoffCard({
  id,
  fromAgent,
  toAgent,
  task,
  context,
  decisions,
  nextSteps,
  priority,
  createdAt,
  status,
  showCompleteButton = false,
  onCompleted,
}: HandoffCardProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const priorityCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;

  async function handleComplete() {
    setIsCompleting(true);
    try {
      await completeHandoff(id);
      onCompleted?.();
    } catch (err) {
      console.error('Failed to complete handoff:', err);
      setIsCompleting(false);
    }
  }

  const timeAgo = formatTimeAgo(createdAt);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AgentBadge agentId={fromAgent} />
          {toAgent && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
              <AgentBadge agentId={toAgent} />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${priorityCfg.bg}`}>{priorityCfg.label}</span>
          {status && (
            <span
              className={`badge ${
                status === 'completed'
                  ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                  : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
              }`}
            >
              {status}
            </span>
          )}
        </div>
      </div>

      {task && (
        <div>
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
            <FileText className="w-3 h-3" />
            <span className="uppercase tracking-wider font-medium">Task</span>
          </div>
          <p className="text-sm text-zinc-200">{task}</p>
        </div>
      )}

      {context && (
        <div>
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
            <Lightbulb className="w-3 h-3" />
            <span className="uppercase tracking-wider font-medium">Context</span>
          </div>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{context}</p>
        </div>
      )}

      {decisions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
            <CheckCircle className="w-3 h-3" />
            <span className="uppercase tracking-wider font-medium">Decisions</span>
          </div>
          <ul className="space-y-1">
            {decisions.map((d, i) => (
              <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                <span className="text-zinc-600 mt-0.5">•</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextSteps.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
            <ListChecks className="w-3 h-3" />
            <span className="uppercase tracking-wider font-medium">Next Steps</span>
          </div>
          <ul className="space-y-1">
            {nextSteps.map((s, i) => (
              <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                <span className="text-accent-cyan mt-0.5">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-surface-600">
        <div className="flex items-center gap-1.5 text-zinc-600 text-xs">
          <Clock className="w-3 h-3" />
          <span>{timeAgo}</span>
          <span className="text-zinc-700 font-mono text-[10px]">{id}</span>
        </div>
        {showCompleteButton && (
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {isCompleting ? 'Completing...' : 'Mark Complete'}
          </button>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
