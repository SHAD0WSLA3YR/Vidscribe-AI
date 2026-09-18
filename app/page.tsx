'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { UploadDropzone } from '@/components/upload-dropzone';
import { VideoPlayer, type VideoPlayerHandle } from '@/components/video-player';
import { TranscriptEditor } from '@/components/transcript-editor';
import { ChapterList } from '@/components/chapter-list';
import { CommentPanel } from '@/components/comment-panel';
import { SplitExportButton } from '@/components/split-export-button';
import { StatusBanner } from '@/components/status-banner';
import type { ProgressStage } from '@/components/status-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import { VideoPreview } from '@/components/video-preview';
import { LazyTargetCursor } from '@/components/lazy-target-cursor';
import { MarkdownText } from '@/components/markdown-text';
import { KeyboardShortcutsHelp } from '@/components/keyboard-shortcuts-help';
import { OfflineIndicator } from '@/components/offline-indicator';
import { LanguageSelector } from '@/components/language-selector';
import { loadDraft, saveDraft, clearDraft } from '@/lib/storage';
import { deserializeTranscription } from '@/lib/slate';
import { serializeNodesToPlainText } from '@/lib/exporters';
import { DEFAULT_TITLE } from '@/lib/title';
import { cn, formatTime } from '@/lib/utils';
import { resilientFetch } from '@/lib/network';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import type {
  Chapter,
  TranscribeStartResponse,
  TranscribeStatusResponse,
  TranscriptionSegmentPayload,
  TranscriptComment,
  TranscriptDraft,
  TranscriptSegment,
  SerializedRange,
} from '@/types';

interface SelectionState {
  segmentId: string;
  range: SerializedRange;
  text: string;
}

const TRANSCRIBE_POLL_INTERVAL_MS = 4000;
const TRANSCRIBE_POLL_MAX_ERRORS = 3;

/**
 * Poll GET /api/transcribe/status until the AssemblyAI job completes.
 * Resolves with the completed payload (same shape the old synchronous
 * POST /api/transcribe returned). Rejects on job error, unrecoverable
 * HTTP errors, repeated network failures, or abort (unmount / restart).
 */
async function pollTranscriptionStatus(
  jobId: string,
  signal: AbortSignal
): Promise<Extract<TranscribeStatusResponse, { status: 'completed' }>> {
  let consecutiveErrors = 0;

  for (;;) {
    if (signal.aborted) {
      throw new Error('Transcription was cancelled');
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, TRANSCRIBE_POLL_INTERVAL_MS);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Transcription was cancelled'));
        },
        { once: true }
      );
    });

    if (signal.aborted) {
      throw new Error('Transcription was cancelled');
    }

    let response: Response;
    try {
      response = await resilientFetch(
        `/api/transcribe/status?jobId=${encodeURIComponent(jobId)}`,
        { retries: 0 }
      );
    } catch (error) {
      consecutiveErrors += 1;
      if (consecutiveErrors > TRANSCRIBE_POLL_MAX_ERRORS) {
        throw error instanceof Error
          ? error
          : new Error('Lost connection while checking transcription status');
      }
      continue;
    }

    if (!response.ok) {
      // 4xx means the job will never resolve — fail fast without retrying.
      if (response.status === 400 || response.status === 404) {
        const body = (await response
          .json()
          .catch(() => null)) as { error?: string } | null;
        throw new Error(
          body?.error ??
            `Transcription status check failed (${response.status})`
        );
      }
      consecutiveErrors += 1;
      if (consecutiveErrors > TRANSCRIBE_POLL_MAX_ERRORS) {
        throw new Error(
          `Transcription status check failed (${response.status})`
        );
      }
      continue;
    }

    consecutiveErrors = 0;
    const data = (await response.json()) as TranscribeStatusResponse;
    if (data.status === 'completed') {
      return data;
    }
    if (data.status === 'error') {
      throw new Error(data.error || 'Transcription failed');
    }
    // status === 'processing' → keep polling
  }
}

export default function HomePage() {
  const videoHandleRef = useRef<VideoPlayerHandle | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [comments, setComments] = useState<TranscriptComment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autosaveTimestamp, setAutosaveTimestamp] = useState<string | null>(
    null
  );
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [progressStage, setProgressStage] = useState<ProgressStage>('idle');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  // Tracks the in-flight transcription poll so a new transcription or an
  // unmount cancels it instead of leaving a stray polling loop running.
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [isTranscriptOutOfSync, setIsTranscriptOutOfSync] = useState(false);
  const [documentTitle, setDocumentTitle] = useState<string>(DEFAULT_TITLE);
  const [summary, setSummary] = useState<string | null>(null);
  const [isChaptersExpanded, setIsChaptersExpanded] = useState(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isCommentsExpanded, setIsCommentsExpanded] = useState(true);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null
  );
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [originalSegments, setOriginalSegments] = useState<TranscriptSegment[]>([]);
  const [originalTitle, setOriginalTitle] = useState<string>('');
  const [originalSummary, setOriginalSummary] = useState<string | null>(null);
  const [originalChapters, setOriginalChapters] = useState<Chapter[]>([]);

  // Keyboard shortcuts
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const transcriptSectionRef = useRef<HTMLDivElement | null>(null);
  
  useKeyboardShortcuts({
    onPlayPause: () => {
      const video = document.querySelector('video');
      if (video) {
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
      }
    },
    onSeekForward: () => {
      if (videoHandleRef.current && currentTime < duration) {
        const newTime = Math.min(currentTime + 5, duration);
        videoHandleRef.current.seek(newTime);
        setCurrentTime(newTime);
      }
    },
    onSeekBackward: () => {
      if (videoHandleRef.current) {
        const newTime = Math.max(currentTime - 5, 0);
        videoHandleRef.current.seek(newTime);
        setCurrentTime(newTime);
      }
    },
    onToggleFullscreen: () => {
      const video = document.querySelector('video');
      if (video) {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          video.requestFullscreen();
        }
      }
    },
    onExport: () => {
      exportButtonRef.current?.click();
    },
    onJumpToTranscript: () => {
      transcriptSectionRef.current?.focus();
    },
    onShowHelp: () => {
      setShowKeyboardHelp(true);
    },
  });

  useEffect(() => {
    const draft = loadDraft();
    if (!draft) return;
    setSegments(draft.segments);
    setChapters(draft.chapters);
    setComments(draft.comments);
    setVideoUrl(draft.videoUrl ?? null);
    setVideoName(draft.videoName ?? '');
    setDuration(draft.duration ?? 0);
    setDocumentTitle(draft.documentTitle ?? DEFAULT_TITLE);
    setSummary(draft.summary ?? null);
    setAutosaveTimestamp(draft.updatedAt);
    setStatusMessage('Draft restored from your last session');
  }, []);

  useEffect(() => {
    if (segments.length === 0 && chapters.length === 0) return;
    const updatedAt = new Date().toISOString();
    const draft: TranscriptDraft = {
      videoName,
      videoUrl: videoUrl ?? '',
      duration,
      segments,
      chapters,
      comments,
      documentTitle,
      summary,
      updatedAt,
    };
    saveDraft(draft);
    setAutosaveTimestamp(updatedAt);
  }, [
    chapters,
    comments,
    documentTitle,
    duration,
    segments,
    summary,
    videoName,
    videoUrl,
  ]);

  useEffect(() => {
    if (!errorMessage) return;
    const timeout = window.setTimeout(() => {
      setErrorMessage(null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  useEffect(() => {
    if (segments.length === 0) {
      setActiveSegmentId(null);
      return;
    }
    const active = segments.find(
      (segment: TranscriptSegment) =>
        currentTime >= segment.start && currentTime <= segment.end + 0.2
    );
    setActiveSegmentId(active?.id ?? null);
  }, [currentTime, segments]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const handleSegmentValueChange = useCallback(
    (segmentId: string, value: TranscriptSegment['content']) => {
      setSegments((prev: TranscriptSegment[]) =>
        prev.map((segment: TranscriptSegment) =>
          segment.id === segmentId ? { ...segment, content: value } : segment
        )
      );
    },
    []
  );

  const handleSelectionChange = useCallback(
    (nextSelection: SelectionState | null) => {
      setSelection(nextSelection);
    },
    []
  );

  const handleTitleChange = useCallback((value: string) => {
    setDocumentTitle(value);
  }, []);

  const handleTitleBlur = useCallback(() => {
    setDocumentTitle((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return DEFAULT_TITLE;
      }
      return trimmed;
    });
  }, []);

  const handleCreateComment = useCallback(
    (
      segmentId: string,
      range: SerializedRange,
      note: string,
      commentId: string,
      color: string
    ) => {
      setComments((prev: TranscriptComment[]) => [
        ...prev,
        {
          id: commentId,
          segmentId,
          range,
          note,
          createdAt: new Date().toISOString(),
          resolved: false,
          color,
        },
      ]);
    },
    []
  );

  const handleToggleCommentResolved = useCallback((commentId: string) => {
    setComments((prev: TranscriptComment[]) =>
      prev.map((comment: TranscriptComment) =>
        comment.id === commentId
          ? { ...comment, resolved: !comment.resolved }
          : comment
      )
    );
  }, []);

  const handleUpdateComment = useCallback((commentId: string, note: string) => {
    setComments((prev: TranscriptComment[]) =>
      prev.map((comment: TranscriptComment) =>
        comment.id === commentId
          ? { ...comment, note }
          : comment
      )
    );
  }, []);

  const handleDeleteComment = useCallback((commentId: string) => {
    setComments((prev: TranscriptComment[]) =>
      prev.filter((comment: TranscriptComment) => comment.id !== commentId)
    );
  }, []);

  const handleJumpToSegment = useCallback(
    (segmentId: string) => {
      const segment = segments.find(
        (item: TranscriptSegment) => item.id === segmentId
      );
      if (!segment) return;
      videoHandleRef.current?.seek(segment.start);
      setCurrentTime(segment.start);
    },
    [segments]
  );

  const updateOutOfSyncState = useCallback(() => {
    const container = transcriptContainerRef.current;
    if (!container || !activeSegmentId) {
      setIsTranscriptOutOfSync(false);
      return;
    }
    const target = container.querySelector<HTMLElement>(
      `[data-segment-id="${activeSegmentId}"]`
    );
    if (!target) {
      setIsTranscriptOutOfSync(false);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const padding = 12;
    const isVisible =
      targetRect.top >= containerRect.top + padding &&
      targetRect.bottom <= containerRect.bottom - padding;
    setIsTranscriptOutOfSync(!isVisible);
  }, [activeSegmentId]);

  const scrollToActiveSegment = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (!activeSegmentId) return;
      const container = transcriptContainerRef.current;
      if (!container) return;
      const target = container.querySelector<HTMLElement>(
        `[data-segment-id="${activeSegmentId}"]`
      );
      if (!target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset =
        targetRect.top - containerRect.top + container.scrollTop - 12;
      isProgrammaticScrollRef.current = true;
      container.scrollTo({ top: offset, behavior });
      window.setTimeout(
        () => {
          isProgrammaticScrollRef.current = false;
          updateOutOfSyncState();
        },
        behavior === 'auto' ? 0 : 300
      );
    },
    [activeSegmentId, updateOutOfSyncState]
  );

  const handleTranscriptScroll = useCallback(() => {
    const container = transcriptContainerRef.current;
    if (!container || isProgrammaticScrollRef.current) return;
    setIsUserScrolling(true);
    if (!activeSegmentId) {
      setIsTranscriptOutOfSync(false);
      return;
    }
    const target = container.querySelector<HTMLElement>(
      `[data-segment-id="${activeSegmentId}"]`
    );
    if (!target) {
      setIsTranscriptOutOfSync(false);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const padding = 12;
    const isVisible =
      targetRect.top >= containerRect.top + padding &&
      targetRect.bottom <= containerRect.bottom - padding;
    setIsTranscriptOutOfSync(!isVisible);
  }, [activeSegmentId]);

  const generateSummary = useCallback(
    async (sourceSegments: TranscriptSegment[], videoDuration: number) => {
      if (sourceSegments.length === 0) return;
      setIsGeneratingSummary(true);
      setStatusMessage('Generating summary...');

      try {
        const payload = {
          transcript: sourceSegments
            .map((segment) => ({
              start: segment.start,
              text: serializeNodesToPlainText(segment.content).trim(),
            }))
            .filter((entry) => entry.text.length > 0),
          duration: videoDuration,
        };

        const response = await resilientFetch('/api/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          retries: 2,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Summary generation failed');
        }

        const data = (await response.json()) as { summary: string };
        setSummary(data.summary ?? null);
        setOriginalSummary(data.summary ?? null); // Store original for translation
        setStatusMessage('Summary generated');
      } catch (error) {
        console.error(error);
        setErrorMessage('Unable to generate summary automatically');
      } finally {
        setIsGeneratingSummary(false);
      }
    },
    []
  );

  const generateTitle = useCallback(
    async (sourceSegments: TranscriptSegment[], videoDuration: number) => {
      if (sourceSegments.length === 0) return;
      try {
        const payload = {
          transcript: sourceSegments
            .map((segment) => ({
              start: segment.start,
              text: serializeNodesToPlainText(segment.content).trim(),
            }))
            .filter((entry) => entry.text.length > 0),
          duration: videoDuration,
        };

        const response = await resilientFetch('/api/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          retries: 2,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Title generation failed');
        }

        const data = (await response.json()) as { title: string };
        if (data.title) {
          setDocumentTitle(data.title);
          setOriginalTitle(data.title); // Store original for translation
        }
      } catch (error) {
        console.error('Title generation failed:', error);
        // Silently fail - keep default title
      }
    },
    []
  );

  const generateChapters = useCallback(
    async (sourceSegments: TranscriptSegment[], videoDuration: number) => {
      if (sourceSegments.length === 0) return;
      try {
        const payload = {
          transcript: sourceSegments
            .map((segment) => ({
              start: segment.start,
              text: serializeNodesToPlainText(segment.content).trim(),
            }))
            .filter((entry) => entry.text.length > 0),
          duration: videoDuration,
          maxChapters: 8,
        };

        const response = await resilientFetch('/api/chapters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          retries: 2,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Chapter generation failed');
        }

        const data = (await response.json()) as {
          chapters: Chapter[];
        };
        setChapters(data.chapters ?? []);
        setOriginalChapters(data.chapters ?? []); // Store originals for translation
        setStatusMessage('AI chapters generated');

        // Generate title and summary separately after short delays
        setTimeout(() => {
          generateTitle(sourceSegments, videoDuration);
        }, 100);
        
        setTimeout(() => {
          generateSummary(sourceSegments, videoDuration);
        }, 350);
      } catch (error) {
        console.error(error);
        setErrorMessage('Unable to generate chapters automatically');
      }
    },
    [generateSummary, generateTitle]
  );

  const handleTranslateContent = useCallback(
    async (newTargetLanguage: string) => {
      if (!detectedLanguage || newTargetLanguage === detectedLanguage || isTranslating) {
        return;
      }

      setIsTranslating(true);
      setTranslationProgress(0);
      setTargetLanguage(newTargetLanguage);
      setStatusMessage(`Translating to ${newTargetLanguage.toUpperCase()}...`);
      setErrorMessage(null);

      try {
        let progressStep = 0;
        const totalSteps = 3 + originalSegments.length; // title + summary + chapters + segments

        // 1. Translate title
        if (originalTitle) {
          setStatusMessage('Translating title...');
          try {
            const titleResponse = await resilientFetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: originalTitle,
                sourceLanguage: detectedLanguage,
                targetLanguage: newTargetLanguage,
                context: 'title',
              }),
              retries: 2,
            });
            if (titleResponse.ok) {
              const { translatedText } = await titleResponse.json();
              setDocumentTitle(translatedText);
            }
          } catch (error) {
            console.error('Title translation failed:', error);
          }
          progressStep++;
          setTranslationProgress((progressStep / totalSteps) * 100);
        }

        // 2. Translate summary
        if (originalSummary) {
          setStatusMessage('Translating summary...');
          try {
            const summaryResponse = await resilientFetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: originalSummary,
                sourceLanguage: detectedLanguage,
                targetLanguage: newTargetLanguage,
                context: 'summary',
              }),
              retries: 2,
            });
            if (summaryResponse.ok) {
              const { translatedText } = await summaryResponse.json();
              setSummary(translatedText);
            }
          } catch (error) {
            console.error('Summary translation failed:', error);
          }
          progressStep++;
          setTranslationProgress((progressStep / totalSteps) * 100);
        }

        // 3. Translate chapters
        if (originalChapters.length > 0) {
          setStatusMessage('Translating chapters...');
          const translatedChapters = await Promise.all(
            originalChapters.map(async (chapter) => {
              try {
                const chapterResponse = await resilientFetch('/api/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    text: chapter.title,
                    sourceLanguage: detectedLanguage,
                    targetLanguage: newTargetLanguage,
                    context: 'chapter',
                  }),
                  retries: 2,
                });
                if (chapterResponse.ok) {
                  const { translatedText } = await chapterResponse.json();
                  return { ...chapter, title: translatedText };
                }
              } catch (error) {
                console.error(`Chapter translation failed for: ${chapter.title}`, error);
              }
              return chapter;
            })
          );
          setChapters(translatedChapters);
          progressStep++;
          setTranslationProgress((progressStep / totalSteps) * 100);
        }

        // 4. Translate segments one by one
        setStatusMessage(`Translating transcript segments...`);
        const translatedSegments: TranscriptSegment[] = [];
        
        for (let i = 0; i < originalSegments.length; i++) {
          const segment = originalSegments[i];
          const originalText = serializeNodesToPlainText(segment.content);
          
          try {
            const segmentResponse = await resilientFetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: originalText,
                sourceLanguage: detectedLanguage,
                targetLanguage: newTargetLanguage,
                context: 'transcript',
              }),
              retries: 2,
            });
            
            if (segmentResponse.ok) {
              const { translatedText } = await segmentResponse.json();
              console.log(`✓ Segment ${i + 1} translated:`, originalText.substring(0, 50), '->', translatedText.substring(0, 50));
              translatedSegments.push({
                ...segment,
                content: deserializeTranscription(translatedText),
              });
            } else {
              console.warn(`⚠️ Segment ${i + 1} translation failed, keeping original`);
              translatedSegments.push(segment); // Keep original on error
            }
          } catch (error) {
            console.error(`❌ Segment ${i + 1} translation error:`, error);
            translatedSegments.push(segment); // Keep original on error
          }
          
          progressStep++;
          setTranslationProgress((progressStep / totalSteps) * 100);
          setStatusMessage(`Translating segment ${i + 1}/${originalSegments.length}...`);
          
          // Update UI every 5 segments for smoother experience
          if (i % 5 === 0 || i === originalSegments.length - 1) {
            console.log(`📊 UI Update: ${translatedSegments.length} segments translated so far`);
            setSegments([...translatedSegments]);
          }
        }
        
        console.log(`✅ All segments translated. Final count: ${translatedSegments.length}`);
        setSegments(translatedSegments);
        setStatusMessage(`Translation to ${newTargetLanguage.toUpperCase()} completed`);
      } catch (error) {
        console.error('Translation failed:', error);
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to translate content'
        );
      } finally {
        setIsTranslating(false);
        setTranslationProgress(0);
      }
    },
    [detectedLanguage, originalSegments, originalTitle, originalSummary, originalChapters, isTranslating]
  );

  const handleFileSelected = useCallback((file: File) => {
    setPreviewFile(file);
    setErrorMessage(null);
  }, []);

  const handleStartTranscription = useCallback(
    async (file: File) => {
      // Cancel any previous transcription poll before starting a new one.
      transcriptionAbortRef.current?.abort();
      const abortController = new AbortController();
      transcriptionAbortRef.current = abortController;
      let progressTimer: ReturnType<typeof setInterval> | undefined;

      setIsTranscribing(true);
      setProgressStage('processing');
      setStatusMessage('Processing video file...');
      setErrorMessage(null);
      setDocumentTitle(DEFAULT_TITLE);
      setSegments([]);
      setChapters([]);
      setComments([]);
      setExplanation(null);
      setIsUserScrolling(false);
      setIsTranscriptOutOfSync(false);
      setTranscriptionProgress(0);
      // Keep previewFile during transcription for continued video preview
      // setPreviewFile(null);
      clearDraft();

      try {
        // Get video duration for progress estimation
        const videoDurationPromise = new Promise<number>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            resolve(video.duration);
            URL.revokeObjectURL(video.src);
          };
          video.onerror = () => resolve(300); // Default to 5 min if error
          video.src = URL.createObjectURL(file);
        });

        // Stage 1: Processing file (0-20%)
        setTranscriptionProgress(5);
        await new Promise((resolve) => setTimeout(resolve, 800));
        setTranscriptionProgress(20);

        const tempUrl = URL.createObjectURL(file);
        setVideoUrl((previous: string | null) => {
          if (previous) URL.revokeObjectURL(previous);
          return tempUrl;
        });
        setVideoName(file.name);

        // Stage 2: Uploading (20-35%)
        setProgressStage('uploading');
        setStatusMessage('Uploading to AssemblyAI...');
        setTranscriptionProgress(25);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);

        await new Promise((resolve) => setTimeout(resolve, 400));
        setTranscriptionProgress(35);

        // Stage 3: Transcribing (35-90%)
        setProgressStage('transcribing');
        setStatusMessage(
          'Transcribing audio... This may take a few minutes for longer videos'
        );

        const estimatedDuration = await videoDurationPromise;
        const estimatedTranscriptionTime = Math.max(
          3000,
          estimatedDuration * 50
        ); // ~50ms per second of video
        const progressInterval = estimatedTranscriptionTime / 55; // 55% progress range (35 to 90)

        // Realistic progress simulation
        progressTimer = setInterval(() => {
          setTranscriptionProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressTimer);
              return 90;
            }
            // Slower progress as we approach 90%
            const increment = prev < 60 ? 2 : prev < 80 ? 1 : 0.5;
            return Math.min(prev + increment, 90);
          });
        }, progressInterval);

        // POST /api/transcribe only starts the AssemblyAI job and returns
        // immediately with a job ID — it never waits for completion, so
        // long videos can't exceed serverless execution limits.
        const startResponse = await resilientFetch('/api/transcribe', {
          method: 'POST',
          body: formData,
          retries: 1, // Fewer retries for file uploads
        });

        if (!startResponse.ok) {
          let message = `Failed to start transcription (${startResponse.status})`;
          try {
            const errorData = (await startResponse.json()) as {
              error?: string;
              details?: string;
            } | null;
            const extra = errorData?.details ?? errorData?.error;
            if (extra) {
              message = `${message}: ${extra}`;
            }
          } catch (parseError) {
            console.warn(
              'Unable to parse transcription error response',
              parseError
            );
          }
          throw new Error(message);
        }

        const startData =
          (await startResponse.json()) as Partial<TranscribeStartResponse>;
        if (!startData.jobId || typeof startData.jobId !== 'string') {
          throw new Error(
            'Transcription failed: server did not return a job ID'
          );
        }

        // Poll for completion. The progress timer keeps running (capped at
        // 90%) while we wait, then the existing finalize path takes over.
        const data = await pollTranscriptionStatus(
          startData.jobId,
          abortController.signal
        );

        // Stage 4: Finalizing (90-100%)
        setProgressStage('finalizing');
        setStatusMessage('Finalizing transcript...');
        setTranscriptionProgress(92);

        setTranscriptionProgress(96);

        // Store detected language
        if (data.language_code) {
          setDetectedLanguage(data.language_code);
          console.log(`Detected language: ${data.language_code}`);
        }

        const transformedSegments: TranscriptSegment[] = data.segments.map(
          (segment: TranscriptionSegmentPayload) => ({
            id: segment.id ?? `segment-${nanoid()}`,
            start: segment.start,
            end: segment.end,
            content: deserializeTranscription(segment.text),
          })
        );

        setSegments(transformedSegments);
        setOriginalSegments(transformedSegments); // Store originals for translation
        setIsUserScrolling(false);
        setIsTranscriptOutOfSync(false);
        setDuration((prev: number) => data.duration ?? prev);
        
        // Set target language to English if source is not English
        if (data.language_code && data.language_code !== 'en') {
          setTargetLanguage('en');
        }
        setTranscriptionProgress(100);
        setStatusMessage('Transcription ready. Generating chapters...');
        await generateChapters(transformedSegments, data.duration ?? duration);
        
        // Auto-translate if non-English detected
        if (data.language_code && data.language_code !== 'en') {
          console.log(`Auto-translating from ${data.language_code} to English...`);
          // Wait for chapters/title/summary to be generated and stored (increased to 3s)
          setTimeout(() => {
            handleTranslateContent('en');
          }, 3000);
        }
      } catch (error) {
        console.error(error);
        // Aborts (unmount / new transcription) are intentional, not errors.
        if (!abortController.signal.aborted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to transcribe video'
          );
        }
      } finally {
        if (progressTimer) {
          clearInterval(progressTimer);
        }
        if (transcriptionAbortRef.current === abortController) {
          transcriptionAbortRef.current = null;
        }
        setIsTranscribing(false);
        setProgressStage('idle');
        setTranscriptionProgress(0);
      }
    },
    [duration, generateChapters]
  );

  const handleCancelPreview = useCallback(() => {
    setPreviewFile(null);
    setErrorMessage(null);
  }, []);

  const handleExplainSelection = useCallback(async () => {
    if (!selection) return;
    setIsExplaining(true);
    setProgressStage('analyzing');
    setStatusMessage('Analyzing selected text...');
    setErrorMessage(null);

    const segmentIndex = segments.findIndex(
      (segment: TranscriptSegment) => segment.id === selection.segmentId
    );
    const context = [
      segments[segmentIndex - 1],
      segments[segmentIndex],
      segments[segmentIndex + 1],
    ]
      .filter(Boolean)
      .map((segment) =>
        serializeNodesToPlainText((segment as TranscriptSegment).content)
      )
      .join('\n');

    try {
      // Small delay to show analyzing stage
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stage 2: Generating explanation
      setProgressStage('generating');
      setStatusMessage('Generating AI explanation...');

      const response = await resilientFetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: selection.text,
          context,
          level: 'beginner',
        }),
        retries: 2,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Explain request failed');
      }

      const data = (await response.json()) as { explanation: string };
      setExplanation(data.explanation);
    } catch (error) {
      console.error(error);
      setErrorMessage('Unable to generate explanation right now');
    } finally {
      setIsExplaining(false);
      setProgressStage('idle');
    }
  }, [selection, segments]);

  const handleGenerateNotes = useCallback(async () => {
    if (segments.length === 0) return;

    try {
      // Download transcript as PDF
      const { segmentsToBlob } = await import('@/lib/exporters');
      const blob = await segmentsToBlob(
        segments,
        chapters,
        'pdf',
        comments,
        documentTitle,
        summary
      );

      const baseName = videoName
        ? videoName.replace(/\.[^/.]+$/, '')
        : documentTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'transcript';

      const { downloadBlob } = await import('@/lib/utils');
      downloadBlob(blob, `${baseName}.pdf`);

      // Open Opal URL in new tab
      window.open(
        'https://opal.withgoogle.com/?flow=drive:/16lOp5CRAAucn5CY-IYNtxxDWfIImlLzt&shared&mode=app',
        '_blank',
        'noopener,noreferrer'
      );
    } catch (error) {
      console.error('Generate notes failed:', error);
      setErrorMessage('Unable to generate notes');
    }
  }, [segments, chapters, comments, documentTitle, summary, videoName]);

  const handleRenameChapter = useCallback((id: string, title: string) => {
    setChapters((prev: Chapter[]) =>
      prev.map((chapter: Chapter) =>
        chapter.id === id ? { ...chapter, title } : chapter
      )
    );
  }, []);

  const handleReorderChapter = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setChapters((prev: Chapter[]) => {
        const index = prev.findIndex((chapter: Chapter) => chapter.id === id);
        if (index === -1) return prev;
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= prev.length) return prev;
        const updated = [...prev];
        const temp = updated[index];
        updated[index] = updated[target];
        updated[target] = temp;
        const tempStart = updated[index].start;
        updated[index].start = updated[target].start;
        updated[target].start = tempStart;
        return [...updated];
      });
    },
    []
  );

  const handleDeleteChapter = useCallback((id: string) => {
    setChapters((prev: Chapter[]) =>
      prev.filter((chapter: Chapter) => chapter.id !== id)
    );
  }, []);

  const handleCreateChapter = useCallback(() => {
    const start = currentTime || (segments.length > 0 ? segments[0].start : 0);
    setChapters((prev: Chapter[]) => [
      ...prev,
      {
        id: `chapter-${nanoid()}`,
        title: `Chapter ${prev.length + 1}`,
        start,
        end: undefined,
      },
    ]);
  }, [currentTime, segments]);

  const transcriptReady = segments.length > 0;

  useEffect(() => {
    if (!transcriptReady) return;
    if (isUserScrolling) {
      updateOutOfSyncState();
      return;
    }
    scrollToActiveSegment('smooth');
  }, [
    activeSegmentId,
    isUserScrolling,
    scrollToActiveSegment,
    transcriptReady,
    updateOutOfSyncState,
  ]);

  useEffect(() => {
    if (!transcriptReady) {
      setIsUserScrolling(false);
      setIsTranscriptOutOfSync(false);
    }
  }, [transcriptReady]);

  // Clear preview file when transcription is complete
  useEffect(() => {
    if (transcriptReady && previewFile) {
      setPreviewFile(null);
    }
  }, [transcriptReady, previewFile]);

  const currentSegment = useMemo(
    () =>
      segments.find(
        (segment: TranscriptSegment) => segment.id === activeSegmentId
      ),
    [activeSegmentId, segments]
  );

  const handleDismissBanner = useCallback(() => {
    if (errorMessage) {
      setErrorMessage(null);
      return;
    }
    if (!isTranscribing && !isExplaining && statusMessage) {
      setStatusMessage(null);
    }
  }, [errorMessage, isExplaining, isTranscribing, statusMessage]);

  // Stop any in-flight transcription polling when the page unmounts.
  useEffect(() => {
    return () => {
      transcriptionAbortRef.current?.abort();
    };
  }, []);

  return (
    <>
      {/* Lazy load cursor after initial render */}
      <LazyTargetCursor hideDefaultCursor spinDuration={2.4} />
      <KeyboardShortcutsHelp 
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />
      <OfflineIndicator />
      <main className="flex flex-col px-4 py-6" role="application" aria-label="Video Transcript Editor">
        {/* Header - clean minimal design */}
        <header
          className={cn(
            'relative z-10 flex flex-col gap-4 mb-8 transition-all duration-500 ease-out',
            transcriptReady && 'sticky top-8'
          )}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="flex flex-1 flex-col gap-2 md:pr-4">
              {transcriptReady ? (
                <>
                  <input
                    id="document-title"
                    type="text"
                    value={documentTitle}
                    onChange={(event) => handleTitleChange(event.target.value)}
                    onBlur={handleTitleBlur}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Name this transcript"
                    className="w-full border-0 bg-transparent text-3xl font-semibold tracking-tight text-slate-900 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 dark:text-slate-100"
                    aria-label="Transcript title"
                  />
                  {documentTitle === DEFAULT_TITLE && (
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      💡 Consider giving your transcript a descriptive name
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Lecture Transcript Studio
                  </h1>
                  <p className="lcp-text">
                    Upload, transcribe with AssemblyAI (Slam-1), polish, and
                    export study-ready notes.
                  </p>
                </>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-nowrap md:gap-6">
              <SplitExportButton
                segments={segments}
                chapters={chapters}
                videoName={videoName}
                comments={comments}
                documentTitle={documentTitle}
                summary={summary}
              />
            </div>
          </div>
          <StatusBanner
            message={statusMessage}
            error={errorMessage}
            isBusy={isTranscribing || isExplaining}
            onDismiss={handleDismissBanner}
            stage={progressStage}
            progress={isTranscribing ? transcriptionProgress : undefined}
          />
        </header>

        {!transcriptReady && !previewFile && (
          <section className="rounded-3xl border border-slate-900/10 bg-white p-8 shadow-lg dark:border-slate-700/60 dark:bg-slate-800">
            <UploadDropzone
              onFileSelected={handleFileSelected}
              disabled={isTranscribing}
            />
            <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
              Your video never leaves the browser until you start a
              transcription request.
            </p>
          </section>
        )}

        {!transcriptReady && previewFile && (
          <VideoPreview
            file={previewFile}
            onStartTranscription={handleStartTranscription}
            onCancel={handleCancelPreview}
            disabled={isTranscribing}
          />
        )}

        {transcriptReady && (
          <div className="sticky top-0 z-50 grid h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] gap-3 md:gap-4 grid-cols-1 md:grid-cols-[minmax(280px,340px)_1fr] lg:grid-cols-[minmax(320px,420px)_1fr] overflow-hidden rounded-2xl md:rounded-3xl border border-slate-900/10 bg-[#FFFEFB] p-3 md:p-4 transition-all duration-500 ease-out dark:border-slate-700/70 dark:bg-slate-900">
            <section className="flex h-full min-h-0 flex-col gap-3 md:gap-4 overflow-y-auto pr-2 md:pr-3 scrollbar-hide">
              <div className="rounded-xl md:rounded-2xl border border-slate-900/10 bg-white/60 backdrop-blur-sm p-3 md:p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-800/60">
                <VideoPlayer
                  ref={videoHandleRef}
                  src={videoUrl}
                  currentTime={currentTime}
                  duration={duration}
                  onTimeUpdate={setCurrentTime}
                  onLoadedMetadata={setDuration}
                  chapters={chapters}
                />
              </div>

              <div className="rounded-2xl md:rounded-3xl border border-slate-900/10 bg-white shadow dark:border-slate-700/70 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setIsChaptersExpanded(!isChaptersExpanded)}
                  className="flex w-full items-center justify-between p-3 md:p-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-700/50 dark:active:bg-slate-700"
                  aria-expanded={isChaptersExpanded}
                  aria-controls="chapters-panel"
                >
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Chapters
                  </h3>
                  <svg
                    className={cn(
                      'h-4 w-4 text-slate-500 transition-transform duration-200',
                      isChaptersExpanded && 'rotate-180'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {isChaptersExpanded && (
                  <div id="chapters-panel" className="px-3 md:px-4 pb-3 md:pb-4">
                    <ChapterList
                      chapters={chapters}
                      currentTime={currentTime}
                      selectedChapterId={selectedChapterId}
                      onSelectChapter={(chapter) => {
                        videoHandleRef.current?.seek(chapter.start);
                        setCurrentTime(chapter.start);
                        setSelectedChapterId(chapter.id);
                      }}
                      onRenameChapter={handleRenameChapter}
                      onReorderChapter={handleReorderChapter}
                      onDeleteChapter={handleDeleteChapter}
                      onCreateChapter={handleCreateChapter}
                    />
                  </div>
                )}
              </div>

              {summary && (
                <div className="rounded-2xl md:rounded-3xl border border-slate-900/10 bg-white shadow dark:border-slate-700/70 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="flex w-full items-center justify-between p-3 md:p-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-700/50 dark:active:bg-slate-700"
                    aria-expanded={isSummaryExpanded}
                    aria-controls="summary-panel"
                  >
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Summary
                    </h3>
                    <svg
                      className={cn(
                        'h-4 w-4 text-slate-500 transition-transform duration-200',
                        isSummaryExpanded && 'rotate-180'
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {isSummaryExpanded && (
                    <p id="summary-panel" className="px-3 md:px-4 pb-3 md:pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {summary}
                    </p>
                  )}
                </div>
              )}

              {isGeneratingSummary && (
                <div className="rounded-2xl md:rounded-3xl border border-slate-900/10 bg-white p-3 md:p-4 shadow dark:border-slate-700/70 dark:bg-slate-800" role="status" aria-live="polite">
                  <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Summary
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
                    <span>Generating summary...</span>
                  </div>
                </div>
              )}

              <div className="rounded-2xl md:rounded-3xl border border-slate-900/10 bg-white shadow dark:border-slate-700/70 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCommentsExpanded(!isCommentsExpanded)}
                  className="flex w-full items-center justify-between p-3 md:p-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-700/50 dark:active:bg-slate-700"
                  aria-expanded={isCommentsExpanded}
                  aria-controls="comments-panel"
                >
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Inline comments
                  </h3>
                  <svg
                    className={cn(
                      'h-4 w-4 text-slate-500 transition-transform duration-200',
                      isCommentsExpanded && 'rotate-180'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {isCommentsExpanded && (
                  <div id="comments-panel" className="px-3 md:px-4 pb-3 md:pb-4">
                    <CommentPanel
                      segments={segments}
                      comments={comments}
                      onJumpToSegment={handleJumpToSegment}
                      onToggleResolved={handleToggleCommentResolved}
                      onDeleteComment={handleDeleteComment}
                      onUpdateComment={handleUpdateComment}
                    />
                  </div>
                )}
              </div>

              {explanation && (
                <div className="rounded-2xl md:rounded-3xl border border-slate-900/10 bg-white p-4 md:p-5 shadow dark:border-slate-700/70 dark:bg-slate-800" role="region" aria-label="AI Explanation">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    AI explanation
                  </h3>
                  <MarkdownText
                    content={explanation}
                    className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200"
                  />
                </div>
              )}
            </section>

            <section className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto" role="main" aria-label="Transcript Editor">
              {/* Sticky action bar - always visible */}
              <div className="sticky top-0 z-40 bg-transparent pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-300">
                    {currentSegment ? (
                      <>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                          {formatTime(currentSegment.start)} ·{' '}
                          {Math.max(
                            0,
                            currentSegment.end - currentSegment.start
                          ).toFixed(1)}
                          s
                        </span>
                        <span className="text-slate-400">
                          Active sentence synced to playback
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">
                        Press play to sync transcript highlighting.
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {detectedLanguage && detectedLanguage !== 'en' && (
                      <LanguageSelector
                        sourceLanguage={detectedLanguage}
                        targetLanguage={targetLanguage}
                        onTargetLanguageChange={handleTranslateContent}
                        isTranslating={isTranslating}
                        translationProgress={translationProgress}
                      />
                    )}
                    <ThemeToggle />
                    {isTranscriptOutOfSync && (
                      <button
                        type="button"
                        className="cursor-target rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-600 transition hover:border-amber-300 hover:text-amber-700 dark:border-amber-500/60 dark:text-amber-300 dark:hover:border-amber-400"
                        onClick={() => {
                          setIsUserScrolling(false);
                          scrollToActiveSegment();
                        }}
                      >
                        Sync
                      </button>
                    )}
                    <button
                      type="button"
                      className={cn(
                        'cursor-target inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                        selection
                          ? 'bg-[#E8DEF8] text-[#1D192B] shadow-[0_6px_20px_rgba(79,55,139,0.18)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(79,55,139,0.24)] focus-visible:outline-[#4f378b] dark:bg-[#4f378b] dark:text-[#EADDFF] dark:shadow-[0_6px_20px_rgba(30,30,84,0.32)] dark:hover:shadow-[0_10px_28px_rgba(30,30,84,0.42)]'
                          : 'cursor-not-allowed bg-[#E8DEF8]/60 text-[#1D192B]/55 opacity-70 dark:bg-[#4f378b]/35 dark:text-[#EADDFF]/40'
                      )}
                      onClick={handleExplainSelection}
                      disabled={!selection || isExplaining}
                    >
                      Explain with AI
                    </button>
                    <button
                      type="button"
                      className="cursor-target inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 bg-[#D0BCFF] text-[#1D192B] shadow-[0_6px_20px_rgba(79,55,139,0.18)] hover:shadow-[0_10px_28px_rgba(79,55,139,0.24)] focus-visible:outline-[#4f378b] dark:bg-[#6750A4] dark:text-[#EADDFF] dark:shadow-[0_6px_20px_rgba(30,30,84,0.32)] dark:hover:shadow-[0_10px_28px_rgba(30,30,84,0.42)]"
                      onClick={handleGenerateNotes}
                    >
                      Generate Notes
                    </button>
                    <button
                      type="button"
                      className="cursor-target inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-[#410002] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B3261E] bg-[#FFDAD6] shadow-[0_6px_18px_rgba(191,54,12,0.18)] hover:shadow-[0_10px_26px_rgba(191,54,12,0.24)] dark:bg-[#B3261E] dark:text-[#FFDAD6] dark:shadow-[0_6px_20px_rgba(191,54,12,0.35)] dark:hover:shadow-[0_10px_28px_rgba(191,54,12,0.45)]"
                      onClick={() => {
                        setSegments([]);
                        setChapters([]);
                        setComments([]);
                        setSelection(null);
                        setExplanation(null);
                        setVideoUrl(null);
                        setVideoName('');
                        setDocumentTitle(DEFAULT_TITLE);
                        setIsUserScrolling(false);
                        setIsTranscriptOutOfSync(false);
                        clearDraft();
                      }}
                    >
                      Start over
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-900/10 bg-white/60 backdrop-blur-sm shadow dark:border-slate-700/70 dark:bg-slate-800/40 flex-1 overflow-hidden">
                <div
                  ref={transcriptContainerRef}
                  onScroll={handleTranscriptScroll}
                  className="h-full space-y-4 overflow-y-auto px-6 py-6 styled-scrollbar scrollbar-track-transparent scroll-smooth"
                  tabIndex={0}
                  role="region"
                  aria-label="Transcript content"
                >
                  <div ref={transcriptSectionRef} tabIndex={-1}>
                    <TranscriptEditor
                      segments={segments}
                      activeSegmentId={activeSegmentId}
                      onSegmentValueChange={handleSegmentValueChange}
                      onSelectionChange={handleSelectionChange}
                      comments={comments}
                      onCreateComment={handleCreateComment}
                      onToggleResolved={handleToggleCommentResolved}
                      onUpdateComment={handleUpdateComment}
                      onDeleteComment={handleDeleteComment}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
