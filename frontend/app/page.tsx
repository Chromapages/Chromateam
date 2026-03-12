'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchDashboard } from '@/lib/api';
import { DashboardData, DashboardAgentStats, Pipeline } from '@/lib/types';
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

  // Helper for status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500/15 text-[#1B7A4A] border border-green-500/20';
      case 'working':
      case 'active':
        return 'bg-blue-500/15 text-[#1B4FD8] border border-blue-500/20';
      case 'busy':
        return 'bg-red-500/15 text-[#C1341A] border border-red-500/20';
      default:
        return 'bg-gray-500/15 text-[#6B6B6B] border border-gray-500/20';
    }
  };

  // Helper for pipeline status
  const getPipelineStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-l-[#1B7A4A]';
      case 'in_progress':
        return 'border-l-[#1B4FD8]';
      case 'failed':
        return 'border-l-[#C1341A]';
      default:
        return 'border-l-[#6B6B6B]';
    }
  };

  return (
    <div>
      <PageHeader 
        title="Handoff Registry" 
        subtitle={dashboard ? `${dashboard.summary.pending} pending · ${dashboard.summary.inProgress} active · ${dashboard.summary.completed} done` : 'Loading...'}
      />

      {/* Summary Cards - 6 columns: Total, Pending, In Progress, Completed, Failed, Pipelines */}
      {isLoading || !dashboard ? (
        <div className="grid grid-cols-6 gap-4 mb-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
              <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 mb-3 animate-pulse rounded" />
              <div className="h-8 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-12 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-4 mb-8">
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Total</div>
            <div className="text-3xl font-bold text-[#1A1A1A] dark:text-[#FAFAF8]">{dashboard.summary.total}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Pending</div>
            <div className="text-3xl font-bold text-amber-500">{dashboard.summary.pending}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">In Progress</div>
            <div className="text-3xl font-bold text-[#1B4FD8]">{dashboard.summary.inProgress}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Completed</div>
            <div className="text-3xl font-bold text-[#1B7A4A]">{dashboard.summary.completed}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Failed</div>
            <div className="text-3xl font-bold text-[#C1341A]">{dashboard.summary.failed}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Pipelines</div>
            <div className="text-3xl font-bold text-violet-500">{dashboard.summary.activePipelines}</div>
          </div>
        </div>
      )}

      {/* FIX #4: Pipelines Section */}
      {!isLoading && dashboard && dashboard.pipelines && dashboard.pipelines.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-3">🚀 Active Pipelines</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.pipelines.slice(0, 6).map((pipeline: Pipeline) => (
              <div 
                key={pipeline.id} 
                className={`bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] border-l-4 ${getPipelineStatusColor(pipeline.status)} p-4`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-mono text-xs text-violet-500">{pipeline.id.slice(0, 12)}...</div>
                  <span className={`px-2 py-0.5 text-xs uppercase tracking-wider ${getStatusBadge(pipeline.status)}`}>
                    {pipeline.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-sm mb-2">
                  <span className="font-medium">{pipeline.completedSteps}</span>
                  <span className="text-[#A8A49E]">/{pipeline.totalSteps} steps</span>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-[#E4E2DC] dark:bg-[#3A3A3A] rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${pipeline.totalSteps > 0 ? (pipeline.completedSteps / pipeline.totalSteps) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex gap-1">
                  {pipeline.steps.slice(0, 5).map((step, idx) => (
                    <div 
                      key={idx}
                      className={`h-1.5 flex-1 rounded ${
                        step.status === 'completed' ? 'bg-[#1B7A4A]' :
                        step.status === 'in_progress' ? 'bg-[#1B4FD8]' :
                        step.status === 'failed' ? 'bg-[#C1341A]' :
                        'bg-[#6B6B6B]'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-xs text-[#A8A49E] mt-2">
                  {pipeline.steps.map(s => s.from + '→' + s.to).join(' → ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Agent Table - Now shows role and in-progress count */}
        <div className="col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-3">Agent Status</h3>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
                  <th scope="col" className="text-left py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Agent</th>
                  <th scope="col" className="text-left py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Role</th>
                  <th scope="col" className="text-left py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Status</th>
                  <th scope="col" className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Active</th>
                  <th scope="col" className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Pending</th>
                  <th scope="col" className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Done</th>
                  <th scope="col" className="text-right py-3 px-4 text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && agentStats.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
                      <td className="py-3 px-4"><div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-24 animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 animate-pulse" /></td>
                      <td className="py-3 px-4"><div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 animate-pulse" /></td>
                      <td className="py-3 px-4 text-right"><div className="h-5 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-8 ml-auto animate-pulse" /></td>
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
                        <span className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">{stats.role}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 text-xs uppercase tracking-wider ${getStatusBadge(stats.status)}`}>
                          {stats.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/context?agent=${id}`} className="block">
                          <span className={`font-mono ${(stats.inProgress || 0) > 0 ? 'text-[#1B4FD8] font-medium' : 'text-[#A8A49E] dark:text-[#6B6B6B]'}`}>
                            {stats.inProgress || 0}
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/context?agent=${id}`} className="block">
                          <span className={`font-mono ${stats.pending > 0 ? 'text-amber-500 font-medium' : 'text-[#A8A49E] dark:text-[#6B6B6B]'}`}>
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

        {/* Recent Activity - Now shows pipeline IDs */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-3">Recent Activity</h3>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 space-y-3">
            {dashboard?.recent.length === 0 && (
              <p className="text-sm text-[#A8A49E] dark:text-[#6B6B6B]">No recent activity</p>
            )}
            {dashboard?.recent.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 ${
                  item.status === 'completed' ? 'bg-[#1B7A4A]' : 
                  item.status === 'in_progress' ? 'bg-[#1B4FD8]' :
                  item.status === 'failed' ? 'bg-[#C1341A]' :
                  'bg-amber-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">
                    {item.from} → {item.to}
                    {/* FIX #4: Show pipeline ID */}
                    {item.pipelineId && (
                      <span className="ml-1 text-violet-500">[{item.pipelineId.slice(0, 8)}]</span>
                    )}
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
