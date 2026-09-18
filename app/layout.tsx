import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap', // Optimize font loading
});

export const metadata: Metadata = {
  title: 'Lecture Transcribe AI',
  description:
    'Upload lecture videos, generate transcripts, chapters, and clarifications with AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="bg-surface dark:bg-slate-950"
      suppressHydrationWarning
    >
      <head>
        {/* Critical resource optimization */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Inline critical CSS for LCP element */}
        <style>{`
          .lcp-text { 
            font-size: 0.875rem; 
            line-height: 1.25rem; 
            color: rgb(100 116 139); 
          }
          .dark .lcp-text { 
            color: rgb(203 213 225); 
          }
        `}</style>
      </head>
      <body
        className={cn(
          'min-h-screen bg-surface text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100',
          inter.variable
        )}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
