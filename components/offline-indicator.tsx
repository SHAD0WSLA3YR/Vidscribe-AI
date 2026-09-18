'use client';

import { WifiOff, Wifi } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/use-network-status';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-lg border px-4 py-2 shadow-lg transition-all ${
        isOnline
          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/50 dark:bg-green-500/10 dark:text-green-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300'
      }`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          <span className="text-sm font-medium">Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">
            You're offline - changes are saved locally
          </span>
        </>
      )}
    </div>
  );
}
