'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { fetchAgents, fetchAllHandoffs, completeHandoff, escalateHandoff, submitFeedback } from '@/lib/api';
import { AgentsMap, Handoff } from '@/lib/types';
import { getLayoutedElements } from '@/lib/layout';
import AgentNode from '@/components/workspace/AgentNode';
import HandoffEdge from '@/components/workspace/HandoffEdge';
import SlidePanel from '@/components/workspace/SlidePanel';
import WorkspaceToolbar from '@/components/workspace/WorkspaceToolbar';
import TaskWizard from '@/components/workspace/TaskWizard';
import MobileWorkspace from '@/components/workspace/MobileWorkspace';
import MobileAgentDetail from '@/components/workspace/MobileAgentDetail';

const nodeTypes = { agent: AgentNode };
const edgeTypes = { handoff: HandoffEdge };

type FilterType = 'all' | 'pending' | 'completed';
type ViewMode = 'canvas' | 'mobile-list' | 'mobile-detail';

export default function WorkspacePage() {
  const [agents, setAgents] = useState<AgentsMap>({});
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPreAgent, setWizardPreAgent] = useState<string | null>(null);
  const [wizardPreFrom, setWizardPreFrom] = useState<string | null>(null);
  const [wizardPreTo, setWizardPreTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile state
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [selectedMobileAgent, setSelectedMobileAgent] = useState<string | null>(null);
  
  // Viewport detection
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  
  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  
  const isMobile = viewport.width < 768;
  const isTablet = viewport.width >= 768 && viewport.width < 1024;

  const loadData = useCallback(async () => {
    try {
      const [agentsData, handoffsData] = await Promise.all([
        fetchAgents(),
        fetchAllHandoffs(),
      ]);
      setAgents(agentsData);
      setHandoffs(handoffsData);

      const agentList = Object.entries(agentsData).map(([id, agent]) => ({
        id,
        name: agent.name,
        role: agent.role,
        reportsTo: agent.reportsTo,
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        agentList,
        handoffsData
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setSelectedEdge(null);
        setShowWizard(false);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdge) {
        handleCompleteHandoff(selectedEdge.id);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '=') {
        e.preventDefault();
        // Zoom handled by React Flow
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdge]);

  // Save/restore node positions to localStorage
  useEffect(() => {
    if (nodes.length === 0) return;
    
    const savedPositions = localStorage.getItem('workspace-node-positions');
    if (savedPositions) {
      try {
        const positions = JSON.parse(savedPositions);
        setNodes((nds) =>
          nds.map((node) => ({
            ...node,
            position: positions[node.id] || node.position,
          }))
        );
      } catch (e) {
        console.error('Failed to restore positions:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (nodes.length === 0) return;
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node) => {
      positions[node.id] = node.position;
    });
    localStorage.setItem('workspace-node-positions', JSON.stringify(positions));
  }, [nodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        setWizardPreFrom(params.source);
        setWizardPreTo(params.target);
        setWizardPreAgent(null);
        setShowWizard(true);
      }
    },
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const handleCompleteHandoff = async (handoffId: string) => {
    try {
      await completeHandoff(handoffId);
      loadData();
      setSelectedEdge(null);
    } catch (err) {
      console.error('Failed to complete handoff:', err);
    }
  };

  // Open wizard from toolbar
  const handleAssignTask = () => {
    setWizardPreAgent(null);
    setWizardPreFrom(null);
    setWizardPreTo(null);
    setShowWizard(true);
  };

  // Open wizard pre-filled for a specific agent (from node click)
  const handleAssignToAgent = (agentId: string) => {
    setWizardPreAgent(agentId);
    setWizardPreFrom(null);
    setWizardPreTo(null);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setWizardPreAgent(null);
    setWizardPreFrom(null);
    setWizardPreTo(null);
  };

  const handleEscalate = async () => {
    if (!selectedEdge) return;
    setIsSubmitting(true);
    try {
      const result = await escalateHandoff(selectedEdge.id);
      alert(`Escalated to ${result.to} (level ${result.escalationLevel})`);
      loadData();
    } catch (err) {
      console.error('Failed to escalate:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedback = async (rating: number) => {
    if (!selectedEdge) return;
    try {
      await submitFeedback(selectedEdge.id, { rating, comments: '' });
      alert('Feedback submitted');
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  };

  const filteredEdges = filter === 'all' 
    ? edges 
    : edges.filter((e) => {
        const status = (e.data as { status?: string })?.status;
        return filter === 'pending' ? status !== 'completed' : status === 'completed';
      });

  const agentList = Object.entries(agents).map(([id, agent]) => ({
    id,
    name: agent.name,
    role: agent.role,
    reportsTo: agent.reportsTo,
  }));

  const selectedHandoff = selectedEdge
    ? handoffs.find((h) => h.id === selectedEdge.id)
    : null;

  const selectedAgent = selectedNode
    ? agents[selectedNode.id]
    : null;

  const agentHandoffs = selectedNode
    ? handoffs.filter((h) => h.toAgent === selectedNode.id && h.status === 'pending')
    : [];

  if (error && nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-lg font-medium text-[#1A1A1A] dark:text-[#FAFAF8] mb-2">Connection Error</h2>
        <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] mb-4">{error}</p>
        <button onClick={loadData} className="btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  // Mobile view
  if (isMobile) {
    if (viewMode === 'mobile-detail' && selectedMobileAgent) {
      return (
        <MobileAgentDetail
          agentId={selectedMobileAgent}
          agents={agents}
          onBack={() => {
            setSelectedMobileAgent(null);
            setViewMode('mobile-list');
          }}
        />
      );
    }
    return (
      <MobileWorkspace
        onAgentSelect={(agentId) => {
          setSelectedMobileAgent(agentId);
          setViewMode('mobile-detail');
        }}
      />
    );
  }

  return (
    <div className="-mx-4 h-[calc(100vh-32px)] lg:-mx-6 xl:-mx-8">
      <ReactFlow
        nodes={nodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        onlyRenderVisibleElements
        defaultEdgeOptions={{
          type: 'handoff',
          animated: false,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E4E2DC" className="dark:text-[#3A3A3A]" />
        <Controls className="!bg-white dark:!bg-[#242424] !border !border-[#E4E2DC] dark:!border-[#3A3A3A] !shadow-sm" />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { pendingCount?: number };
            const isPending = (data?.pendingCount ?? 0) > 0;
            return isPending ? '#1B4FD8' : 'rgba(36, 36, 36, 0.8)';
          }}
          maskColor="rgba(18, 18, 18, 0.85)"
          className="!bg-[#242424] !border !border-[#3A3A3A]"
        />
        
        <Panel position="top-left" className="m-4">
          <WorkspaceToolbar
            filter={filter}
            onFilterChange={setFilter}
            onAssignTask={handleAssignTask}
            onAutoLayout={loadData}
            pendingCount={handoffs.filter((h) => h.status === 'pending').length}
            completedCount={handoffs.filter((h) => h.status === 'completed').length}
          />
        </Panel>
      </ReactFlow>

      {/* Task Assignment Wizard */}
      <SlidePanel
        isOpen={showWizard}
        onClose={handleCloseWizard}
        title="Assign Task"
      >
        <TaskWizard
          agents={agents}
          preSelectedAgent={wizardPreAgent}
          preSelectedFrom={wizardPreFrom}
          preSelectedTo={wizardPreTo}
          onClose={handleCloseWizard}
          onComplete={loadData}
        />
      </SlidePanel>

      {/* Agent / Handoff Detail Panel */}
      <SlidePanel
        isOpen={!showWizard && (!!selectedNode || !!selectedEdge)}
        onClose={() => {
          setSelectedNode(null);
          setSelectedEdge(null);
        }}
        title={
          selectedNode
            ? agents[selectedNode.id]?.name || selectedNode.id
            : selectedEdge
            ? 'Handoff Details'
            : ''
        }
      >
        {selectedNode && selectedAgent ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] uppercase tracking-wide mb-1">
                {selectedAgent.role}
              </div>
              <div className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">
                Reports to: {selectedAgent.reportsTo}
              </div>
            </div>

            {/* Primary CTA: Assign Task to this agent */}
            <button
              onClick={() => handleAssignToAgent(selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#1B4FD8] text-white text-sm font-medium uppercase tracking-wider hover:bg-[#3B64DD] transition-colors active:scale-[0.98]"
            >
              Assign Task to {selectedAgent.name}
            </button>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-2">PENDING TASKS ({agentHandoffs.length})</div>
              {agentHandoffs.length === 0 ? (
                <p className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">No pending tasks</p>
              ) : (
                <div className="space-y-3">
                  {agentHandoffs.map((h) => (
                    <div key={h.id} className="border border-[#E4E2DC] dark:border-[#3A3A3A] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">From: {agents[h.fromAgent]?.name || h.fromAgent}</span>
                        <span className={`inline-flex px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                          h.priority === 'high'
                            ? 'border-[#C1341A]/30 text-[#C1341A]'
                            : h.priority === 'medium'
                            ? 'border-[#A07020]/30 text-[#A07020]'
                            : 'border-[#1B7A4A]/30 text-[#1B7A4A]'
                        }`}>
                          {h.priority === 'high' ? 'ASAP' : h.priority === 'medium' ? 'Soon' : 'Low'}
                        </span>
                      </div>
                      <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] mb-2">{h.task || '(no task)'}</p>
                      <button
                        onClick={() => handleCompleteHandoff(h.id)}
                        className="w-full py-1.5 border border-[#E4E2DC] dark:border-[#3A3A3A] text-xs uppercase tracking-wider text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B7A4A] hover:text-[#1B7A4A] transition-colors"
                      >
                        Mark Complete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : selectedEdge && selectedHandoff ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{agents[selectedHandoff.fromAgent]?.name || selectedHandoff.fromAgent}</span>
              <span className="text-[#A8A49E]">→</span>
              <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{agents[selectedHandoff.toAgent]?.name || selectedHandoff.toAgent}</span>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Task</div>
              <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8]">{selectedHandoff.task || '(no task)'}</p>
            </div>

            {selectedHandoff.context && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Details</div>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">{selectedHandoff.context}</p>
              </div>
            )}

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Urgency</div>
              <span className={`inline-flex px-2 py-1 text-xs uppercase tracking-wider border ${
                selectedHandoff.priority === 'high'
                  ? 'border-[#C1341A]/30 text-[#C1341A] bg-[#C1341A]/5'
                  : selectedHandoff.priority === 'medium'
                  ? 'border-[#A07020]/30 text-[#A07020] bg-[#A07020]/5'
                  : 'border-[#1B7A4A]/30 text-[#1B7A4A] bg-[#1B7A4A]/5'
              }`}>
                {selectedHandoff.priority === 'high' ? 'ASAP' : selectedHandoff.priority === 'medium' ? 'Soon' : 'Whenever'}
              </span>
            </div>

            {selectedHandoff.status === 'pending' && (
              <button
                onClick={() => handleCompleteHandoff(selectedHandoff.id)}
                className="w-full py-2.5 bg-[#1B7A4A] text-white text-sm font-medium uppercase tracking-wider hover:bg-[#1B7A4A]/90 transition-colors"
              >
                Mark Complete
              </button>
            )}

            <div className="border-t border-[#E4E2DC] dark:border-[#3A3A3A] pt-4 mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-2">More Actions</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleEscalate}
                  className="py-2 px-3 border border-[#E4E2DC] dark:border-[#3A3A3A] text-xs uppercase tracking-wider text-[#C1341A] hover:border-[#C1341A] transition-colors"
                >
                  Escalate
                </button>
                <button
                  onClick={() => handleFeedback(5)}
                  className="py-2 px-3 border border-[#E4E2DC] dark:border-[#3A3A3A] text-xs uppercase tracking-wider text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8] hover:text-[#1B4FD8] transition-colors"
                >
                  Feedback
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </SlidePanel>
    </div>
  );
}
