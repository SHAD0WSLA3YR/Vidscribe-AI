'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, FileVideo } from 'lucide-react';
import { cn, formatTime } from '@/lib/utils';

interface VideoPreviewProps {
  file: File;
  onStartTranscription: (file: File) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function VideoPreview({
  file,
  onStartTranscription,
  onCancel,
  disabled,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = Number(event.target.value);
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [isPlaying]);

  const handleStartTranscription = useCallback(() => {
    onStartTranscription(file);
  }, [file, onStartTranscription]);

  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
  const estimatedTime = duration > 0 ? Math.ceil(duration / 60) : 'Unknown';

  return (
    <div className="rounded-3xl border border-slate-900/10 bg-white p-8 shadow-lg dark:border-slate-700/60 dark:bg-slate-800">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <FileVideo className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Video Preview
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              Review your video before starting transcription
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              File:
            </span>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              {file.name}
            </span>
          </div>
          <div>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Size:
            </span>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              {fileSizeMB} MB
            </span>
          </div>
          <div>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Duration:
            </span>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              {duration > 0 ? formatTime(duration) : 'Loading...'}
            </span>
          </div>
          <div>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Est. transcription:
            </span>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              ~{estimatedTime} min
            </span>
          </div>
        </div>
      </div>

      {videoUrl && (
        <div className="mb-6">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full rounded-lg bg-black"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            preload="metadata"
            controls
            muted={false}
          />

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePlayPause}
                className="cursor-target flex items-center justify-center rounded-full bg-primary p-2 text-white shadow-sm transition hover:bg-blue-600"
                disabled={disabled}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="cursor-target flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                disabled={disabled}
                aria-label="Reset video to beginning"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="cursor-target w-full"
              disabled={disabled || duration === 0}
              aria-label="Video timeline scrubber"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-target rounded-full border border-slate-200 px-6 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          disabled={disabled}
        >
          Choose Different File
        </button>

        <button
          type="button"
          onClick={handleStartTranscription}
          className={cn(
            'cursor-target inline-flex items-center rounded-full px-6 py-2 text-sm font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            'bg-[#E8DEF8] text-[#1D192B] shadow-[0_8px_24px_rgba(79,55,139,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(79,55,139,0.22)] focus-visible:outline-[#4f378b] dark:bg-[#4f378b] dark:text-[#EADDFF] dark:shadow-[0_8px_24px_rgba(30,30,84,0.32)] dark:hover:shadow-[0_12px_32px_rgba(30,30,84,0.42)]'
          )}
          disabled={disabled}
        >
          Start Transcription
        </button>
      </div>
    </div>
  );
}
