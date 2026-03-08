'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/workspace', label: 'Workspace' },
  { href: '/create', label: 'Create Handoff' },
  { href: '/templates', label: 'Templates' },
  { href: '/context', label: 'Agent Context' },
  { href: '/timeline', label: 'Timeline' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="sidebar fixed left-0 top-0 h-screen w-[200px] flex flex-col z-50">
      <div className="px-5 py-6 border-b-2 border-[#1A1A1A]">
        <Link href="/" className="block">
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AHM</h1>
          <p className="text-xs uppercase tracking-widest text-[#A8A49E] mt-0.5">Handoff Manager</p>
        </Link>
      </div>

      <nav className="flex-1 px-5 py-6">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block py-2.5 text-xs uppercase tracking-widest transition-all duration-150 relative ${isActive ? 'pl-3 text-[#1B4FD8] font-medium' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'}`}
            >
              {item.label}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#1B4FD8]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-[#E4E2DC]">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 rounded text-xs uppercase tracking-widest text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F5F5F3] transition-all duration-150"
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

      <div className="px-5 py-4 border-t border-[#E4E2DC]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1B4FD8] animate-pulse" />
          <span className="text-xs font-mono text-[#A8A49E]">API Connected</span>
        </div>
      </div>
    </aside>
  );
}
