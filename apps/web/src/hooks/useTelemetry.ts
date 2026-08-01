import { useState, useEffect } from 'react';
import type { TelemetryResponse } from '../types/telemetry';
import { fetchTelemetry } from '../lib/api';

export function useTelemetry(intervalMs = 2000) {
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const telemetry = await fetchTelemetry();
        if (active) {
          setData(telemetry);
          setError(null);
          setLastFetchTime(new Date());
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err : new Error('Telemetry API Unavailable'));
          setLoading(false);
        }
      }
    }

    poll();

    const interval = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return {
    data,
    loading,
    error,
    lastFetchTime,
    isConnected: !error && data !== null,
  };
}
