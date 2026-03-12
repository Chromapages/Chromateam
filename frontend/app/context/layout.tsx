import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Context | Agent Handoff Manager',
  description: 'View agent context and pending handoffs',
};

export default function ContextLayout({ children }: { children: React.ReactNode }) {
  return children;
}
