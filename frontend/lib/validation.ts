import { z } from 'zod';

export const CreateHandoffSchema = z.object({
  fromAgent: z.string().min(1, 'From agent is required'),
  toAgent: z.string().min(1, 'To agent is required'),
  task: z.string().min(1, 'Task is required').max(500, 'Task must be 500 characters or less'),
  context: z.string().max(2000, 'Context must be 2000 characters or less'),
  decisions: z.array(z.string().min(1).max(200)).max(10, 'Maximum 10 decisions allowed'),
  nextSteps: z.array(z.string().min(1).max(200)).max(10, 'Maximum 10 next steps allowed'),
  priority: z.enum(['low', 'medium', 'high']),
});

export const CreatePipelineSchema = z.object({
  agents: z.array(z.string().min(1)).min(2, 'At least 2 agents required for pipeline'),
  task: z.string().min(1, 'Task is required').max(500, 'Task must be 500 characters or less'),
  context: z.string().max(2000, 'Context must be 2000 characters or less'),
  priority: z.enum(['low', 'medium', 'high']),
});

export const TemplateExecuteSchema = z.object({
  task: z.string().min(1, 'Task is required').max(500, 'Task must be 500 characters or less'),
  context: z.string().max(2000, 'Context must be 2000 characters or less'),
  priority: z.enum(['low', 'medium', 'high']),
});

export const ChatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000, 'Message must be 1000 characters or less'),
});

export const ScheduleSchema = z.object({
  task: z.string().min(1, 'Task is required').max(500),
  fromAgent: z.string().min(1, 'From agent is required'),
  toAgent: z.string().min(1, 'To agent is required'),
  context: z.string().max(2000),
  priority: z.enum(['low', 'medium', 'high']),
  scheduledAt: z.string().datetime(),
});

export type CreateHandoffInput = z.infer<typeof CreateHandoffSchema>;
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type TemplateExecuteInput = z.infer<typeof TemplateExecuteSchema>;
export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;
export type ScheduleInput = z.infer<typeof ScheduleSchema>;
