import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Handoff | Agent Handoff Manager',
  description: 'Create new handoffs and manage agent task assignments',
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
