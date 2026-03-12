import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Office | Agent Handoff Manager',
  description: 'Virtual office view with agent presence',
};

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
