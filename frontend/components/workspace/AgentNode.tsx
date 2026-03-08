'use client';

import { memo } from 'react';
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

interface AgentNodeData {
  agent: {
    id: string;
    name: string;
    role: string;
    reportsTo: string;
  };
  pendingCount: number;
  incomingPending: number;
  outgoingPending: number;
}

function AgentNode({ data, selected }: NodeProps) {
  const typedData = data as unknown as AgentNodeData;
  const { agent, pendingCount, incomingPending, outgoingPending } = typedData;

  const showDetailed = useStore((state) => state.transform[2] > 0.8);

  const RoleIcon = getRoleIcon(agent.role);

  return (
    <div
      className={`
        relative w-[200px] bg-white dark:bg-[#242424] border transition-all duration-200
        ${selected ? 'border-[#1B4FD8] shadow-lg' : 'border-[#E4E2DC] dark:border-[#3A3A3A]'}
        ${pendingCount > 0 ? 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[#1B4FD8]' : ''}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-[#E4E2DC] dark:!bg-[#3A3A3A] !border-2 !border-white dark:!border-[#242424] hover:!bg-[#1B4FD8] transition-colors"
      />

      <div className="p-4">
        {/* Role icon + name */}
        <div className="flex items-center gap-3 mb-2">
          <span className="flex h-8 w-8 items-center justify-center border border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#FAFAF8] dark:bg-[#1A1A1A] text-[#1A1A1A] dark:text-[#FAFAF8]">
            <RoleIcon className="h-4 w-4" strokeWidth={1.75} />
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

        {/* Pending count - show detailed at high zoom */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-1 px-2 py-1 bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A]">
              <span className="font-mono text-sm font-medium text-[#1B4FD8]">{pendingCount}</span>
              <span className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">pending</span>
            </div>
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

        {/* Status indicator with pulse animation */}
        <div className="flex items-center gap-2 mt-3">
          <span className={`w-2 h-2 rounded-full ${pendingCount > 0 ? 'bg-[#1B4FD8]' : 'bg-[#6B9E6B] dark:bg-[#4A7A5A]'}`}>
            {pendingCount > 0 && <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[#1B4FD8] opacity-75" />}
          </span>
          <span className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">
            {pendingCount > 0 ? 'Active' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-[#E4E2DC] dark:!bg-[#3A3A3A] !border-2 !border-white dark:!border-[#242424] hover:!bg-[#1B4FD8] transition-colors"
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
