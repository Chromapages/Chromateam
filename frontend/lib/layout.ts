import dagre from '@dagrejs/dagre';
import { Node, Edge } from '@xyflow/react';

interface Agent {
  id: string;
  name: string;
  role: string;
  reportsTo: string;
}

interface Handoff {
  id: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  priority: string;
  status: string;
  createdAt: string;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const NODE_SPACING_X = 100;
const NODE_SPACING_Y = 80;

export function getLayoutedElements(
  agents: Agent[],
  handoffs: Handoff[]
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  const pendingIncomingCounts = new Map<string, number>();
  const pendingOutgoingCounts = new Map<string, number>();

  handoffs.forEach((handoff) => {
    if (handoff.status !== 'pending') {
      return;
    }

    pendingIncomingCounts.set(
      handoff.toAgent,
      (pendingIncomingCounts.get(handoff.toAgent) ?? 0) + 1
    );

    pendingOutgoingCounts.set(
      handoff.fromAgent,
      (pendingOutgoingCounts.get(handoff.fromAgent) ?? 0) + 1
    );
  });

  g.setGraph({
    rankdir: 'TB',
    nodesep: NODE_SPACING_X,
    ranksep: NODE_SPACING_Y,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add agent nodes to dagre
  agents.forEach((agent) => {
    g.setNode(agent.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges based on reportsTo hierarchy
  agents.forEach((agent) => {
    if (agent.reportsTo && agents.find((a) => a.id === agent.reportsTo)) {
      g.setEdge(agent.reportsTo, agent.id);
    }
  });

  // Add handoff edges (these are directed from -> to)
  handoffs.forEach((handoff) => {
    if (handoff.status === 'pending') {
      g.setEdge(handoff.fromAgent, handoff.toAgent, {
        id: handoff.id,
        type: 'handoff',
        priority: handoff.priority,
        task: handoff.task,
        status: handoff.status,
      });
    }
  });

  dagre.layout(g);

  // Convert to React Flow nodes
  const nodes: Node[] = agents.map((agent) => {
    const nodeWithPosition = g.node(agent.id);
    const incomingPending = pendingIncomingCounts.get(agent.id) ?? 0;
    const outgoingPending = pendingOutgoingCounts.get(agent.id) ?? 0;

    return {
      id: agent.id,
      type: 'agent',
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
      data: {
        agent,
        pendingCount: incomingPending,
        incomingPending,
        outgoingPending,
      },
    };
  });

  // Convert to React Flow edges
  const edges: Edge[] = handoffs
    .filter((h) => h.status === 'pending')
    .map((handoff) => ({
      id: handoff.id,
      source: handoff.fromAgent,
      target: handoff.toAgent,
      type: 'handoff',
      data: {
        priority: handoff.priority,
        task: handoff.task,
        status: handoff.status,
        createdAt: handoff.createdAt,
      },
      animated: false,
      style: {
        stroke: getPriorityColor(handoff.priority),
        strokeWidth: 2,
      },
    }));

  return { nodes, edges };
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return '#C1341A';
    case 'medium':
      return '#A07020';
    case 'low':
      return '#1B7A4A';
    default:
      return '#1B4FD8';
  }
}

export function getPriorityBg(priority: string): string {
  switch (priority) {
    case 'high':
      return '#FEF2F0';
    case 'medium':
      return '#FEF6E7';
    case 'low':
      return '#ECF6F2';
    default:
      return '#F5F5F5';
  }
}
