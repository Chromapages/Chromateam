'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchAgents, fetchAgentContext } from '@/lib/api';
import { AgentsMap, AgentContextSummary } from '@/lib/types';
import HandoffMemo from '@/components/HandoffMemo';
import PageHeader from '@/components/PageHeader';

export default function ContextPage() {
  const searchParams = useSearchParams();
  const initialAgent = searchParams.get('agent') || '';

  const [agents, setAgents] = useState<AgentsMap>({});
  const [selectedAgent, setSelectedAgent] = useState(initialAgent);
  const [contextData, setContextData] = useState<AgentContextSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(console.error);
  }, []);

  const loadContext = useCallback(async (agentId: string) => {
    if (!agentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAgentContext(agentId);
      setContextData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load context');
      setContextData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadContext(selectedAgent);
    }
  }, [selectedAgent, loadContext]);

  function handleCompleted() {
    if (selectedAgent) {
      loadContext(selectedAgent);
    }
  }

  const agentEntries = Object.entries(agents);
  const currentAgent = agents[selectedAgent];

  return (
    <div>
      <PageHeader title="Agent Inbox" subtitle="View and manage pending handoffs for each agent" />

      {/* Agent Selector */}
      <div className="mb-8">
        <label className="section-label block mb-3">Select Agent</label>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="input-field max-w-sm"
        >
          <option value="">Choose an agent...</option>
          {agentEntries.map(([id, agent]) => (
            <option key={id} value={id}>
              {agent.name} — {agent.role}
            </option>
          ))}
        </select>
      </div>

      {/* Agent Header */}
      {selectedAgent && currentAgent && (
        <div className="mb-8 pb-6 border-b-2 border-[#1A1A1A] dark:border-[#FAFAF8]">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#1A1A1A] dark:text-[#FAFAF8]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {currentAgent.name}
              </h2>
              <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A8A49E] uppercase mt-1">
                {currentAgent.role} · Reports to {currentAgent.reportsTo}
              </p>
            </div>
            <div className="text-right">
              <span className="font-mono text-2xl text-[#1B4FD8] font-medium">
                {contextData?.pendingCount || 0}
              </span>
              <span className="block text-xs text-[#A8A49E] dark:text-[#6B6B6B] uppercase tracking-widest">Pending</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-[#C1341A] text-[#C1341A] dark:border-[#EF4444] dark:text-[#EF4444] px-4 py-3 mb-6">
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
              <div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-1/3 mb-3" />
              <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-2/3 mb-2" />
              <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty - no handoffs */}
      {!isLoading && contextData && contextData.handoffs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No pending handoffs</p>
          <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B] mt-1">This agent's queue is clear</p>
        </div>
      )}

      {/* Handoff Memos */}
      {!isLoading && contextData && contextData.handoffs.length > 0 && (
        <div className="space-y-6">
          {contextData.handoffs.map((h) => (
            <HandoffMemo
              key={h.id}
              id={h.id}
              fromAgent={h.from}
              toAgent={selectedAgent}
              task={h.task}
              context={h.context}
              decisions={h.decisions || []}
              nextSteps={h.nextSteps || []}
              priority={h.priority}
              createdAt={h.createdAt}
              showCompleteButton={true}
              onCompleted={handleCompleted}
            />
          ))}
        </div>
      )}

      {/* No agent selected */}
      {!selectedAgent && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-text-2">Select an agent</p>
          <p className="text-xs text-text-3 mt-1">Choose an agent above to view their pending handoffs</p>
        </div>
      )}
    </div>
  );
}
