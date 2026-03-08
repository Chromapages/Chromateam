'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { Play, Loader2 } from 'lucide-react';

interface Template {
  name: string;
  steps: Array<{
    from: string;
    to: string;
    task: string;
    context: string;
  }>;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3461/api/templates')
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates))
      .catch((err) => console.error('Failed to load templates:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const executeTemplate = async (templateName: string) => {
    if (!task.trim()) {
      alert('Please enter a task');
      return;
    }

    setExecuting(templateName);
    try {
      const res = await fetch(`http://localhost:3461/api/template/${templateName}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, context, priority }),
      });

      if (!res.ok) throw new Error('Failed to execute template');

      const data = await res.json();
      alert(`✅ Template executed! Created ${data.executed} handoffs`);
      setTask('');
      setContext('');
      setSelectedTemplate(null);
    } catch (err) {
      alert('❌ Failed to execute template');
      console.error(err);
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div>
      <PageHeader 
        title="Templates" 
        subtitle={`${templates.length} workflow templates available`}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#A8A49E]" />
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E]">No templates found</p>
        </div>
      )}

      {!isLoading && templates.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Template List */}
          <div className="space-y-4">
            <h2 className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-4">
              Available Templates
            </h2>
            {templates.map((template) => (
              <div
                key={template.name}
                className={`border p-4 cursor-pointer transition-colors ${
                  selectedTemplate === template.name
                    ? 'border-[#1B4FD8] bg-[#1B4FD8]/5'
                    : 'border-[#E4E2DC] dark:border-[#3A3A3A] hover:border-[#1B4FD8]/50'
                }`}
                onClick={() => setSelectedTemplate(template.name)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-medium text-[#1A1A1A] dark:text-[#FAFAF8] mb-2">
                      {template.name}
                    </h3>
                    <div className="space-y-1">
                      {template.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-[#A8A49E] dark:text-[#6B6B6B]">{i + 1}.</span>
                          <span className="text-[#1A1A1A] dark:text-[#FAFAF8]">{step.from}</span>
                          <span className="text-[#A8A49E] dark:text-[#6B6B6B]">→</span>
                          <span className="text-[#1A1A1A] dark:text-[#FAFAF8]">{step.to}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 bg-[#E4E2DC] dark:bg-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E]">
                    {template.steps.length} steps
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Execution Form */}
          <div className="border border-[#E4E2DC] dark:border-[#3A3A3A] p-6">
            <h2 className="text-xs uppercase tracking-widest text-[#A8A49E] dark:text-[#6B6B6B] mb-4">
              Execute Template
            </h2>

            {!selectedTemplate && (
              <div className="text-center py-12 text-sm text-[#6B6B6B] dark:text-[#A8A49E]">
                Select a template to execute
              </div>
            )}

            {selectedTemplate && (
              <div className="space-y-4">
                <div>
                  <label className="section-label block mb-2">Task</label>
                  <textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder="What needs to be done?"
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>

                <div>
                  <label className="section-label block mb-2">Context (Optional)</label>
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Background information..."
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>

                <div>
                  <label className="section-label block mb-2">Priority</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`flex-1 py-2 text-xs uppercase tracking-wider border transition-colors ${
                          priority === p
                            ? 'border-[#1B4FD8] bg-[#1B4FD8] text-white'
                            : 'border-[#E4E2DC] dark:border-[#3A3A3A] text-[#6B6B6B] dark:text-[#A8A49E] hover:border-[#1B4FD8]/50'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => executeTemplate(selectedTemplate)}
                  disabled={!task.trim() || executing === selectedTemplate}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {executing === selectedTemplate ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Execute Template
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
