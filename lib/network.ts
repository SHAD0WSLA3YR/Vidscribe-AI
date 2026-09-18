/**
 * Resilient API fetch with offline detection and retry logic
 */

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
}

export async function resilientFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = 2, retryDelay = 1000, ...fetchOptions } = options;

  // Check if offline
  if (!navigator.onLine) {
    throw new Error(
      'No internet connection. Your changes are saved locally and will sync when you are back online.'
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Return response even if not ok - let caller handle HTTP errors
      return response;
    } catch (error) {
      lastError = error as Error;

      // Check if offline during request
      if (!navigator.onLine) {
        throw new Error(
          'Lost internet connection. Your changes are saved locally.'
        );
      }

      // Don't retry on last attempt
      if (attempt < retries) {
        // Wait before retrying with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * Math.pow(2, attempt))
        );
      }
    }
  }

  // All retries failed
  throw new Error(
    `Network request failed after ${retries + 1} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Check network connectivity with a lightweight ping
 */
export async function checkNetworkConnectivity(): Promise<boolean> {
  if (!navigator.onLine) {
    return false;
  }

  try {
    // Ping a lightweight endpoint (or use your API health endpoint)
    const response = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.ok;
  } catch {
    return false;
  }
}
