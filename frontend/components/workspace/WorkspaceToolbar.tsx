'use client';

import { useState } from 'react';
import { Plus, RotateCcw, ChevronDown, ChevronUp, Search, X } from 'lucide-react';

interface WorkspaceToolbarProps {
  filter: 'all' | 'pending' | 'completed';
  onFilterChange: (filter: 'all' | 'pending' | 'completed') => void;
  onAssignTask: () => void;
  onAutoLayout: () => void;
  onSearchChange: (query: string) => void;
  searchQuery: string;
  pendingCount: number;
  completedCount: number;
}

export default function WorkspaceToolbar({
  filter,
  onFilterChange,
  onAssignTask,
  onAutoLayout,
  onSearchChange,
  searchQuery,
  pendingCount,
  completedCount,
}: WorkspaceToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-[220px] bg-white/95 dark:bg-[#242424]/95 backdrop-blur-sm border border-[#E4E2DC] dark:border-[#3A3A3A] shadow-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-xs font-bold tracking-[0.18em] uppercase text-[#1A1A1A] dark:text-[#FAFAF8]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Workspace
          </h1>
          <p className="mt-1 text-[10px] font-mono text-[#A8A49E] dark:text-[#6B6B6B]">
            {pendingCount} pending / {completedCount} done
          </p>
        </div>
        <button
          onClick={() => setIsExpanded((value) => !value)}
          className="h-7 w-7 flex items-center justify-center border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] transition-colors hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]"
          aria-label={isExpanded ? 'Collapse toolbar' : 'Expand toolbar'}
        >
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Primary action - always visible */}
      <div className="px-3 pb-3">
        <button
          onClick={onAssignTask}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1B4FD8] text-white text-[11px] font-medium uppercase tracking-[0.18em] transition-colors hover:bg-[#3B64DD] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Assign Task
        </button>
      </div>

      {/* Search input - always visible */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A8A49E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search agents or tasks..."
            className="w-full pl-8 pr-8 py-2 text-[11px] bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8] placeholder:text-[#A8A49E] focus:outline-none focus:border-[#1B4FD8] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-[#E4E2DC] dark:border-[#3A3A3A] px-3 py-3 space-y-3">
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                  filter === f
                    ? 'bg-[#1A1A1A] dark:bg-[#FAFAF8] text-[#FAFAF8] dark:text-[#1A1A1A]'
                    : 'border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]'
                }`}
              >
                {f === 'pending'
                  ? `pending ${pendingCount}`
                  : f === 'completed'
                  ? `done ${completedCount}`
                  : 'all'}
              </button>
            ))}
          </div>

          <button
            onClick={onAutoLayout}
            className="w-full flex items-center justify-center gap-2 py-2 border border-[#E4E2DC] dark:border-[#3A3A3A] text-[10px] uppercase tracking-[0.18em] text-[#6B6B6B] dark:text-[#A8A49E] transition-colors hover:border-[#1A1A1A] dark:hover:border-[#FAFAF8] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reset Layout
          </button>

          <p className="text-[10px] leading-4 text-[#A8A49E] dark:text-[#6B6B6B]">
            Click an agent to assign them a task. Drag between agents to connect them.
          </p>
        </div>
      )}
    </div>
  );
}
