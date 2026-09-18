'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import type { Chapter, TranscriptSegment, TranscriptComment } from '@/types';
import { segmentsToBlob } from '@/lib/exporters';
import { DEFAULT_TITLE } from '@/lib/title';
import { cn, downloadBlob } from '@/lib/utils';

interface SplitExportButtonProps {
  segments: TranscriptSegment[];
  chapters: Chapter[];
  videoName: string;
  comments?: TranscriptComment[];
  documentTitle: string;
  summary?: string | null;
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

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'transcript'
  );
}

export function SplitExportButton({
  segments,
  chapters,
  videoName,
  comments = [],
  documentTitle,
  summary,
}: SplitExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const effectiveTitle = documentTitle?.trim() || DEFAULT_TITLE;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = useCallback(
    async (format: 'pdf' | 'docx' | 'vtt' | 'txt' | 'md') => {
      if (segments.length === 0) return;
      setIsExporting(true);
      setExportingFormat(format.toUpperCase());
      setExportProgress(0);
      setIsDropdownOpen(false);

      try {
        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setExportProgress((prev) => {
            if (prev >= 90) return prev;
            return prev + Math.random() * 20;
          });
        }, 200);

        const blob = await segmentsToBlob(
          segments,
          chapters,
          format,
          comments,
          effectiveTitle,
          summary
        );

        clearInterval(progressInterval);
        setExportProgress(100);

        const baseName = videoName
          ? videoName.replace(/\.[^/.]+$/, '')
          : slugifyTitle(effectiveTitle || 'transcript');
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
    [chapters, segments, videoName, comments, effectiveTitle, summary]
  );

  const buttonBaseStyles = cn(
    'relative inline-flex items-center font-semibold tracking-tight transition-all duration-200 ease-out cursor-target',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    'disabled:pointer-events-none disabled:opacity-60'
  );

  const buttonThemeStyles = cn(
    'bg-[#E8DEF8] text-[#1D192B] shadow-[0_8px_24px_rgba(79,55,139,0.18)]',
    'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(79,55,139,0.22)]',
    'focus-visible:outline-[#4f378b]',
    'dark:bg-[#4f378b] dark:text-[#EADDFF]',
    'dark:shadow-[0_8px_24px_rgba(30,30,84,0.32)]',
    'dark:hover:shadow-[0_12px_32px_rgba(30,30,84,0.42)]'
  );

  return (
    <div className="flex flex-col gap-1">
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
                  /* eslint-disable-next-line react/forbid-dom-props */
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

        <div className="relative z-[100]" ref={dropdownRef}>
          {/* Split Button Container */}
          <div
            className={cn(
              buttonBaseStyles,
              buttonThemeStyles,
              'rounded-full text-sm'
            )}
          >
            {/* Main Export Button (PDF) */}
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={isExporting || segments.length === 0}
              className="cursor-target flex items-center gap-2 px-4 py-2 rounded-l-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <Download className="h-4 w-4 text-current opacity-80 transition-transform duration-200 group-hover:scale-110" />
              PDF
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-black/20 dark:bg-white/20" />

            {/* Dropdown Toggle */}
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isExporting || segments.length === 0}
              className="cursor-target flex items-center px-2 py-2 rounded-r-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="More export options"
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-current opacity-80 transition-transform duration-200',
                  isDropdownOpen && 'rotate-180'
                )}
              />
            </button>
          </div>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div
              className={cn(
                'absolute top-full right-0 mt-2 py-2 min-w-[120px] z-[9999]',
                'bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700',
                'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200'
              )}
            >
              {exportOptions.slice(1).map(({ format, label }) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => handleExport(format)}
                  disabled={isExporting || segments.length === 0}
                  className={cn(
                    'cursor-target w-full text-left px-4 py-2 text-sm font-medium transition-colors duration-150',
                    'hover:bg-slate-100 dark:hover:bg-slate-700',
                    'text-slate-700 dark:text-slate-300',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {segments.length === 0 && (
        <div className="min-h-[18px] text-[11px] text-slate-500 dark:text-slate-400">
          <span>Export options unlock after the transcript is ready.</span>
        </div>
      )}
    </div>
  );
}
