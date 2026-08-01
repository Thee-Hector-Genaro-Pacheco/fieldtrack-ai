import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, fetchHealth, type HealthResponse } from '../lib/api';

export interface UseApiHealthResult {
  isConnected: boolean;
  health: HealthResponse | null;
  loading: boolean;
  error: Error | null;
  consecutiveFailures: number;
  lastSuccessTime: Date | null;
  apiUrl: string;
}

export function useApiHealth(intervalMs = 3000, failureThreshold = 3): UseApiHealthResult {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);
  const [lastSuccessTime, setLastSuccessTime] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
      setError(null);
      setConsecutiveFailures(0);
      setLastSuccessTime(new Date());
      setIsConnected(true);
      setLoading(false);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Pi Agent Health Check Failed');
      setError(errorObj);
      setLoading(false);

      setConsecutiveFailures((prev) => {
        const next = prev + 1;
        if (next >= failureThreshold) {
          setIsConnected(false);
        }
        return next;
      });
    }
  }, [failureThreshold]);

  useEffect(() => {
    let active = true;

    async function poll() {
      if (active) {
        await checkHealth();
      }
    }

    poll();
    const interval = setInterval(poll, intervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [intervalMs, checkHealth]);

  return {
    isConnected,
    health,
    loading,
    error,
    consecutiveFailures,
    lastSuccessTime,
    apiUrl: API_BASE_URL,
  };
}
