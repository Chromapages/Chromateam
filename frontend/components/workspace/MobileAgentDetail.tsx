'use client';

import { useState } from 'react';
import { fetchAllHandoffs, completeHandoff } from '@/lib/api';
import { AgentsMap, Handoff } from '@/lib/types';

interface MobileAgentDetailProps {
  agentId: string;
  agents: AgentsMap;
  onBack: () => void;
}

export default function MobileAgentDetail({ agentId, agents, onBack }: MobileAgentDetailProps) {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    fetchAllHandoffs().then((data) => {
      setHandoffs(data);
      setLoading(false);
    });
  });

  const agent = agents[agentId];
  if (!agent) return null;

  const pendingHandoffs = handoffs.filter((h) => h.toAgent === agentId && h.status === 'pending');
  const completedHandoffs = handoffs.filter((h) => h.toAgent === agentId && h.status === 'completed');

  const handleComplete = async (handoffId: string) => {
    try {
      await completeHandoff(handoffId);
      setHandoffs((prev) =>
        prev.map((h) => (h.id === handoffId ? { ...h, status: 'completed' } : h))
      );
    } catch (err) {
      console.error('Failed to complete:', err);
    }
  };

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="p-4 border-b border-[#E4E2DC] sticky top-0 bg-[#FAFAF8] z-10">
        <button onClick={onBack} className="text-[#1B4FD8] mb-2">← Back</button>
        <h1 className="text-xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {agent.name}
        </h1>
        <p className="text-sm text-[#6B6B6B]">{agent.role} · Reports to {agent.reportsTo}</p>
      </div>

      {/* Pending section */}
      <div className="p-4">
        <h2 className="section-label mb-3">PENDING HANDOFFS ({pendingHandoffs.length})</h2>
        
        {pendingHandoffs.length === 0 ? (
          <p className="text-sm text-[#A8A49E]">No pending handoffs</p>
        ) : (
          <div className="space-y-3">
            {pendingHandoffs.map((h) => (
              <div key={h.id} className="border border-[#E4E2DC] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#A8A49E]">From: {h.fromAgent}</span>
                  <span className={`priority-box border-${
                    h.priority === 'high' ? '[#C1341A]' : h.priority === 'medium' ? '[#A07020]' : '[#1B7A4A]'
                  } text-${
                    h.priority === 'high' ? '[#C1341A]' : h.priority === 'medium' ? '[#A07020]' : '[#1B7A4A]'
                  }`}>
                    {h.priority.toUpperCase().charAt(0)}
                  </span>
                </div>
                <p className="text-sm text-[#1A1A1A] mb-3">{h.task || '(no task)'}</p>
                <button
                  onClick={() => handleComplete(h.id)}
                  className="btn-secondary text-xs w-full"
                >
                  Mark Complete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed section */}
      {completedHandoffs.length > 0 && (
        <div className="p-4 border-t border-[#E4E2DC]">
          <h2 className="section-label mb-3">COMPLETED ({completedHandoffs.length})</h2>
          <div className="space-y-2">
            {completedHandoffs.map((h) => (
              <div key={h.id} className="text-sm text-[#A8A49E] line-through">
                {h.task || '(no task)'} · {h.fromAgent} → {h.toAgent}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
