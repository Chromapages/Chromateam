'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchDashboard } from '@/lib/api';
import { DashboardData, DashboardAgentStats } from '@/lib/types';
import PageHeader from '@/components/PageHeader';

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchDashboard();
      setDashboard(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (error && !dashboard) {
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

  const agentStats = dashboard ? Object.entries(dashboard.byAgent) : [];

  return (
    <div>
      <PageHeader 
        title="Handoff Registry" 
        subtitle={dashboard ? `${dashboard.summary.pending} pending · ${dashboard.summary.completed} completed · ${dashboard.summary.overdue} overdue` : 'Loading...'}
      />

      {/* Summary Cards */}
      {dashboard && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Total</div>
            <div className="text-3xl font-bold text-[#1A1A1A] dark:text-[#FAFAF8]">{dashboard.summary.total}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Pending</div>
            <div className="text-3xl font-bold text-[#1B4FD8]">{dashboard.summary.pending}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Completed</div>
            <div className="text-3xl font-bold text-[#1B7A4A]">{dashboard.summary.completed}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Overdue</div>
            <div className="text-3xl font-bold text-[#C1341A]">{dashboard.summary.overdue}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Agent Table */}
        <div className="col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-3">Agent Status</h3>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Agent</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Pending</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Done</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && agentStats.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
                      <td className="py-3 px-4"><div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-24 animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 animate-pulse" /></td>
                      <td className="py-3 px-4 text-right"><div className="h-5 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-8 ml-auto animate-pulse" /></td>
                      <td className="py-3 px-4 text-right"><div className="h-5 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-8 ml-auto animate-pulse" /></td>
                      <td className="py-3 px-4 text-right"><div className="h-5 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-8 ml-auto animate-pulse" /></td>
                    </tr>
                  ))
                ) : (
                  agentStats.map(([id, stats]) => (
                    <tr 
                      key={id} 
                      className="border-b border-[#E4E2DC] dark:border-[#3A3A3A] hover:bg-[#FAFAF8] dark:hover:bg-[#2E2E2E] transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link href={`/context?agent=${id}`} className="block">
                          <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{stats.name}</span>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs uppercase tracking-wider ${
                          stats.status === 'available' 
                            ? 'bg-green-500/15 text-[#1B7A4A] border border-green-500/20' 
                            : stats.status === 'working'
                            ? 'bg-yellow-500/15 text-[#A07020] border border-yellow-500/20'
                            : 'bg-red-500/15 text-[#C1341A] border border-red-500/20'
                        }`}>
                          {stats.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/context?agent=${id}`} className="block">
                          <span className={`font-mono ${stats.pending > 0 ? 'text-[#1B4FD8] font-medium' : 'text-[#A8A49E] dark:text-[#6B6B6B]'}`}>
                            {stats.pending}
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-[#1B7A4A]">{stats.completed}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-mono ${stats.overdue > 0 ? 'text-[#C1341A] font-medium' : 'text-[#A8A49E] dark:text-[#6B6B6B]'}`}>
                          {stats.overdue}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-3">Recent Activity</h3>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-3">
            {dashboard?.recent.length === 0 && (
              <p className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">No recent activity</p>
            )}
            {dashboard?.recent.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 ${
                  item.status === 'completed' ? 'bg-[#1B7A4A]' : 'bg-[#1B4FD8]'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">
                    {item.from} → {item.to}
                  </div>
                  <div className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] truncate">
                    {item.task || '(no task)'}
                  </div>
                  <div className="text-xs text-[#6B6B6B] dark:text-[#A8A49E]">
                    {new Date(item.time).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Templates */}
          {dashboard?.templates && dashboard.templates.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-3 mt-6">Templates</h3>
              <div className="flex flex-wrap gap-2">
                {dashboard.templates.map((name) => (
                  <span 
                    key={name}
                    className="px-2 py-1 text-xs font-mono bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
