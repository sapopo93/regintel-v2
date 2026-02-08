/**
 * useBackgroundJob Hook
 *
 * Polls a background job until completion.
 * Handles PENDING, PROCESSING, COMPLETED, FAILED states.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { JobStatus } from '@/lib/api/types';

export interface BackgroundJobState {
  status: JobStatus | null;
  result: unknown | null;
  error: string | null;
  isLoading: boolean;
  isComplete: boolean;
  isFailed: boolean;
}

interface UseBackgroundJobOptions {
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
  /** Whether to start polling immediately (default: true) */
  autoStart?: boolean;
  /** Callback when job completes */
  onComplete?: (result: unknown) => void;
  /** Callback when job fails */
  onError?: (error: string) => void;
}

export function useBackgroundJob(
  jobId: string | null,
  options: UseBackgroundJobOptions = {}
): BackgroundJobState & { startPolling: () => void; stopPolling: () => void } {
  const {
    pollInterval = 2000,
    autoStart = true,
    onComplete,
    onError,
  } = options;

  const [state, setState] = useState<BackgroundJobState>({
    status: null,
    result: null,
    error: null,
    isLoading: false,
    isComplete: false,
    isFailed: false,
  });

  const [isPolling, setIsPolling] = useState(autoStart);

  const checkJobStatus = useCallback(async () => {
    if (!jobId) return;

    try {
      const response = await apiClient.getBackgroundJob(jobId);
      const job = response.job;

      const isComplete = job.status === 'COMPLETED';
      const isFailed = job.status === 'FAILED';

      setState({
        status: job.status,
        result: job.result ?? null,
        error: job.error ?? null,
        isLoading: job.status === 'PENDING' || job.status === 'PROCESSING',
        isComplete,
        isFailed,
      });

      if (isComplete) {
        setIsPolling(false);
        onComplete?.(job.result);
      }

      if (isFailed) {
        setIsPolling(false);
        onError?.(job.error ?? 'Job failed');
      }

      return { isComplete, isFailed };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check job status';
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isFailed: true,
      }));
      setIsPolling(false);
      onError?.(errorMessage);
      return { isComplete: false, isFailed: true };
    }
  }, [jobId, onComplete, onError]);

  const startPolling = useCallback(() => {
    setIsPolling(true);
    setState((prev) => ({ ...prev, isLoading: true }));
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (!jobId || !isPolling) return;

    // Initial check
    checkJobStatus();

    // Set up polling interval
    const intervalId = setInterval(async () => {
      const result = await checkJobStatus();
      if (result?.isComplete || result?.isFailed) {
        clearInterval(intervalId);
      }
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [jobId, isPolling, pollInterval, checkJobStatus]);

  return {
    ...state,
    startPolling,
    stopPolling,
  };
}

export default useBackgroundJob;
