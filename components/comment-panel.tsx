'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare, Trash, Pencil, X, Check } from 'lucide-react';
import type { TranscriptComment, TranscriptSegment } from '@/types';
import { cn, formatTime } from '@/lib/utils';

// Color palette matching transcript-editor
const COMMENT_COLORS = [
  { bg: 'bg-yellow-100 dark:bg-yellow-300/30', border: 'border-yellow-200 dark:border-yellow-400/40', value: 'yellow' },
  { bg: 'bg-green-100 dark:bg-green-300/30', border: 'border-green-200 dark:border-green-400/40', value: 'green' },
  { bg: 'bg-blue-100 dark:bg-blue-300/30', border: 'border-blue-200 dark:border-blue-400/40', value: 'blue' },
  { bg: 'bg-purple-100 dark:bg-purple-300/30', border: 'border-purple-200 dark:border-purple-400/40', value: 'purple' },
  { bg: 'bg-pink-100 dark:bg-pink-300/30', border: 'border-pink-200 dark:border-pink-400/40', value: 'pink' },
  { bg: 'bg-orange-100 dark:bg-orange-300/30', border: 'border-orange-200 dark:border-orange-400/40', value: 'orange' },
];

function getColorClasses(color?: string) {
  const colorDef = COMMENT_COLORS.find(c => c.value === color) || COMMENT_COLORS[0];
  return colorDef;
}

interface CommentPanelProps {
  segments: TranscriptSegment[];
  comments: TranscriptComment[];
  onJumpToSegment: (segmentId: string) => void;
  onToggleResolved: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onUpdateComment: (commentId: string, note: string) => void;
}

export function CommentPanel({
  segments,
  comments,
  onJumpToSegment,
  onToggleResolved,
  onDeleteComment,
  onUpdateComment,
}: CommentPanelProps) {
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState('');

  const indexedSegments = useMemo(() => {
    const map = new Map<string, TranscriptSegment>();
    segments.forEach((segment) => map.set(segment.id, segment));
    return map;
  }, [segments]);

  const sortedComments = useMemo(
    () =>
      [...comments].sort((a, b) => {
        const segmentA = indexedSegments.get(a.segmentId);
        const segmentB = indexedSegments.get(b.segmentId);
        return (segmentA?.start ?? 0) - (segmentB?.start ?? 0);
      }),
    [comments, indexedSegments]
  );

  if (comments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
        No inline comments yet. Highlight transcript text and add notes to track
        follow-ups.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedComments.map((comment) => {
        const segment = indexedSegments.get(comment.segmentId);
        const colorClasses = getColorClasses(comment.color);
        const isEditing = editingCommentId === comment.id;
        
        return (
          <div
            key={comment.id}
            className={cn(
              'flex flex-col gap-2 rounded-xl border p-4 shadow-sm transition hover:border-primary/60',
              comment.resolved
                ? 'border-green-200 bg-green-50 dark:border-emerald-500/60 dark:bg-emerald-500/20'
                : `${colorClasses.border} ${colorClasses.bg}`
            )}
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => onJumpToSegment(comment.segmentId)}
                className="cursor-target inline-flex items-center gap-2 font-semibold text-slate-700 transition hover:text-primary dark:text-slate-200"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {segment ? formatTime(segment.start) : 'Segment'}
              </button>
              <div className="flex items-center gap-2">
                <span>{new Date(comment.createdAt).toLocaleTimeString()}</span>
                {!isEditing && !comment.resolved && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(comment.id);
                        setEditingNote(comment.note);
                      }}
                      className="cursor-target rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                      aria-label="Edit note"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteComment(comment.id)}
                      className="cursor-target rounded-full p-1 text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                      aria-label="Delete comment"
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editingNote}
                  onChange={(e) => setEditingNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (editingNote.trim()) {
                        onUpdateComment(comment.id, editingNote.trim());
                      }
                      setEditingCommentId(null);
                    }}
                    className="cursor-target inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-600"
                  >
                    <Check className="h-3 w-3" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(null);
                      setEditingNote('');
                    }}
                    className="cursor-target inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {comment.note}
              </p>
            )}
            
            {!isEditing && (
              <button
                type="button"
                onClick={() => onToggleResolved(comment.id)}
                className={cn(
                  'cursor-target inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-semibold transition',
                  comment.resolved
                    ? 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:border-emerald-400/70 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-slate-200 text-slate-500 hover:border-primary hover:text-primary dark:border-slate-600 dark:text-slate-300'
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {comment.resolved ? 'Resolved' : 'Mark resolved'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
