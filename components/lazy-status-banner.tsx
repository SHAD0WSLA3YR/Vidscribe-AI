'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the status banner with no SSR
const StatusBanner = dynamic(
  () =>
    import('@/components/status-banner').then((mod) => ({
      default: mod.StatusBanner,
    })),
  {
    ssr: false,
  }
);

interface LazyStatusBannerProps {
  message?: string;
  error?: string;
  isBusy?: boolean;
  onDismiss?: () => void;
}

export function LazyStatusBanner({
  message,
  error,
  isBusy,
  onDismiss,
}: LazyStatusBannerProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Only load the status banner after the page has fully loaded
    const timer = setTimeout(() => {
      setShouldLoad(true);
    }, 1500); // Load after 1.5 seconds

    return () => clearTimeout(timer);
  }, []);

  // Don't render anything initially to prevent blocking LCP
  if (!shouldLoad) {
    // Show a minimal fallback only if there's an error
    if (error) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      );
    }
    return null;
  }

  return (
    <StatusBanner
      message={message}
      error={error}
      isBusy={isBusy}
      onDismiss={onDismiss}
    />
  );
}
