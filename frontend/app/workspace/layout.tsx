import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Workspace | Agent Handoff Manager',
  description: 'Visual workflow management for agent handoffs',
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
