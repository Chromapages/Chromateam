'use client';

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { fetchMetrics } from '@/lib/api';

interface MetricPoint {
  timestamp: string;
  value: number;
}

interface MetricsData {
  totalHandoffs: number;
  completedHandoffs: number;
  pendingHandoffs: number;
  avgCompletionTimeMinutes: number;
  completionRate: number;
  byAgent: Record<string, {
    total: number;
    completed: number;
    pending: number;
    avgTime: number;
  }>;
  dailyTrend: MetricPoint[];
  priorityBreakdown: Record<string, number>;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchMetrics();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-lg font-medium text-[#1A1A1A] dark:text-[#FAFAF8] mb-2">Error Loading Metrics</h2>
        <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] mb-4">{error}</p>
        <button onClick={loadMetrics} className="btn-secondary">Retry</button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader 
        title="Performance Metrics" 
        subtitle={metrics ? `${metrics.completionRate.toFixed(1)}% completion rate · ${metrics.avgCompletionTimeMinutes.toFixed(0)}m avg time` : 'Loading...'}
      />

      {/* Overview Cards */}
      {isLoading || !metrics ? (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
              <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-20 mb-3 animate-pulse rounded" />
              <div className="h-8 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Total Handoffs</div>
            <div className="text-3xl font-bold text-[#1A1A1A] dark:text-[#FAFAF8]">{metrics.totalHandoffs}</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Completion Rate</div>
            <div className="text-3xl font-bold text-[#1B7A4A]">{metrics.completionRate.toFixed(1)}%</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Avg Time</div>
            <div className="text-3xl font-bold text-[#1B4FD8]">{metrics.avgCompletionTimeMinutes.toFixed(0)}m</div>
          </div>
          <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
            <div className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-1">Pending</div>
            <div className="text-3xl font-bold text-[#A07020]">{metrics.pendingHandoffs}</div>
          </div>
        </div>
      )}

      {/* Priority Breakdown */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-4">Priority Breakdown</h3>
          {isLoading || !metrics ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 animate-pulse rounded" />
                  <div className="h-2 bg-[#E4E2DC] dark:bg-[#3A3A3A] flex-1 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(metrics.priorityBreakdown).map(([priority, count]) => {
                const max = Math.max(...Object.values(metrics.priorityBreakdown));
                const pct = max > 0 ? (count / max) * 100 : 0;
                const colors: Record<string, string> = {
                  high: '#C1341A',
                  medium: '#A07020',
                  low: '#1B7A4A'
                };
                return (
                  <div key={priority} className="flex items-center gap-3">
                    <span className="text-xs uppercase w-16 text-[#6B6B6B] dark:text-[#A8A49E]">{priority}</span>
                    <div className="flex-1 h-2 bg-[#E4E2DC] dark:bg-[#3A3A3A] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: colors[priority] || '#1B4FD8' }}
                      />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agent Performance Table */}
        <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-4">Agent Performance</h3>
          {isLoading || !metrics ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
                    <th className="text-left py-2 text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Agent</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Total</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Completed</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Avg Time</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.byAgent)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([agent, stats]) => (
                      <tr key={agent} className="border-b border-[#E4E2DC]/50 dark:border-[#3A3A3A]/50">
                        <td className="py-2 text-sm text-[#1A1A1A] dark:text-[#FAFAF8] font-medium capitalize">{agent}</td>
                        <td className="py-2 text-sm text-right font-mono">{stats.total}</td>
                        <td className="py-2 text-sm text-right font-mono text-[#1B7A4A]">{stats.completed}</td>
                        <td className="py-2 text-sm text-right font-mono">{stats.avgTime.toFixed(0)}m</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
