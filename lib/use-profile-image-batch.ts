'use client';

import { useEffect, useState } from 'react';
import {
  fetchProfileImageBatchUrls,
  normalizeProfileImageBatchPaths,
} from '@/lib/profile-image-batch';

export function useProfileImageBatchUrls(paths: readonly (string | null)[]) {
  const requestKey = JSON.stringify(normalizeProfileImageBatchPaths(paths));
  const [result, setResult] = useState<{
    requestKey: string | null;
    urls: Record<string, string>;
  }>({ requestKey: null, urls: {} });

  useEffect(() => {
    const requestedPaths = JSON.parse(requestKey) as string[];
    const abortController = new AbortController();

    void fetchProfileImageBatchUrls(requestedPaths, fetch, abortController.signal)
      .then((nextUrls) => {
        if (!abortController.signal.aborted) {
          setResult({ requestKey, urls: nextUrls });
        }
      });

    return () => abortController.abort();
  }, [requestKey]);

  return result.requestKey === requestKey ? result.urls : null;
}
