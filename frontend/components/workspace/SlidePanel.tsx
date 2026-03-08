'use client';

import { ReactNode } from 'react';

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function SlidePanel({ isOpen, onClose, title, children }: SlidePanelProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/10 z-40"
          onClick={onClose}
        />
      )}
      
      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-[400px] max-w-[90vw] bg-white dark:bg-[#1A1A1A] border-l border-[#E4E2DC] dark:border-[#3A3A3A]
          transform transition-transform duration-300 z-50
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          overflow-y-auto
        `}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#1A1A1A] border-b border-[#E4E2DC] dark:border-[#3A3A3A] px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-lg text-[#1A1A1A] dark:text-[#FAFAF8]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#6B6B6B] dark:text-[#A8A49E] hover:text-[#1A1A1A] dark:hover:text-[#FAFAF8] hover:bg-[#FAFAF8] dark:hover:bg-[#242424] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {children}
        </div>
      </div>
    </>
  );
}
