'use client';

import { memo } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface PipelineStep {
  agentId: string;
  agentName: string;
  status: 'completed' | 'in_progress' | 'pending';
}

interface PipelineProgressProps {
  steps: PipelineStep[];
  currentStep: number;
}

function PipelineProgress({ steps, currentStep }: PipelineProgressProps) {
  if (steps.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A49E] dark:text-[#6B6B6B] mb-3">
        Pipeline · Step {currentStep + 1} of {steps.length}
      </div>

      {/* Step track */}
      <div className="relative flex items-center">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed';
          const isActive = step.status === 'in_progress';
          const isPending = step.status === 'pending';

          return (
            <div key={step.agentId} className="flex items-center flex-1 min-w-0">
              {/* Connector line (before this step) */}
              {idx > 0 && (
                <div
                  className="h-[2px] flex-1 transition-colors duration-300"
                  style={{
                    backgroundColor: steps[idx - 1].status === 'completed'
                      ? '#1B4FD8'
                      : '#E4E2DC',
                  }}
                />
              )}

              {/* Step node */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`
                    flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-300
                    ${isCompleted
                      ? 'border-[#1B4FD8] bg-[#1B4FD8]'
                      : isActive
                      ? 'border-[#1B4FD8] bg-white dark:bg-[#242424]'
                      : 'border-[#E4E2DC] dark:border-[#3A3A3A] bg-white dark:bg-[#242424]'
                    }
                  `}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                  ) : isActive ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#1B4FD8] animate-spin" strokeWidth={2.5} />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[#E4E2DC] dark:text-[#3A3A3A]" strokeWidth={2} />
                  )}
                </div>

                {/* Agent name below step */}
                <span
                  className={`
                    mt-1.5 text-[9px] uppercase tracking-wide text-center max-w-[52px] leading-tight truncate
                    ${isCompleted ? 'text-[#1B4FD8]' : isActive ? 'text-[#1A1A1A] dark:text-[#FAFAF8] font-semibold' : 'text-[#A8A49E] dark:text-[#6B6B6B]'}
                  `}
                >
                  {step.agentName}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall fill bar */}
      <div className="mt-4 h-1 w-full bg-[#E4E2DC] dark:bg-[#3A3A3A] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1B4FD8] rounded-full transition-all duration-500"
          style={{
            width: `${steps.length > 1
              ? (steps.filter((s) => s.status === 'completed').length / (steps.length - 1)) * 100
              : 0}%`,
          }}
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[9px] text-[#A8A49E] dark:text-[#6B6B6B]">
        <span>{steps.filter((s) => s.status === 'completed').length} done</span>
        <span>{steps.filter((s) => s.status === 'pending').length} remaining</span>
      </div>
    </div>
  );
}

export default memo(PipelineProgress);
