'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the export menu with no SSR
const ExportMenu = dynamic(
  () =>
    import('@/components/export-menu').then((mod) => ({
      default: mod.ExportMenu,
    })),
  {
    ssr: false,
  }
);

interface LazyExportMenuProps {
  segments: any[];
  chapters: any[];
  videoName: string;
  comments?: any[];
}

export function LazyExportMenu({
  segments,
  chapters,
  videoName,
  comments,
}: LazyExportMenuProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Only load export menu after critical content
    const timer = setTimeout(() => {
      setShouldLoad(true);
    }, 1000); // Load after 1 second

    return () => clearTimeout(timer);
  }, []);

  if (!shouldLoad) {
    // Show minimal placeholder
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
          Export
        </span>
        <div className="flex gap-2">
          <div className="h-8 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div className="h-8 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div className="h-8 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"></div>
        </div>
      </div>
    );
  }

  return (
    <ExportMenu
      segments={segments}
      chapters={chapters}
      videoName={videoName}
      comments={comments}
    />
  );
}
