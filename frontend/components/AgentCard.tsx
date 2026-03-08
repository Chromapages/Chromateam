'use client';

import Link from 'next/link';
import { AGENT_COLORS } from '@/lib/types';
import { ArrowRight } from 'lucide-react';

const GLOW_MAP: Record<string, string> = {
  cyan:   'border-cyan-500/30 hover:border-cyan-500/50',
  green:  'border-green-500/30 hover:border-green-500/50',
  purple: 'border-purple-500/30 hover:border-purple-500/50',
  pink:   'border-pink-500/30 hover:border-pink-500/50',
  orange: 'border-orange-500/30 hover:border-orange-500/50',
  blue:   'border-blue-500/30 hover:border-blue-500/50',
  yellow: 'border-yellow-500/30 hover:border-yellow-500/50',
  red:    'border-red-500/30 hover:border-red-500/50',
  indigo: 'border-indigo-500/30 hover:border-indigo-500/50',
  amber:  'border-amber-500/30 hover:border-amber-500/50',
};

const DOT_MAP: Record<string, string> = {
  cyan:   'bg-cyan-400',
  green:  'bg-green-400',
  purple: 'bg-purple-400',
  pink:   'bg-pink-400',
  orange: 'bg-orange-400',
  blue:   'bg-blue-400',
  yellow: 'bg-yellow-400',
  red:    'bg-red-400',
  indigo: 'bg-indigo-400',
  amber:  'bg-amber-400',
};

interface AgentCardProps {
  agentId: string;
  name: string;
  role: string;
  pendingCount: number;
}

export default function AgentCard({ agentId, name, role, pendingCount }: AgentCardProps) {
  const colorKey = AGENT_COLORS[agentId] || 'cyan';
  const borderClasses = GLOW_MAP[colorKey] || GLOW_MAP.cyan;
  const dotClass = DOT_MAP[colorKey] || DOT_MAP.cyan;

  return (
    <Link href={`/context?agent=${agentId}`}>
      <div
        className={`bg-surface-800 border rounded-xl p-5 transition-all duration-200 hover:bg-surface-700 cursor-pointer group ${borderClasses}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
            <h3 className="text-base font-bold text-zinc-100">{name}</h3>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        </div>

        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-4">{role}</p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">Pending handoffs</span>
          <span
            className={`text-lg font-bold font-mono ${
              pendingCount > 0 ? 'text-accent-cyan' : 'text-zinc-600'
            }`}
          >
            {pendingCount}
          </span>
        </div>
      </div>
    </Link>
  );
}
