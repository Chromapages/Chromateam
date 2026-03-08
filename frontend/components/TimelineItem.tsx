import AgentBadge from './AgentBadge';
import { AGENT_COLORS, PRIORITY_CONFIG } from '@/lib/types';
import { ArrowRight, Clock } from 'lucide-react';

const LINE_COLOR_MAP: Record<string, string> = {
  cyan:   'bg-cyan-500/40',
  green:  'bg-green-500/40',
  purple: 'bg-purple-500/40',
  pink:   'bg-pink-500/40',
  orange: 'bg-orange-500/40',
  blue:   'bg-blue-500/40',
  yellow: 'bg-yellow-500/40',
  red:    'bg-red-500/40',
  indigo: 'bg-indigo-500/40',
  amber:  'bg-amber-500/40',
};

const DOT_COLOR_MAP: Record<string, string> = {
  cyan:   'bg-cyan-400 ring-cyan-500/30',
  green:  'bg-green-400 ring-green-500/30',
  purple: 'bg-purple-400 ring-purple-500/30',
  pink:   'bg-pink-400 ring-pink-500/30',
  orange: 'bg-orange-400 ring-orange-500/30',
  blue:   'bg-blue-400 ring-blue-500/30',
  yellow: 'bg-yellow-400 ring-yellow-500/30',
  red:    'bg-red-400 ring-red-500/30',
  indigo: 'bg-indigo-400 ring-indigo-500/30',
  amber:  'bg-amber-400 ring-amber-500/30',
};

interface TimelineItemProps {
  fromAgent: string;
  toAgent: string;
  task: string;
  priority: string;
  status: string;
  createdAt: string;
  isLast?: boolean;
}

export default function TimelineItem({
  fromAgent,
  toAgent,
  task,
  priority,
  status,
  createdAt,
  isLast = false,
}: TimelineItemProps) {
  const colorKey = AGENT_COLORS[fromAgent] || 'cyan';
  const lineColor = LINE_COLOR_MAP[colorKey] || LINE_COLOR_MAP.cyan;
  const dotColor = DOT_COLOR_MAP[colorKey] || DOT_COLOR_MAP.cyan;
  const priorityCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;

  const time = new Date(createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full ring-4 ${dotColor} flex-shrink-0 mt-1.5`} />
        {!isLast && <div className={`w-0.5 flex-1 ${lineColor} mt-1`} />}
      </div>

      <div className="pb-8 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <AgentBadge agentId={fromAgent} />
          <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
          <AgentBadge agentId={toAgent} />
          <span className={`badge ${priorityCfg.bg} ml-auto`}>{priorityCfg.label}</span>
        </div>

        <p className="text-sm text-zinc-200 mb-2 line-clamp-2">{task || 'No task description'}</p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-zinc-600 text-xs">
            <Clock className="w-3 h-3" />
            <span>{time}</span>
          </div>
          <span
            className={`text-xs font-medium ${
              status === 'completed' ? 'text-green-400' : 'text-cyan-400'
            }`}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
