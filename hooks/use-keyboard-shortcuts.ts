import { useEffect, useCallback } from 'react';

interface KeyboardShortcutHandlers {
  onPlayPause?: () => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
  onToggleFullscreen?: () => void;
  onCreateComment?: () => void;
  onExport?: () => void;
  onSearch?: () => void;
  onJumpToTranscript?: () => void;
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const { key, ctrlKey, metaKey, shiftKey } = event;
      const modKey = ctrlKey || metaKey; // Support both Ctrl (Windows/Linux) and Cmd (Mac)

      switch (true) {
        // Video playback controls
        case key === ' ':
          event.preventDefault();
          handlers.onPlayPause?.();
          break;

        case key === 'ArrowRight' && !modKey:
          event.preventDefault();
          handlers.onSeekForward?.();
          break;

        case key === 'ArrowLeft' && !modKey:
          event.preventDefault();
          handlers.onSeekBackward?.();
          break;

        case key === 'f' && !modKey:
          event.preventDefault();
          handlers.onToggleFullscreen?.();
          break;

        // Comment and export shortcuts
        case key === '/' && modKey:
          event.preventDefault();
          handlers.onCreateComment?.();
          break;

        case key === 'e' && modKey:
          event.preventDefault();
          handlers.onExport?.();
          break;

        case key === 'k' && modKey:
          event.preventDefault();
          handlers.onSearch?.();
          break;

        case key === 't' && modKey:
          event.preventDefault();
          handlers.onJumpToTranscript?.();
          break;

        case key === '?' && !modKey:
          event.preventDefault();
          handlers.onShowHelp?.();
          break;
      }
    },
    [handlers]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export const KEYBOARD_SHORTCUTS = [
  { keys: 'Space', description: 'Play/Pause video' },
  { keys: '←/→', description: 'Seek backward/forward 5s' },
  { keys: 'F', description: 'Toggle fullscreen' },
  { keys: 'Ctrl+/', description: 'Add comment to selection' },
  { keys: 'Ctrl+E', description: 'Export transcript' },
  { keys: 'Ctrl+K', description: 'Search transcript' },
  { keys: 'Ctrl+T', description: 'Jump to transcript' },
  { keys: '?', description: 'Show keyboard shortcuts' },
] as const;
