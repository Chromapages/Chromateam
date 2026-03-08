import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Agent Handoff Manager | Chromapages',
  description: 'Manage agent handoffs and context for the Chromapages AI team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider>
          <Navbar />
          <main className="ml-60 min-h-screen">
            <div className="w-full px-4 py-8 lg:px-6 xl:px-8">
              {children}
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
