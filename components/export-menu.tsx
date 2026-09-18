'use client';

import { useCallback, useState } from 'react';
import { Download } from 'lucide-react';
import type { Chapter, TranscriptSegment, TranscriptComment } from '@/types';
import { segmentsToBlob } from '@/lib/exporters';
import { cn, downloadBlob } from '@/lib/utils';

interface ExportMenuProps {
  segments: TranscriptSegment[];
  chapters: Chapter[];
  videoName: string;
  comments?: TranscriptComment[];
}

const exportOptions: Array<{
  format: 'pdf' | 'docx' | 'vtt' | 'txt' | 'md';
  label: string;
}> = [
  { format: 'pdf', label: 'PDF' },
  { format: 'docx', label: 'DOCX' },
  { format: 'vtt', label: 'VTT' },
  { format: 'txt', label: 'TXT' },
  { format: 'md', label: 'Markdown' },
];

const buttonBaseStyles =
  'cursor-target group relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60';

const buttonThemeStyles =
  'bg-[#E8DEF8] text-[#1D192B] shadow-[0_8px_24px_rgba(79,55,139,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(79,55,139,0.22)] focus-visible:outline-[#4f378b] dark:bg-[#4f378b] dark:text-[#EADDFF] dark:shadow-[0_8px_24px_rgba(30,30,84,0.32)] dark:hover:shadow-[0_12px_32px_rgba(30,30,84,0.42)]';

export function ExportMenu({
  segments,
  chapters,
  videoName,
  comments = [],
}: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: 'pdf' | 'docx' | 'vtt' | 'txt' | 'md') => {
      if (segments.length === 0) return;
      setIsExporting(true);
      setExportingFormat(format.toUpperCase());
      setExportProgress(0);

      try {
        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setExportProgress((prev) => {
            if (prev >= 90) return prev;
            return prev + Math.random() * 20;
          });
        }, 200);

        const blob = await segmentsToBlob(segments, chapters, format, comments);

        clearInterval(progressInterval);
        setExportProgress(100);

        const baseName = videoName
          ? videoName.replace(/\.[^/.]+$/, '')
          : 'transcript';
        downloadBlob(blob, `${baseName}.${format}`);

        // Short delay to show 100% completion
        setTimeout(() => {
          setExportProgress(0);
          setExportingFormat(null);
        }, 500);
      } finally {
        setIsExporting(false);
      }
    },
    [chapters, segments, videoName, comments]
  );

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
        Export
      </span>

      {isExporting && exportingFormat && (
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <div className="relative h-2 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 ease-out"
                // eslint-disable-next-line react/forbid-dom-props
                style={{
                  width: `${Math.min(100, Math.max(0, exportProgress))}%`,
                }}
              />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {exportingFormat} {Math.round(exportProgress)}%
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 md:flex-nowrap">
        {exportOptions.map(({ format, label }) => (
          <button
            key={format}
            type="button"
            onClick={() => handleExport(format)}
            disabled={isExporting || segments.length === 0}
            className={cn(
              buttonBaseStyles,
              buttonThemeStyles,
              'active:translate-y-0'
            )}
          >
            <Download className="h-4 w-4 text-current opacity-80 transition-transform duration-200 group-hover:scale-110" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
