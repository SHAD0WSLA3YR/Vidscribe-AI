import type { Descendant } from 'slate';

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  words?: TranscriptWord[];
  content: Descendant[];
}

export interface Chapter {
  id: string;
  title: string;
  start: number;
  end?: number;
}

export interface TranscriptComment {
  id: string;
  segmentId: string;
  range: SerializedRange;
  note: string;
  createdAt: string;
  resolved: boolean;
  color?: string;
}

export interface SerializedPoint {
  path: number[];
  offset: number;
}

export interface SerializedRange {
  anchor: SerializedPoint;
  focus: SerializedPoint;
}

export interface TranscriptDraft {
  videoName: string;
  videoUrl: string;
  duration: number;
  segments: TranscriptSegment[];
  chapters: Chapter[];
  comments: TranscriptComment[];
  summary?: string | null;
  documentTitle?: string;
  updatedAt: string;
}

export interface ExplainRequestBody {
  text: string;
  context?: string;
}

export interface ExplainResponse {
  explanation: string;
}
