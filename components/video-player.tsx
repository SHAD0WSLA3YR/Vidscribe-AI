'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Chapter } from '@/types';
import { cn, formatTime } from '@/lib/utils';

export interface VideoPlayerHandle {
  seek: (time: number) => void;
}

interface VideoPlayerProps {
  src: string | null;
  poster?: string;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  chapters: Chapter[];
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  (
    {
      src,
      poster,
      currentTime,
      duration,
      onTimeUpdate,
      onLoadedMetadata,
      chapters,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        seek: (time: number) => {
          if (!videoRef.current) return;
          videoRef.current.currentTime = time;
        },
      }),
      []
    );

    return (
      <div className="flex h-full flex-col gap-3" role="region" aria-label="Video Player">
        <div className="relative overflow-hidden rounded-2xl bg-black shadow-lg">
          {src ? (
            <video
              ref={videoRef}
              className="h-full w-full"
              controls
              controlsList="nodownload"
              onTimeUpdate={(event) =>
                onTimeUpdate((event.target as HTMLVideoElement).currentTime)
              }
              onLoadedMetadata={(event) =>
                onLoadedMetadata((event.target as HTMLVideoElement).duration)
              }
              src={src}
              poster={poster}
              aria-label="Lecture video player"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-slate-400">
              Upload a lecture video to get started
            </div>
          )}
        </div>
        {src && duration > 0 && (
          <div className="flex flex-col gap-2" role="region" aria-label="Video timeline and chapters">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-300" role="timer" aria-live="off">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="cursor-target relative h-2 rounded-full bg-slate-200 shadow-inner dark:bg-slate-700">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = chapter.start;
                    }
                  }}
                  className={cn(
                    'cursor-target absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-blue-400 transition hover:h-4 hover:bg-blue-500',
                    'after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:whitespace-nowrap after:rounded after:bg-slate-900 after:px-2 after:py-1 after:text-[10px] after:text-white after:opacity-0 after:shadow-lg after:transition hover:after:opacity-100 dark:after:bg-slate-700'
                  )}
                  style={{ left: `${(chapter.start / duration) * 100}%` }}
                  title={`${formatTime(chapter.start)} ${chapter.title}`}
                  aria-label={`Jump to ${chapter.title} at ${formatTime(chapter.start)}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
