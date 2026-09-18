'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Pencil,
  Play,
  Plus,
  Trash,
} from 'lucide-react';
import type { Chapter } from '@/types';
import { cn, formatTime } from '@/lib/utils';

interface ChapterListProps {
  chapters: Chapter[];
  currentTime: number;
  selectedChapterId?: string | null;
  onSelectChapter: (chapter: Chapter) => void;
  onRenameChapter: (id: string, title: string) => void;
  onReorderChapter: (id: string, direction: 'up' | 'down') => void;
  onDeleteChapter: (id: string) => void;
  onCreateChapter: () => void;
}

export function ChapterList({
  chapters,
  currentTime,
  selectedChapterId,
  onSelectChapter,
  onRenameChapter,
  onReorderChapter,
  onDeleteChapter,
  onCreateChapter,
}: ChapterListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>('');

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.start - b.start),
    [chapters]
  );

  const activeChapterId = useMemo(() => {
    return sortedChapters.find((chapter, index) => {
      const nextChapter = sortedChapters[index + 1];
      const end = nextChapter ? nextChapter.start : Infinity;
      return currentTime >= chapter.start && currentTime < end;
    })?.id;
  }, [currentTime, sortedChapters]);

  const handleEditStart = useCallback((chapter: Chapter) => {
    setEditingId(chapter.id);
    setInputValue(chapter.title);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, chapterId: string) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onRenameChapter(chapterId, inputValue.trim() || 'Untitled chapter');
        setEditingId(null);
      } else if (e.key === 'Escape') {
        setEditingId(null);
      }
    },
    [inputValue, onRenameChapter]
  );

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onCreateChapter}
        className="cursor-target inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-600"
      >
        <Plus className="h-3.5 w-3.5" /> Add chapter
      </button>
      <div className="space-y-2">
        {sortedChapters.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
            AI chapters will appear here. You can also add them manually.
          </div>
        )}
        {sortedChapters.map((chapter, index) => {
          const isActive = chapter.id === activeChapterId;
          const isEditing = editingId === chapter.id;
          const isSelected = selectedChapterId === chapter.id;
          return (
            <div
              key={chapter.id}
              className={cn(
                'flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-primary/50 dark:border-slate-600 dark:bg-slate-800/80',
                isActive &&
                  'border-primary bg-blue-50/70 dark:border-blue-400/40 dark:bg-blue-500/20'
              )}
            >
              {/* Compact view - always visible */}
              <button
                type="button"
                onClick={() => onSelectChapter(chapter)}
                className="cursor-target flex min-w-0 flex-1 items-center gap-2"
              >
                <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {formatTime(chapter.start)}
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, chapter.id)}
                    onBlur={() => setEditingId(null)}
                    autoFocus
                    className="min-w-0 flex-1 rounded bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none ring-1 ring-primary dark:bg-slate-700 dark:text-slate-100"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700 dark:text-slate-100">
                    {chapter.title}
                  </span>
                )}
              </button>

              {/* Play button - always visible */}
              <button
                type="button"
                onClick={() => onSelectChapter(chapter)}
                className="cursor-target shrink-0 rounded-full p-1 text-primary transition hover:bg-primary/10"
                aria-label="Play chapter"
              >
                <Play className="h-3 w-3 fill-current" />
              </button>

              {/* Expanded controls - only show when selected */}
              {isSelected && !isEditing && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onReorderChapter(chapter.id, 'up')}
                    disabled={index === 0}
                    className="cursor-target rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    aria-label="Move chapter up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorderChapter(chapter.id, 'down')}
                    disabled={index === sortedChapters.length - 1}
                    className="cursor-target rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    aria-label="Move chapter down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditStart(chapter)}
                    className="cursor-target rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    aria-label="Edit chapter"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteChapter(chapter.id)}
                    className="cursor-target rounded-full p-1 text-red-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                    aria-label="Delete chapter"
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
