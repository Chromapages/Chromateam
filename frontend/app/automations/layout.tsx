import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Operations | Agent Handoff Manager',
  description: 'Manage automations, schedules, and webhooks',
};

export default function AutomationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
