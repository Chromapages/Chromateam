'use client';

import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';

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

  const color = status === 'completed' ? '#A8A49E' : getPriorityColor(priority);

  const truncatedTask = task && task.length > 25 ? task.substring(0, 25) + '...' : task;

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
            max-w-[180px] truncate cursor-pointer
          `}
        >
          {truncatedTask || '(no task)'}
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
