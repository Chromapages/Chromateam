'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchAllHandoffs, fetchHandoffDeliverables, DeliverableFile } from '@/lib/api';
import { Handoff } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, Folder, FileText, X } from 'lucide-react';
import { useWebSocket } from '@/lib/useWebSocket';

type StatusFilter = 'all' | 'pending' | 'completed';

export default function TimelinePage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const data = await fetchAllHandoffs();
      const sorted = data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setHandoffs(sorted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load handoffs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle WebSocket messages for real-time updates
  const handleWebSocketMessage = useCallback((message: { type: string; handoff: Handoff }) => {
    setHandoffs((prev) => {
      const existing = prev.find((h) => h.id === message.handoff.id);
      
      if (message.type === 'created' && !existing) {
        // Add new handoff
        return [message.handoff, ...prev].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } else if (existing) {
        // Update existing handoff
        return prev.map((h) => h.id === message.handoff.id ? message.handoff : h);
      }
      
      return prev;
    });
  }, []);

  // Connect to WebSocket - use env var or default to localhost
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3461';
  useWebSocket(wsUrl, handleWebSocketMessage);

  // Initial load only
  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = filter === 'all' ? handoffs : handoffs.filter((h) => h.status === filter);

  const pendingCount = handoffs.filter((h) => h.status === 'pending').length;
  const completedCount = handoffs.filter((h) => h.status === 'completed').length;

  return (
    <div>
      <PageHeader 
        title="Handoff Chronicle" 
        subtitle={`${handoffs.length} total · ${pendingCount} pending · ${completedCount} completed`}
      />

      {/* Filter Tabs */}
      <div className="flex items-center gap-6 mb-8">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs uppercase tracking-widest pb-2 border-b-2 transition-colors ${
              filter === f
                ? 'border-[#1B4FD8] text-[#1A1A1A] dark:text-[#FAFAF8] font-medium'
                : 'border-transparent text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8]'
            }`}
          >
            {f}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-2 font-mono text-[#1B4FD8]">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="border border-[#C1341A] text-[#C1341A] dark:border-[#EF4444] dark:text-[#EF4444] px-4 py-3 mb-6">
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
              <div className="w-2 h-2 rounded-full bg-[#E4E2DC] dark:bg-[#3A3A3A] mt-2" />
              <div className="flex-1">
                <div className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-1/4 mb-2" />
                <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No handoffs yet</p>
          <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B] mt-1">Create a handoff to see it appear here</p>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && filtered.length > 0 && (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[#D1CFC8] dark:bg-[#3A3A3A]" />

          <div className="space-y-0">
            {filtered.map((h, i) => (
              <ChronicleEntry
                key={h.id}
                handoff={h}
                isLast={i === filtered.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverablesModal({
  handoffId,
  onClose,
}: {
  handoffId: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DeliverableFile[]>([]);
  const [outputPath, setOutputPath] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHandoffDeliverables(handoffId)
      .then((data) => {
        setFiles(data.files);
        setOutputPath(data.path);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load files'))
      .finally(() => setIsLoading(false));
  }, [handoffId]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (ext: string) => {
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    if (imageExts.includes(ext)) return '🖼';
    if (['.md', '.txt'].includes(ext)) return '📝';
    if (['.json'].includes(ext)) return '📋';
    if (['.html', '.css'].includes(ext)) return '🌐';
    if (['.js', '.ts', '.tsx', '.py'].includes(ext)) return '💻';
    if (ext === '.pdf') return '📄';
    return '📁';
  };

  const BASE_URL = 'http://localhost:3458';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-[#1B4FD8]" strokeWidth={1.5} />
            <span className="text-sm font-semibold text-[#1A1A1A] dark:text-[#FAFAF8]">Deliverables</span>
            {!isLoading && !error && (
              <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">{files.length} file{files.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={onClose} className="text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Path */}
        {outputPath && (
          <div className="px-5 py-2 border-b border-[#E4E2DC] dark:border-[#3A3A3A] bg-[#F5F4F0] dark:bg-[#242424]">
            <span className="text-[10px] font-mono text-[#A8A49E] dark:text-[#6B6B6B] break-all">{outputPath}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-[#E4E2DC] dark:bg-[#3A3A3A] animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-[#C1341A] text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && files.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <Folder className="h-10 w-10 text-[#E4E2DC] dark:text-[#3A3A3A] mx-auto" strokeWidth={1} />
              <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No files found</p>
              <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">Files will appear here once the agent saves deliverables to this directory</p>
            </div>
          )}

          {!isLoading && !error && files.length > 0 && (
            <div className="space-y-1">
              {files.map((file, i) => {
                const fileUrl = `${BASE_URL}/output/${file.fullPath.replace(BASE_URL, '').replace('/Volumes/MiDRIVE/Chroma-Team/output/', '')}`;
                return (
                  <a
                    key={i}
                    href={`${BASE_URL}/output/${file.fullPath.split('/output/')[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 border border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/50 hover:bg-[#1B4FD8]/5 transition-colors group"
                  >
                    <span className="text-lg flex-shrink-0">{getFileIcon(file.ext)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1A1A] dark:text-[#FAFAF8] truncate group-hover:text-[#1B4FD8] transition-colors">
                        {file.path}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">{formatSize(file.size)}</span>
                        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">·</span>
                        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B]">
                          {new Date(file.modified).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <FileText className="h-3.5 w-3.5 text-[#A8A49E] group-hover:text-[#1B4FD8] flex-shrink-0 transition-colors" strokeWidth={1.5} />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChronicleEntry({
  handoff,
  isLast,
}: {
  handoff: Handoff;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeliverables, setShowDeliverables] = useState(false);
  
  const time = new Date(handoff.createdAt).toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const truncatedTask = handoff.task.length > 50 ? handoff.task.substring(0, 50) + '...' : handoff.task;
  const hasResponse = handoff.agentResponse && handoff.agentResponse.trim().length > 0;
  const hasDetails = hasResponse || handoff.context || handoff.pipelineId;

  const getStatusIcon = () => {
    switch (handoff.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-[#6B9E6B]" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-[#1B4FD8]" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-[#C1341A]" />;
      default:
        return <Clock className="h-4 w-4 text-[#A8A49E]" />;
    }
  };

  const getStatusColor = () => {
    switch (handoff.status) {
      case 'completed':
        return 'bg-[#6B9E6B]';
      case 'in_progress':
        return 'bg-[#1B4FD8]';
      case 'failed':
        return 'bg-[#C1341A]';
      default:
        return 'bg-[#A8A49E]';
    }
  };

  return (
    <div className="relative py-4 border-b border-[#E4E2DC] dark:border-[#3A3A3A] last:border-b-0">
      <div className="flex items-start gap-4">
        {/* Dot */}
        <div className={`relative z-10 w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${getStatusColor()}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B]">{time}</span>
              <span className="text-[#6B6B6B] dark:text-[#A8A49E]">→</span>
              <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{handoff.fromAgent}</span>
              <span className="text-[#A8A49E] dark:text-[#6B6B6B]">→</span>
              <span className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8]">{handoff.toAgent}</span>
              {handoff.pipelineId && (
                <span className="text-[10px] px-2 py-0.5 bg-[#1B4FD8]/10 text-[#1B4FD8] border border-[#1B4FD8]/20 font-mono">
                  Step {handoff.pipelineStep}/{handoff.pipelineTotalSteps}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getStatusIcon()}
              <span className={`status-pill ${
                handoff.status === 'completed' ? 'border-[#6B9E6B] text-[#6B9E6B]' : 
                handoff.status === 'failed' ? 'border-[#C1341A] text-[#C1341A]' :
                'border-[#1B4FD8] text-[#1B4FD8]'
              }`}>
                {handoff.status.toUpperCase()}
              </span>
            </div>
          </div>
          
          <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] mt-1">{isExpanded ? handoff.task : truncatedTask || '(no task)'}</p>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-2">
            {hasDetails && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-[#1B4FD8] hover:text-[#1B4FD8]/80 transition-colors"
              >
                {isExpanded ? (
                  <><ChevronUp className="h-3 w-3" />Hide details</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />{hasResponse ? 'Show agent response' : 'Show details'}</>
                )}
              </button>
            )}
            {handoff.status === 'completed' && (
              <button
                onClick={() => setShowDeliverables(true)}
                className="flex items-center gap-1 text-xs text-[#6B9E6B] hover:text-[#6B9E6B]/80 transition-colors"
              >
                <Folder className="h-3 w-3" />
                View Deliverables
              </button>
            )}
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-[#E4E2DC] dark:border-[#3A3A3A]">
              {handoff.context && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] block mb-1">Context</span>
                  <p className="text-xs text-[#6B6B6B] dark:text-[#A8A49E] whitespace-pre-wrap">{handoff.context}</p>
                </div>
              )}
              
              {hasResponse && (
                <div className="bg-[#FAFAF8] dark:bg-[#1A1A1A] border border-[#E4E2DC] dark:border-[#3A3A3A] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B]">Agent Response</span>
                    {handoff.responseAt && (
                      <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] font-mono">
                        {new Date(handoff.responseAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#1A1A1A] dark:text-[#FAFAF8] whitespace-pre-wrap">{handoff.agentResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showDeliverables && (
        <DeliverablesModal
          handoffId={handoff.id}
          onClose={() => setShowDeliverables(false)}
        />
      )}
    </div>
  );
}
