'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useStore } from '@xyflow/react';
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
} from 'lucide-react';
import { AGENT_COLORS } from '@/lib/types';

interface AgentNodeData {
  agent: {
    id: string;
    name: string;
    role: string;
    reportsTo: string;
  };
  pendingCount: number;
  inProgressCount?: number;
  incomingPending: number;
  outgoingPending: number;
  oldestPendingAt?: string;
}

const MAX_WORKLOAD = 5;

// Map agent color keys to actual hex values
const AGENT_ACCENT_COLORS: Record<string, string> = {
  chroma: '#06b6d4',    // cyan-500
  bender: '#22c55e',    // green-500
  pixel: '#a855f7',     // purple-500
  canvas: '#ec4899',    // pink-500
  flux: '#f97316',      // orange-500
  prism: '#3b82f6',     // blue-500
  lumen: '#eab308',     // yellow-500
  momentum: '#ef4444',  // red-500
  glyph: '#6366f1',     // indigo-500
  chief: '#f59e0b',     // amber-500
};

function getWorkloadColor(count: number): string {
  if (count === 0) return '#1B7A4A';
  if (count <= 2) return '#A07020';
  return '#C1341A';
}

function useElapsedTime(isoTimestamp?: string): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!isoTimestamp) {
      setElapsed('');
      return;
    }

    const update = () => {
      const diff = Date.now() - new Date(isoTimestamp).getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) setElapsed(`${hours}h ${minutes % 60}m`);
      else if (minutes > 0) setElapsed(`${minutes}m`);
      else setElapsed(`${seconds}s`);
    };

    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [isoTimestamp]);

  return elapsed;
}

// Track pending count trend over time
function useTrendArrow(currentCount: number): string | null {
  const [trend, setTrend] = useState<string | null>(null);
  const prevRef = useRef<number>(currentCount);
  
  useEffect(() => {
    const prev = prevRef.current;
    if (currentCount > prev) setTrend('up');
    else if (currentCount < prev) setTrend('down');
    else setTrend(null);
    prevRef.current = currentCount;
  }, [currentCount]);
  
  return trend;
}

function AgentNode({ data, selected }: NodeProps) {
  const typedData = data as unknown as AgentNodeData;
  const { agent, pendingCount, inProgressCount = 0, incomingPending, outgoingPending, oldestPendingAt } = typedData;

  const showDetailed = useStore((state) => state.transform[2] > 0.8);
  const elapsed = useElapsedTime(pendingCount > 0 ? oldestPendingAt : undefined);
  const trend = useTrendArrow(pendingCount);

  const workloadPct = Math.min((pendingCount / MAX_WORKLOAD) * 100, 100);
  const workloadColor = getWorkloadColor(pendingCount);
  const RoleIcon = getRoleIcon(agent.role);
  
  // Per-agent color identity
  const agentAccentColor = AGENT_ACCENT_COLORS[agent.id] || '#1B4FD8';

  const elapsedMinutes = oldestPendingAt
    ? Math.floor((Date.now() - new Date(oldestPendingAt).getTime()) / 60000)
    : 0;
  const timerColor =
    elapsedMinutes >= 15 ? '#C1341A' : elapsedMinutes >= 5 ? '#A07020' : '#6B6B6B';

  return (
    <div
      className={`
        relative w-[200px] bg-white dark:bg-[#242424] border transition-all duration-200
        ${selected ? 'border-[#1B4FD8] shadow-lg' : 'border-[#E4E2DC] dark:border-[#3A3A3A]'}
        ${pendingCount > 0 ? 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]' : ''}
      `}
      style={{
        ...(pendingCount > 0 ? { '--agent-accent': agentAccentColor } as React.CSSProperties : {}),
        ...(pendingCount > 0 ? { 
          ['&:before' as string]: {
            backgroundColor: agentAccentColor
          }
        } : {}),
      }}
    >
      {/* Left accent stripe - dynamic per-agent color */}
      {pendingCount > 0 && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-[3px]" 
          style={{ backgroundColor: agentAccentColor }}
        />
      )}

      {/* Input handle - colored per agent */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#E4E2DC] dark:!bg-[#3A3A3A] !border-2 !border-white dark:!border-[#242424] hover:!transition-colors"
        style={{ ['--hover-bg' as string]: agentAccentColor }}
      />

      <div className="p-4">
        {/* Role icon + name - per-agent icon color */}
        <div className="flex items-center gap-3 mb-2">
          <span 
            className="flex h-8 w-8 items-center justify-center border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#1A1A1A] dark:text-[#FAFAF8]"
            style={{ backgroundColor: `${agentAccentColor}15` }}
          >
            <RoleIcon className="h-4 w-4" strokeWidth={1.75} style={{ color: agentAccentColor }} />
          </span>
          <div>
            <div className="font-bold text-[#1A1A1A] dark:text-[#FAFAF8] text-sm tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {agent.name.toUpperCase()}
            </div>
            <div className="text-xs text-[#6B6B6B] dark:text-[#A8A49E] uppercase tracking-wide">
              {agent.role}
            </div>
          </div>
        </div>

        {/* Workload meter bar with trend arrow */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Queue</span>
            <div className="flex items-center gap-1">
              {trend === 'up' && (
                <span className="text-[10px] text-[#C1341A]" title="Growing">↑</span>
              )}
              {trend === 'down' && (
                <span className="text-[10px] text-[#1B7A4A]" title="Shrinking">↓</span>
              )}
              <span className="font-mono text-[10px]" style={{ color: workloadColor }}>
                {pendingCount}/{MAX_WORKLOAD}
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-[#E4E2DC] dark:bg-[#3A3A3A] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${workloadPct}%`, backgroundColor: workloadColor }}
            />
          </div>
        </div>

        {/* In-progress indicator */}
        {inProgressCount > 0 && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Active</span>
            <div className="flex items-center gap-1">
              <span className="relative flex w-1.5 h-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B4FD8]" />
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1B4FD8] opacity-75" />
              </span>
              <span className="font-mono text-[10px] text-[#1B4FD8]">{inProgressCount}</span>
            </div>
          </div>
        )}

        {/* Elapsed timer for oldest pending task */}
        {pendingCount > 0 && elapsed && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Oldest</span>
            <span className="font-mono text-[10px]" style={{ color: timerColor }}>{elapsed}</span>
          </div>
        )}

        {/* Detailed stats at high zoom */}
        {showDetailed && pendingCount > 0 && (
          <div className="mt-3 pt-3 border-t border-[#E4E2DC] dark:border-[#3A3A3A] space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#A8A49E] dark:text-[#6B6B6B]">Incoming:</span>
              <span className="font-mono text-[#C1341A]">{incomingPending}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#A8A49E] dark:text-[#6B6B6B]">Outgoing:</span>
              <span className="font-mono text-[#A07020]">{outgoingPending}</span>
            </div>
          </div>
        )}

        {/* Status indicator with pulse animation - per-agent colored dot when active */}
        <div className="flex items-center gap-2 mt-3">
          <span className="relative flex w-2 h-2">
            {pendingCount > 0 ? (
              <>
                <span 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: agentAccentColor }}
                />
                <span 
                  className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-75"
                  style={{ backgroundColor: agentAccentColor }}
                />
              </>
            ) : (
              <span className="w-2 h-2 rounded-full bg-[#1B7A4A]" />
            )}
          </span>
          <span className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">
            {pendingCount > 0 ? `${pendingCount} Active` : 'Idle'}
          </span>
        </div>
      </div>

      {/* Output handle - colored per agent */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[#E4E2DC] dark:!bg-[#3A3A3A] !border-2 !border-white dark:!border-[#242424] transition-colors hover:!border-transparent"
        style={{ ['--hover-bg' as string]: agentAccentColor }}
      />
    </div>
  );
}

function getRoleIcon(role: string) {
  const icons = {
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

  return icons[role as keyof typeof icons] || Briefcase;
}

export default memo(AgentNode);
