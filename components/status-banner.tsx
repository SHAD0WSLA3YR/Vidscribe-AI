'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LazyShaderAnimation } from '@/components/lazy-shader-animation';

export type ProgressStage =
  | 'idle'
  | 'processing'
  | 'uploading'
  | 'transcribing'
  | 'finalizing'
  | 'analyzing'
  | 'generating';

interface StatusBannerProps {
  message?: string | null;
  error?: string | null;
  isBusy?: boolean;
  onDismiss?: () => void;
  stage?: ProgressStage;
  progress?: number;
}

// Stage configuration with progress ranges and messages
const STAGE_CONFIG: Record<
  ProgressStage,
  { range: [number, number]; defaultMessage: string }
> = {
  idle: { range: [0, 0], defaultMessage: '' },
  processing: { range: [0, 20], defaultMessage: 'Processing video file...' },
  uploading: { range: [20, 40], defaultMessage: 'Uploading to AssemblyAI...' },
  transcribing: {
    range: [40, 95],
    defaultMessage:
      'Transcribing audio... This may take a few minutes for longer videos',
  },
  finalizing: { range: [95, 100], defaultMessage: 'Finalizing transcript...' },
  analyzing: { range: [0, 60], defaultMessage: 'Analyzing selected text...' },
  generating: {
    range: [60, 100],
    defaultMessage: 'Generating AI explanation...',
  },
};

export function StatusBanner({
  message,
  error,
  isBusy,
  onDismiss,
  stage = 'idle',
  progress: externalProgress,
}: StatusBannerProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (isBusy && stage !== 'idle') {
      // If external progress is provided, use it directly
      if (typeof externalProgress === 'number') {
        setProgress(externalProgress);
        return;
      }

      // Otherwise, simulate progress based on stage
      const stageConfig = STAGE_CONFIG[stage];
      const [minProgress, maxProgress] = stageConfig.range;

      // Start at the minimum of the stage range
      setProgress(minProgress);

      interval = setInterval(() => {
        setProgress((prev) => {
          // Don't go beyond the stage's max progress
          if (prev >= maxProgress - 1) return prev;

          // Calculate increment based on position in range
          const rangeSize = maxProgress - minProgress;
          const progressInRange = prev - minProgress;
          const percentageInRange = progressInRange / rangeSize;

          // Slower progress as we get closer to the end of the range
          // Fast at start (20-30% of range), slower at end (5-10% of range)
          let increment: number;
          if (percentageInRange < 0.3) {
            increment = Math.random() * 4 + 2; // 2-6
          } else if (percentageInRange < 0.7) {
            increment = Math.random() * 2 + 1; // 1-3
          } else {
            increment = Math.random() * 1 + 0.5; // 0.5-1.5
          }

          return Math.min(prev + increment, maxProgress - 1);
        });
      }, 300);
    } else if (!isBusy) {
      setProgress((prev) => (prev === 0 ? 0 : 100));
      timeout = setTimeout(() => setProgress(0), 500);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [isBusy, stage, externalProgress]);

  if (!message && !error && !isBusy) return null;

  // Use stage's default message if no custom message provided
  const displayMessage =
    message || (stage !== 'idle' ? STAGE_CONFIG[stage].defaultMessage : null);

  const showShader = Boolean(isBusy && !error);
  const containerClass = cn(
    'relative overflow-hidden rounded-xl border px-4 py-3 text-sm shadow-sm transition-colors',
    error
      ? 'border-red-200 bg-red-50 text-red-700'
      : showShader
      ? 'border-slate-700/40 bg-slate-900 text-slate-50'
      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
  );
  const showClose = Boolean(
    onDismiss && (error || (!isBusy && displayMessage))
  );

  const content = (
    <div className="relative flex w-full items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {isBusy ? (
          <Loader2
            className={cn(
              'h-4 w-4 animate-spin',
              showShader ? 'text-slate-100' : undefined
            )}
          />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        <span>{error ?? displayMessage}</span>
      </div>

      <div className="flex items-center gap-2">
        {showShader && (
          <span className="font-semibold tracking-wide text-slate-100">
            {Math.round(progress)}%
          </span>
        )}
        {showClose && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              'rounded-full p-1 transition',
              error
                ? 'text-red-400 hover:bg-red-200/40 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400'
                : showShader
                ? 'text-slate-100/80 hover:bg-slate-100/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100/80'
                : 'text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400'
            )}
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  if (error) {
    return (
      <div className={containerClass} role="alert">
        {content}
      </div>
    );
  }

  return (
    <div className={containerClass} role="status" aria-live="polite">
      {showShader && (
        <>
          <LazyShaderAnimation
            zoom={0.45}
            className="pointer-events-none absolute inset-0 opacity-70"
          />
          <div className="absolute inset-0 bg-slate-950/60" />
        </>
      )}
      {content}
    </div>
  );
}
