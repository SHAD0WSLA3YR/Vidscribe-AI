import { Editor, Range, type Descendant } from 'slate';
import type { SerializedRange } from '@/types';

export function toggleMark(
  editor: Editor,
  format: 'bold' | 'italic' | 'underline'
) {
  const isActive = isMarkActive(editor, format);
  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
}

export function isMarkActive(
  editor: Editor,
  format: 'bold' | 'italic' | 'underline'
) {
  const marks = Editor.marks(editor);
  return marks ? (marks as Record<string, unknown>)[format] === true : false;
}

export function addCommentMark(editor: Editor, commentId: string) {
  if (!editor.selection || Range.isCollapsed(editor.selection)) return;
  Editor.addMark(editor, 'comment', commentId);
}

export function createInitialValue(text: string): Descendant[] {
  return [
    {
      type: 'paragraph',
      children: [{ text }],
    },
  ];
}

export function deserializeTranscription(text: string): Descendant[] {
  const lines = text.split(/\n+/).filter(Boolean);
  if (lines.length === 0) return createInitialValue('');
  return lines.map((line) => ({
    type: 'paragraph',
    children: [{ text: line.trim() }],
  }));
}

export function serializeRange(range: Range): SerializedRange {
  return {
    anchor: {
      path: range.anchor.path,
      offset: range.anchor.offset,
    },
    focus: {
      path: range.focus.path,
      offset: range.focus.offset,
    },
  };
}

export function deserializeRange(serialized: SerializedRange): Range {
  return {
    anchor: {
      path: serialized.anchor.path,
      offset: serialized.anchor.offset,
    },
    focus: {
      path: serialized.focus.path,
      offset: serialized.focus.offset,
    },
  };
}
