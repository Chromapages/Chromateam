'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/workspace', label: 'Workspace' },
  { href: '/create', label: 'Create Handoff' },
  { href: '/context', label: 'Agent Context' },
  { href: '/automations', label: 'Operations' },
  { href: '/board', label: 'Board' },
  { href: '/office', label: 'Office' },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#FAFAF8] dark:bg-[#1A1A1A] border-b border-[#E4E2DC] dark:border-[#3A3A3A] z-50 flex items-center justify-between px-4">
        <Link href="/" className="font-bold text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          AHM
        </Link>
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isOpen}
          className="p-2 rounded-md hover:bg-[#F5F5F3] dark:hover:bg-[#242424] transition-colors"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 top-14 bg-black/20 dark:bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Menu */}
      <nav 
        className={`lg:hidden fixed top-14 right-0 bottom-0 w-64 bg-[#FAFAF8] dark:bg-[#1A1A1A] border-l border-[#E4E2DC] dark:border-[#3A3A3A] z-50 transform transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Mobile navigation"
      >
        <div className="p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`block py-3 px-4 text-sm uppercase tracking-wider rounded-md transition-colors ${
                  isActive 
                    ? 'bg-[#1B4FD8]/10 text-[#1B4FD8] font-medium' 
                    : 'text-[#6B6B6B] dark:text-[#A8A49E] hover:bg-[#F5F5F3] dark:hover:bg-[#242424]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#E4E2DC] dark:border-[#3A3A3A]">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            className="w-full flex items-center justify-between px-4 py-3 rounded-md text-sm text-[#6B6B6B] dark:text-[#A8A49E] hover:bg-[#F5F5F3] dark:hover:bg-[#242424] transition-colors"
          >
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
            {theme === 'light' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
