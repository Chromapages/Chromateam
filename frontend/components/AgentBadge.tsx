import { AGENT_COLORS } from '@/lib/types';

const COLOR_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  cyan:   { bg: 'bg-cyan-500/15',    text: 'text-cyan-400',    ring: 'ring-cyan-500/30' },
  green:  { bg: 'bg-green-500/15',   text: 'text-green-400',   ring: 'ring-green-500/30' },
  purple: { bg: 'bg-purple-500/15',  text: 'text-purple-400',  ring: 'ring-purple-500/30' },
  pink:   { bg: 'bg-pink-500/15',    text: 'text-pink-400',    ring: 'ring-pink-500/30' },
  orange: { bg: 'bg-orange-500/15',  text: 'text-orange-400',  ring: 'ring-orange-500/30' },
  blue:   { bg: 'bg-blue-500/15',    text: 'text-blue-400',    ring: 'ring-blue-500/30' },
  yellow: { bg: 'bg-yellow-500/15',  text: 'text-yellow-400',  ring: 'ring-yellow-500/30' },
  red:    { bg: 'bg-red-500/15',     text: 'text-red-400',     ring: 'ring-red-500/30' },
  indigo: { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  ring: 'ring-indigo-500/30' },
  amber:  { bg: 'bg-amber-500/15',   text: 'text-amber-400',   ring: 'ring-amber-500/30' },
};

interface AgentBadgeProps {
  agentId: string;
  name?: string;
  size?: 'sm' | 'md';
}

export default function AgentBadge({ agentId, name, size = 'sm' }: AgentBadgeProps) {
  const colorKey = AGENT_COLORS[agentId] || 'cyan';
  const colors = COLOR_MAP[colorKey] || COLOR_MAP.cyan;
  const displayName = name || agentId;

  const sizeClasses = size === 'sm'
    ? 'px-2.5 py-0.5 text-xs'
    : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ring-1 ${colors.bg} ${colors.text} ${colors.ring} ${sizeClasses}`}
    >
      {displayName}
    </span>
  );
}
