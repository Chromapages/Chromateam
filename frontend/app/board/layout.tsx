import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Board | Agent Handoff Manager',
  description: 'Kanban board view of all handoffs',
};

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
