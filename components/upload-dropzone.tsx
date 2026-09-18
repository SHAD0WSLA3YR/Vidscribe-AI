'use client';

import { useCallback, useRef, useState } from 'react';
import { Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
];

export function UploadDropzone({
  onFileSelected,
  disabled,
}: UploadDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert(
          'Unsupported file type. Please upload MP4, WebM, MOV, or MKV videos.'
        );
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      setIsDragActive(true);
    },
    [disabled]
  );

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }, []);

  const onClick = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      className={cn(
        'cursor-target flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center transition',
        disabled && 'cursor-not-allowed opacity-60',
        isDragActive && 'border-primary bg-blue-50',
        'hover:border-primary hover:bg-blue-50'
      )}
    >
      <Cloud className="h-12 w-12 text-primary" />
      <div>
        <p className="text-lg font-semibold text-slate-900">
          Drag & drop lecture video
        </p>
        <p className="text-sm text-slate-500">
          MP4, WebM, MOV, MKV up to 2 hours
        </p>
      </div>
      <button
        type="button"
        className="cursor-target rounded-full bg-primary px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600"
        disabled={disabled}
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
        disabled={disabled}
      />
    </div>
  );
}
