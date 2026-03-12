'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, ChevronRight, X, CheckCircle2, Clock, AlertCircle, Zap } from 'lucide-react';

interface FeedEvent {
  id: string;
  type: 'completed' | 'pending' | 'in_progress' | 'cancelled' | 'pipeline';
  message: string;
  timestamp: string;
}

interface ActivityFeedProps {
  wsUrl: string;
}

const MAX_EVENTS = 50;

function getEventIcon(type: FeedEvent['type']) {
  switch (type) {
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-[#1B7A4A] shrink-0" />;
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-[#A07020] shrink-0" />;
    case 'in_progress':
      return <Zap className="w-3.5 h-3.5 text-[#1B4FD8] shrink-0" />;
    case 'cancelled':
      return <X className="w-3.5 h-3.5 text-[#C1341A] shrink-0" />;
    case 'pipeline':
      return <AlertCircle className="w-3.5 h-3.5 text-[#6B3AB5] shrink-0" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-[#A8A49E] shrink-0" />;
  }
}

function getEventColor(type: FeedEvent['type']): string {
  switch (type) {
    case 'completed': return 'text-[#1B7A4A]';
    case 'pending': return 'text-[#A07020]';
    case 'in_progress': return 'text-[#1B4FD8]';
    case 'cancelled': return 'text-[#C1341A]';
    case 'pipeline': return 'text-[#6B3AB5]';
    default: return 'text-[#6B6B6B]';
  }
}

function useRelativeTime(isoTimestamp: string): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(isoTimestamp).getTime();
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) setLabel(`${seconds}s ago`);
      else if (seconds < 3600) setLabel(`${Math.floor(seconds / 60)}m ago`);
      else setLabel(`${Math.floor(seconds / 3600)}h ago`);
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [isoTimestamp]);

  return label;
}

function EventRow({ event }: { event: FeedEvent }) {
  const relTime = useRelativeTime(event.timestamp);
  return (
    <div className="flex items-start gap-2 py-2 border-b border-[#E4E2DC] dark:border-[#2A2A2A] last:border-b-0">
      <span className="mt-0.5">{getEventIcon(event.type)}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${getEventColor(event.type)}`}>{event.message}</p>
        <span className="text-[10px] text-[#A8A49E] dark:text-[#6B6B6B] mt-0.5 block">{relTime}</span>
      </div>
    </div>
  );
}

export default function ActivityFeed({ wsUrl }: ActivityFeedProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const addEvent = useCallback((event: FeedEvent) => {
    setEvents((prev) => {
      const next = [event, ...prev].slice(0, MAX_EVENTS);
      return next;
    });
    setUnread((n) => (isOpenRef.current ? 0 : n + 1));
  }, []);

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 3000;

    const connect = () => {
      // Close existing if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ActivityFeed] WebSocket connected');
        reconnectAttempts = 0;
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const type = data.type as string;
          const handoff = data.handoff || data.data;

          if (!handoff) return;

          const fromName = handoff.fromAgent || 'System';
          const toName = handoff.toAgent || 'Unknown';
          const task = (handoff.task || '').substring(0, 40) + ((handoff.task || '').length > 40 ? '…' : '');

          let feedType: FeedEvent['type'] = 'pending';
          let message = '';

          if (type === 'handoff_created' || type === 'pending' || type === 'created') {
            feedType = 'pending';
            message = `${fromName} → ${toName}: ${task}`;
          } else if (type === 'handoff_completed' || type === 'completed') {
            feedType = 'completed';
            message = `${toName} completed: ${task}`;
          } else if (type === 'handoff_started' || type === 'in_progress' || type === 'updated') {
            feedType = 'in_progress';
            message = `${toName} started: ${task}`;
          } else if (type === 'cancelled') {
            feedType = 'cancelled';
            message = `Cancelled: ${task}`;
          } else if (type === 'pipeline_complete') {
            feedType = 'pipeline';
            message = `Pipeline complete: ${task}`;
          } else {
            return;
          }

          addEvent({
            id: `${Date.now()}-${Math.random()}`,
            type: feedType,
            message,
            timestamp: new Date().toISOString(),
          });
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Silently handle - onclose will trigger reconnect
      };

      ws.onclose = (event) => {
        wsRef.current = null;

        // Attempt reconnect unless normal closure
        if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 4);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [wsUrl, addEvent]);

  // Reset unread when opening
  const handleOpen = () => {
    setIsOpen(true);
    setUnread(0);
  };

  return (
    <>
      {/* Toggle button - bottom-right of canvas */}
      <button
        onClick={isOpen ? () => setIsOpen(false) : handleOpen}
        className={`
          relative flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider font-medium
          bg-white dark:bg-[#242424] border transition-colors
          ${isOpen
            ? 'border-[#1B4FD8] text-[#1B4FD8]'
            : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8] hover:text-[#1B4FD8]'}
        `}
      >
        <Activity className="w-3.5 h-3.5" />
        Activity
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1B4FD8] text-[9px] text-white font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <ChevronRight
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Slide-in feed panel with animation */}
      <div 
        className={`
          absolute top-0 right-0 h-full w-72 bg-white dark:bg-[#1A1A1A] border-l border-[#E4E2DC] dark:border-[#3A3A3A] shadow-xl z-20 flex flex-col
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E2DC] dark:border-[#3A3A3A] shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1B4FD8]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#1A1A1A] dark:text-[#FAFAF8]">
              Live Activity
            </span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Feed list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Activity className="w-8 h-8 text-[#E4E2DC] dark:text-[#3A3A3A] mb-3" />
              <p className="text-xs text-[#A8A49E] dark:text-[#6B6B6B]">Waiting for activity…</p>
            </div>
          ) : (
            <>
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>

          {/* Clear button */}
          {events.length > 0 && (
            <div className="px-4 py-2 border-t border-[#E4E2DC] dark:border-[#3A3A3A] shrink-0">
              <button
                onClick={() => setEvents([])}
                className="text-[10px] uppercase tracking-wider text-[#A8A49E] hover:text-[#C1341A] transition-colors"
              >
                Clear feed
              </button>
            </div>
          )}
        </div>
    </>
  );
}
