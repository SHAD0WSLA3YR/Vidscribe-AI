import type { TranscriptDraft } from '@/types';

const STORAGE_KEY = 'lecture-transcript-draft';

export function saveDraft(draft: TranscriptDraft) {
  if (typeof window === 'undefined') return;
  const {
    videoUrl,
    videoName,
    duration,
    segments,
    chapters,
    comments,
    summary,
    documentTitle,
    updatedAt,
  } = draft;
  const payload = {
    videoUrl,
    videoName,
    duration,
    segments,
    chapters,
    comments,
    summary,
    documentTitle,
    updatedAt,
  } satisfies TranscriptDraft;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadDraft(): TranscriptDraft | null {
  if (typeof window === 'undefined') return null;
  const data = window.localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as TranscriptDraft;
  } catch (error) {
    console.warn('Failed to parse saved draft', error);
    return null;
  }
}

export function clearDraft() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
