import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { MobileNav } from '@/components/MobileNav';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ReactQueryProvider } from '@/components/ReactQueryProvider';

export const metadata: Metadata = {
  title: 'Agent Handoff Manager | Chromapages',
  description: 'Manage agent handoffs and context for the Chromapages AI team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#1B4FD8] focus:text-white focus:rounded-md"
        >
          Skip to main content
        </a>
        <ReactQueryProvider>
          <ThemeProvider>
            <ToastProvider>
              <ErrorBoundary>
                <MobileNav />
                <div className="hidden lg:block">
                  <Navbar />
                </div>
                <main id="main-content" className="lg:ml-60 min-h-screen pt-14 lg:pt-0">
                  <div className="w-full px-4 py-8 lg:px-6 xl:px-8">
                    {children}
                  </div>
                </main>
              </ErrorBoundary>
            </ToastProvider>
          </ThemeProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
