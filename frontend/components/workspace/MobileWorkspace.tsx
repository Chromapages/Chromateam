'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAgents, fetchAllHandoffs, createHandoff, completeHandoff } from '@/lib/api';
import { AgentsMap, Handoff, CreateHandoffPayload } from '@/lib/types';

interface MobileWorkspaceProps {
  onAgentSelect: (agentId: string) => void;
}

type FilterType = 'all' | 'pending' | 'completed';

export default function MobileWorkspace({ onAgentSelect }: MobileWorkspaceProps) {
  const [agents, setAgents] = useState<AgentsMap>({});
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    fromAgent: '',
    toAgent: '',
    task: '',
    context: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [agentsData, handoffsData] = await Promise.all([
        fetchAgents(),
        fetchAllHandoffs(),
      ]);
      setAgents(agentsData);
      setHandoffs(handoffsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleComplete = async (handoffId: string) => {
    try {
      await completeHandoff(handoffId);
      loadData();
    } catch (err) {
      console.error('Failed to complete:', err);
    }
  };

  const handleSubmit = async () => {
    if (!formData.fromAgent || !formData.toAgent) return;
    setIsSubmitting(true);
    try {
      const payload: CreateHandoffPayload = {
        fromAgent: formData.fromAgent,
        toAgent: formData.toAgent,
        task: formData.task,
        context: formData.context,
        decisions: [],
        nextSteps: [],
        priority: formData.priority,
      };
      await createHandoff(payload);
      setShowForm(false);
      setFormData({ fromAgent: '', toAgent: '', task: '', context: '', priority: 'medium' });
      loadData();
    } catch (err) {
      console.error('Failed to create:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const agentList = Object.entries(agents);
  const filteredHandoffs = filter === 'all' 
    ? handoffs 
    : handoffs.filter((h) => filter === 'pending' ? h.status === 'pending' : h.status === 'completed');

  const getAgentConnections = (agentId: string) => {
    const incoming = handoffs.filter((h) => h.toAgent === agentId && h.status === 'pending');
    const outgoing = handoffs.filter((h) => h.fromAgent === agentId && h.status === 'pending');
    return { incoming: incoming.length, outgoing: outgoing.length };
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-[#E4E2DC] animate-pulse" />
        ))}
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setShowForm(false)} className="text-[#1B4FD8]">← Back</button>
          <span className="font-bold">New Handoff</span>
        </div>

        <div>
          <label className="section-label block mb-2">From Agent</label>
          <select
            value={formData.fromAgent}
            onChange={(e) => setFormData((p) => ({ ...p, fromAgent: e.target.value }))}
            className="input-field"
          >
            <option value="">Select...</option>
            {agentList.map(([id, a]) => (
              <option key={id} value={id}>{a.name} — {a.role}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="section-label block mb-2">To Agent</label>
          <select
            value={formData.toAgent}
            onChange={(e) => setFormData((p) => ({ ...p, toAgent: e.target.value }))}
            className="input-field"
          >
            <option value="">Select...</option>
            {agentList.map(([id, a]) => (
              <option key={id} value={id}>{a.name} — {a.role}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="section-label block mb-2">Task</label>
          <input
            value={formData.task}
            onChange={(e) => setFormData((p) => ({ ...p, task: e.target.value }))}
            placeholder="What needs to be done?"
            className="input-field"
          />
        </div>

        <div>
          <label className="section-label block mb-2">Priority</label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFormData((prev) => ({ ...prev, priority: p }))}
                className={`priority-box ${
                  formData.priority === p
                    ? 'bg-[#1A1A1A] text-[#FAFAF8] border-[#1A1A1A]'
                    : 'border-[#E4E2DC] text-[#6B6B6B]'
                }`}
              >
                {p.toUpperCase().charAt(0)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !formData.fromAgent || !formData.toAgent}
          className="btn-primary mt-4"
        >
          {isSubmitting ? 'Creating...' : 'Create Handoff'}
        </button>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Filter tabs */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[#E4E2DC] sticky top-0 bg-[#FAFAF8] z-10">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs uppercase tracking-widest pb-1 border-b-2 ${
              filter === f
                ? 'border-[#1B4FD8] text-[#1A1A1A] font-medium'
                : 'border-transparent text-[#6B6B6B]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Agent list */}
      <div className="divide-y divide-[#E4E2DC]">
        {agentList.map(([id, agent]) => {
          const conns = getAgentConnections(id);
          const pendingCount = conns.incoming;
          
          return (
            <div
              key={id}
              onClick={() => onAgentSelect(id)}
              className="p-4 hover:bg-[#FAFAF8] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#1A1A1A]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {agent.name}
                  </div>
                  <div className="text-xs text-[#6B6B6B] uppercase">{agent.role}</div>
                </div>
                <div className="text-right">
                  {pendingCount > 0 && (
                    <span className="font-mono text-sm text-[#1B4FD8] font-medium">{pendingCount} pending</span>
                  )}
                  {pendingCount === 0 && (
                    <span className="text-xs text-[#A8A49E]">Idle</span>
                  )}
                </div>
              </div>
              
              {/* Connection indicators */}
              <div className="mt-2 flex gap-4 text-xs text-[#A8A49E]">
                {conns.outgoing > 0 && (
                  <span>→ {conns.outgoing} outgoing</span>
                )}
                {conns.incoming > 0 && (
                  <span>← {conns.incoming} incoming</span>
                )}
              </div>

              <div className="mt-2 text-xs text-[#1B4FD8]">View Details ▸</div>
            </div>
          );
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-[#1B4FD8] text-white rounded-full shadow-lg text-2xl flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}
