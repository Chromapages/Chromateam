'use client';

import { memo, useState, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';

function useEdgeElapsed(createdAt?: string): { label: string; minutes: number } {
  const [state, setState] = useState({ label: '', minutes: 0 });

  useEffect(() => {
    if (!createdAt) return;

    const update = () => {
      const diff = Date.now() - new Date(createdAt).getTime();
      const totalSeconds = Math.floor(diff / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const hours = Math.floor(minutes / 60);

      let label = '';
      if (hours > 0) label = `${hours}h`;
      else if (minutes > 0) label = `${minutes}m`;
      else label = `${totalSeconds}s`;

      setState({ label, minutes });
    };

    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [createdAt]);

  return state;
}

function HandoffEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const priority = data?.priority as string | undefined;
  const task = data?.task as string | undefined;
  const status = data?.status as string | undefined;
  const createdAt = data?.createdAt as string | undefined;

  const { label: elapsedLabel, minutes: elapsedMinutes } = useEdgeElapsed(
    status !== 'completed' ? createdAt : undefined
  );

  const color = status === 'completed' ? '#A8A49E' : getPriorityColor(priority);

  const timerColor =
    elapsedMinutes >= 15 ? '#C1341A' : elapsedMinutes >= 5 ? '#A07020' : '#A8A49E';

  const truncatedTask = task && task.length > 22 ? task.substring(0, 22) + '…' : task;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: status === 'completed' ? '5,5' : 'none',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`
            px-2 py-1 text-xs font-mono bg-white dark:bg-[#242424] border
            ${selected ? 'border-[#1B4FD8] text-[#1B4FD8]' : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E]'}
            max-w-[180px] truncate cursor-pointer flex items-center gap-1.5
          `}
        >
          <span className="truncate">{truncatedTask || '(no task)'}</span>
          {elapsedLabel && status !== 'completed' && (
            <span
              className="shrink-0 text-[9px] font-bold"
              style={{ color: timerColor }}
            >
              {elapsedLabel}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'high':
      return '#C1341A';
    case 'medium':
      return '#A07020';
    case 'low':
      return '#1B7A4A';
    default:
      return '#1B4FD8';
  }
}

export default memo(HandoffEdge);
