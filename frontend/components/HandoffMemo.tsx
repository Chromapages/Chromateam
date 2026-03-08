'use client';

import { useState } from 'react';
import { completeHandoff } from '@/lib/api';

interface HandoffMemoProps {
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

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string; darkBg: string }> = {
  high: { bg: 'bg-[#FEF2F0]', text: 'text-[#C1341A]', label: 'HIGH', darkBg: 'dark:bg-[#3A1A1A]' },
  medium: { bg: 'bg-[#FEF6E7]', text: 'text-[#A07020]', label: 'MEDIUM', darkBg: 'dark:bg-[#3A351A]' },
  low: { bg: 'bg-[#ECF6F2]', text: 'text-[#1B7A4A]', label: 'LOW', darkBg: 'dark:bg-[#1A3A2A]' },
};

export default function HandoffMemo({
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
}: HandoffMemoProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(status === 'completed');
  const priorityCfg = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;

  async function handleComplete() {
    setIsCompleting(true);
    try {
      await completeHandoff(id);
      setIsCompleted(true);
      onCompleted?.();
    } catch (err) {
      console.error('Failed to complete handoff:', err);
      setIsCompleting(false);
    }
  }

  const timeAgo = formatTimeAgo(createdAt);

  return (
    <div className={`border border-[#E4E2DC] dark:border-[#3A3A3A] bg-white dark:bg-[#242424] ${isCompleted ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B]">From</span>
            <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{fromAgent}</span>
          </div>
          <span className="text-[#A8A49E] dark:text-[#6B6B6B]">→</span>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B]">To</span>
            <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{toAgent}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`priority-box border-[${priorityCfg.text.replace('text-', '')}] ${priorityCfg.text}`}>
            {priorityCfg.label.charAt(0)}
          </span>
          {status && (
            <span className={`status-pill ${status === 'completed' ? 'border-[#6B9E6B] text-[#6B9E6B]' : 'border-[#1B4FD8] text-[#1B4FD8]'}`}>
              {status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Task */}
      {task && (
        <div className="px-4 py-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
          <span className="section-label block mb-1">Task</span>
          <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8]">{task}</p>
        </div>
      )}

      {/* Context */}
      {context && (
        <div className="px-4 py-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
          <span className="section-label block mb-1">Context</span>
          <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] whitespace-pre-wrap">{context}</p>
        </div>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div className="px-4 py-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
          <span className="section-label block mb-2">Decisions</span>
          <ol className="space-y-1">
            {decisions.map((d, i) => (
              <li key={i} className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] flex items-start gap-2">
                <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B] w-6 flex-shrink-0">
                  {(i + 1).toString().padStart(2, '0')}.
                </span>
                {d}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <div className="px-4 py-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
          <span className="section-label block mb-2">Next Steps</span>
          <ul className="space-y-1">
            {nextSteps.map((s, i) => (
              <li key={i} className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] flex items-start gap-2">
                <span className="text-[#1B4FD8] mt-0.5">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B]">{timeAgo}</span>
          <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B]">{id}</span>
        </div>
        {showCompleteButton && !isCompleted && (
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="btn-secondary text-xs"
          >
            {isCompleting ? 'Completing...' : 'Mark Complete'}
          </button>
        )}
        {isCompleted && (
          <span className="text-xs font-mono text-[#6B9E6B] line-through">COMPLETED</span>
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
