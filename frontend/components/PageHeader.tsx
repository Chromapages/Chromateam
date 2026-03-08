'use client';

import { useEffect, useState } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const day = now.toLocaleDateString('en-US', { weekday: 'short' });
      const date = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      setTime(`${day} ${date} · ${timeStr}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h1>
          {subtitle && (
            <p className="text-sm text-[#6B6B6B] dark:text-[#A8A49E] mt-1">{subtitle}</p>
          )}
        </div>
        <span className="font-mono text-xs text-[#A8A49E] dark:text-[#6B6B6B]">{time}</span>
      </div>
      <div className="mt-4 border-b-2 border-[#1A1A1A] dark:border-[#FAFAF8]" />
    </div>
  );
}
