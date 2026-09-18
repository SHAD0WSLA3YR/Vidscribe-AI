'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the cursor with no SSR
const TargetCursor = dynamic(() => import('@/components/target-cursor'), {
  ssr: false,
});

interface LazyTargetCursorProps {
  hideDefaultCursor?: boolean;
  spinDuration?: number;
}

export function LazyTargetCursor({
  hideDefaultCursor,
  spinDuration,
}: LazyTargetCursorProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Load after critical content renders but not too late for UX
    const timer = setTimeout(() => {
      setShouldLoad(true);
    }, 1000); // Load after 1 second - balanced approach

    return () => clearTimeout(timer);
  }, []);

  // Don't load on mobile devices for better performance
  useEffect(() => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    if (isMobile) {
      setShouldLoad(false);
    }
  }, []);

  if (!shouldLoad) return null;

  return (
    <TargetCursor
      hideDefaultCursor={hideDefaultCursor}
      spinDuration={spinDuration}
    />
  );
}
