'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createEditor, Editor, Range, Node as SlateNode, type Descendant } from 'slate';
import { Slate, Editable, ReactEditor, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import { Bold, Italic, MessageCircle, Underline, CheckCircle2, Pencil, X, Check, Trash, Highlighter } from 'lucide-react';
import { nanoid } from 'nanoid';

// Color palette for comment highlights
const COMMENT_COLORS = [
  { bg: 'bg-yellow-100 dark:bg-yellow-300/30', border: 'border-yellow-200 dark:border-yellow-400/40', text: 'text-yellow-700 dark:text-yellow-300', value: 'yellow' },
  { bg: 'bg-green-100 dark:bg-green-300/30', border: 'border-green-200 dark:border-green-400/40', text: 'text-green-700 dark:text-green-300', value: 'green' },
  { bg: 'bg-blue-100 dark:bg-blue-300/30', border: 'border-blue-200 dark:border-blue-400/40', text: 'text-blue-700 dark:text-blue-300', value: 'blue' },
  { bg: 'bg-purple-100 dark:bg-purple-300/30', border: 'border-purple-200 dark:border-purple-400/40', text: 'text-purple-700 dark:text-purple-300', value: 'purple' },
  { bg: 'bg-pink-100 dark:bg-pink-300/30', border: 'border-pink-200 dark:border-pink-400/40', text: 'text-pink-700 dark:text-pink-300', value: 'pink' },
  { bg: 'bg-orange-100 dark:bg-orange-300/30', border: 'border-orange-200 dark:border-orange-400/40', text: 'text-orange-700 dark:text-orange-300', value: 'orange' },
];

let colorIndex = 0;
function getNextColor(): string {
  const color = COMMENT_COLORS[colorIndex].value;
  colorIndex = (colorIndex + 1) % COMMENT_COLORS.length;
  return color;
}
import type {
  TranscriptSegment,
  TranscriptComment,
  SerializedRange,
} from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { addCommentMark, toggleMark, serializeRange } from '@/lib/slate';

interface SelectionPayload {
  segmentId: string;
  range: SerializedRange;
  text: string;
}

function getColorClasses(color?: string) {
  const colorDef = COMMENT_COLORS.find(c => c.value === color) || COMMENT_COLORS[0];
  return colorDef;
}

interface TranscriptEditorProps {
  segments: TranscriptSegment[];
  activeSegmentId: string | null;
  onSegmentValueChange: (segmentId: string, value: Descendant[]) => void;
  onSelectionChange: (selection: SelectionPayload | null) => void;
  comments: TranscriptComment[];
  onCreateComment: (
    segmentId: string,
    range: SerializedRange,
    note: string,
    commentId: string,
    color: string
  ) => void;
  onToggleResolved: (commentId: string) => void;
  onUpdateComment: (commentId: string, note: string) => void;
  onDeleteComment: (commentId: string) => void;
}

interface SegmentEditorProps {
  segment: TranscriptSegment;
  isActive: boolean;
  onChange: (value: Descendant[]) => void;
  onSelectionChange: (payload: SelectionPayload | null) => void;
  comments: TranscriptComment[];
  onCreateComment: (
    range: SerializedRange,
    note: string,
    commentId: string,
    color: string
  ) => void;
  onToggleResolved: (commentId: string) => void;
  onUpdateComment: (commentId: string, note: string) => void;
  onDeleteComment: (commentId: string) => void;
}

function SegmentEditor({
  segment,
  isActive,
  onChange,
  onSelectionChange,
  comments,
  onCreateComment,
  onToggleResolved,
  onUpdateComment,
  onDeleteComment,
}: SegmentEditorProps) {
  const editor = useMemo(
    () => withHistory(withReact(createEditor() as ReactEditor)),
    []
  );
  const [selection, setSelection] = useState<Range | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const isSyncingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const removeCommentMarks = useCallback((commentId: string) => {
    // Remove all comment marks with this ID from the editor
    const nodes = Array.from(Editor.nodes(editor, {
      at: [],
      match: (n) => {
        if (!Editor.isEditor(n) && typeof n === 'object' && n !== null) {
          const node = n as any;
          return node.commentId === commentId;
        }
        return false;
      },
    }));

    for (const [node, path] of nodes) {
      Editor.removeMark(editor, 'commentId', { at: path });
    }
    onChange(editor.children as unknown as Descendant[]);
  }, [editor, onChange]);

  useEffect(() => {
    if (editingCommentId && textareaRef.current) {
      // Small delay to ensure the textarea is rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [editingCommentId]);

  useEffect(() => {
    if (
      editor.children === (segment.content as unknown as typeof editor.children)
    )
      return;
    isSyncingRef.current = true;
    editor.children = segment.content as unknown as typeof editor.children;
    editor.onChange();
    isSyncingRef.current = false;
  }, [editor, segment.content]);

  const renderLeaf = useCallback((props: any) => {
    const { attributes, children, leaf } = props;
    
    // Find the comment to get its color and check if it's active
    let highlightClass = '';
    const shouldShowHighlight = leaf.comment && leaf.comment === activeCommentId;
    if (shouldShowHighlight) {
      const comment = comments.find(c => c.id === leaf.comment);
      const colorClasses = getColorClasses(comment?.color);
      highlightClass = colorClasses.bg;
    }
    
    return (
      <span
        {...attributes}
        className={cn(
          leaf.bold && 'font-semibold',
          leaf.italic && 'italic',
          leaf.underline && 'underline',
          shouldShowHighlight && 'rounded px-0.5',
          shouldShowHighlight && highlightClass
        )}
        data-comment-id={leaf.comment ?? undefined}
      >
        {children}
      </span>
    );
  }, [comments, activeCommentId]);

  const handleSelectionChange = useCallback(() => {
    const currentSelection = editor.selection;
    setSelection(currentSelection);
    if (!currentSelection || Range.isCollapsed(currentSelection)) {
      onSelectionChange(null);
      return;
    }
    const text = Editor.string(editor, currentSelection).trim();
    if (!text) {
      onSelectionChange(null);
      return;
    }
    onSelectionChange({
      segmentId: segment.id,
      range: serializeRange(currentSelection),
      text,
    });
  }, [editor, onSelectionChange, segment.id]);

  const applyFormat = useCallback(
    (format: 'bold' | 'italic' | 'underline') => {
      if (!selection || Range.isCollapsed(selection)) return;
      ReactEditor.focus(editor);
      editor.selection = selection;
      toggleMark(editor, format);
      onChange(editor.children as unknown as Descendant[]);
    },
    [editor, onChange, selection]
  );

  const handleAddComment = useCallback(() => {
    if (!selection || Range.isCollapsed(selection)) return;
    const commentId = nanoid();
    const color = getNextColor();
    editor.selection = selection;
    addCommentMark(editor, commentId);
    // Create comment with empty note in editing state
    onCreateComment(serializeRange(selection), '', commentId, color);
    onChange(editor.children as unknown as Descendant[]);
    // Set editing state to the new comment
    setEditingCommentId(commentId);
    setEditingNote('');
    setActiveCommentId(commentId);
    // Blur the editor so typing goes to the textarea
    ReactEditor.blur(editor);
  }, [editor, onCreateComment, onChange, selection]);

  const handleRemoveHighlight = useCallback(() => {
    if (!selection || Range.isCollapsed(selection)) return;
    
    // Get all nodes in selection that have comment marks
    const nodes = Array.from(Editor.nodes(editor, {
      at: selection,
      match: (n) => {
        if (!Editor.isEditor(n) && typeof n === 'object' && n !== null) {
          const node = n as any;
          return !!node.commentId;
        }
        return false;
      },
    }));

    // Remove commentId mark from selected nodes
    for (const [, path] of nodes) {
      Editor.removeMark(editor, 'commentId', { at: path });
    }
    
    onChange(editor.children as unknown as Descendant[]);
    ReactEditor.focus(editor);
  }, [editor, onChange, selection]);

  return (
    <Slate
      key={segment.id}
      editor={editor}
      initialValue={segment.content as Descendant[]}
      onChange={(value) => {
        if (!isSyncingRef.current) {
          onChange(value as Descendant[]);
        }
        handleSelectionChange();
      }}
    >
      <div
        className={cn(
          'rounded-xl border border-transparent bg-white p-5 shadow transition hover:border-primary/40',
          'dark:bg-slate-900 dark:text-slate-100 dark:hover:border-primary/50',
          isActive && 'border-primary/60 shadow-lg dark:border-primary/60'
        )}
        data-segment-id={segment.id}
      >
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {formatTime(segment.start)} → {formatTime(segment.end)}
          </span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <ToolbarButton
                label="Bold"
                onClick={() => applyFormat('bold')}
                disabled={!selection || Range.isCollapsed(selection)}
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Italic"
                onClick={() => applyFormat('italic')}
                disabled={!selection || Range.isCollapsed(selection)}
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Underline"
                onClick={() => applyFormat('underline')}
                disabled={!selection || Range.isCollapsed(selection)}
              >
                <Underline className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Comment"
                onClick={handleAddComment}
                disabled={!selection || Range.isCollapsed(selection)}
              >
                <MessageCircle className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Remove Highlight"
                onClick={handleRemoveHighlight}
                disabled={!selection || Range.isCollapsed(selection)}
              >
                <Highlighter className="h-4 w-4" />
              </ToolbarButton>
            </div>
            {comments.length > 0 && (
              <span className="text-slate-400 dark:text-slate-500">
                {comments.length} note{comments.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <Editable
          renderLeaf={renderLeaf}
          onSelect={handleSelectionChange}
          className="min-h-[80px] whitespace-pre-wrap text-sm leading-relaxed text-slate-800 focus:outline-none dark:text-slate-100"
          placeholder="Refine the transcript..."
          spellCheck
          autoCorrect="on"
        />
        
        {/* Inline comments below segment */}
        {comments.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            {comments.map((comment) => {
              const colorClasses = getColorClasses(comment.color);
              const isEditing = editingCommentId === comment.id;
              
              return (
                <div
                  key={comment.id}
                  onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}
                  className={cn(
                    'rounded-lg border p-3 text-sm transition cursor-pointer',
                    comment.resolved
                      ? 'border-green-200 bg-green-50 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                      : `${colorClasses.border} ${colorClasses.bg}`,
                    activeCommentId === comment.id && 'ring-2 ring-primary/50'
                  )}
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <MessageCircle className="h-3 w-3" />
                      <span className="font-medium">Note</span>
                      <span>·</span>
                      <span>{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isEditing && !comment.resolved && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
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
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCommentMarks(comment.id);
                              onDeleteComment(comment.id);
                            }}
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
                    <div className="mb-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        ref={textareaRef}
                        value={editingNote}
                        onChange={(e) => setEditingNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editingNote.trim()) {
                              onUpdateComment(comment.id, editingNote.trim());
                            }
                            setEditingCommentId(null);
                          }
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        rows={3}
                        autoFocus
                        placeholder="Type your note... (Shift+Enter for new line, Enter to save)"
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
                    <p className="mb-2 text-slate-700 dark:text-slate-200">
                      {comment.note}
                    </p>
                  )}
                  
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleResolved(comment.id);
                      }}
                      className={cn(
                        'cursor-target inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                        comment.resolved
                          ? 'border-green-300 bg-green-100 text-green-700 hover:bg-green-200 dark:border-emerald-400/70 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'border-slate-300 text-slate-600 hover:border-primary hover:text-primary dark:border-slate-600 dark:text-slate-300'
                      )}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {comment.resolved ? 'Resolved' : 'Mark resolved'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Slate>
  );
}

interface ToolbarButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  label,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-target flex items-center justify-center rounded-full border border-slate-200 p-1.5 text-slate-600 transition hover:border-primary hover:text-primary',
        'dark:border-slate-700 dark:text-slate-200 dark:hover:border-primary dark:hover:text-primary',
        disabled &&
          'cursor-not-allowed opacity-40 hover:border-slate-200 hover:text-slate-600 dark:hover:border-slate-700 dark:hover:text-slate-200'
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) onClick();
      }}
      aria-label={label}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function TranscriptEditor({
  segments,
  activeSegmentId,
  onSegmentValueChange,
  onSelectionChange,
  comments,
  onCreateComment,
  onToggleResolved,
  onUpdateComment,
  onDeleteComment,
}: TranscriptEditorProps) {
  const segmentComments = useMemo(() => {
    return segments.reduce<Record<string, TranscriptComment[]>>(
      (acc, segment) => {
        acc[segment.id] = comments.filter(
          (comment) => comment.segmentId === segment.id
        );
        return acc;
      },
      {}
    );
  }, [comments, segments]);

  const handleSelectionChange = useCallback(
    (selection: SelectionPayload | null) => {
      onSelectionChange(selection);
    },
    [onSelectionChange]
  );

  return (
    <div className="flex flex-col gap-4">
      {segments.map((segment) => (
        <SegmentEditor
          key={segment.id}
          segment={segment}
          isActive={segment.id === activeSegmentId}
          onChange={(value) => onSegmentValueChange(segment.id, value)}
          onSelectionChange={handleSelectionChange}
          comments={segmentComments[segment.id] ?? []}
          onCreateComment={(range, note, commentId, color) =>
            onCreateComment(segment.id, range, note, commentId, color)
          }
          onToggleResolved={onToggleResolved}
          onUpdateComment={onUpdateComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </div>
  );
}
