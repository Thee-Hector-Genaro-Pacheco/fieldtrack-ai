import { useState, useEffect, useCallback } from 'react';
import type { CameraStatusResponse, SnapshotResponse } from '../types/camera';
import { fetchCameraStatus, captureSnapshot as apiCaptureSnapshot } from '../lib/api';

export function useCamera(intervalMs = 6000) {
  const [status, setStatus] = useState<CameraStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<SnapshotResponse | null>(null);
  const [streamKey, setStreamKey] = useState<number>(() => Date.now());

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchCameraStatus();
      setStatus(data);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Camera service unavailable'));
      setStatus((prev) => (prev ? { ...prev, online: false } : null));
      setLoading(false);
    }
  }, []);

  const refreshStream = useCallback(() => {
    setStreamKey(Date.now());
    refreshStatus();
  }, [refreshStatus]);

  const takeSnapshot = useCallback(async () => {
    setCapturing(true);
    setSnapshotError(null);
    try {
      const res = await apiCaptureSnapshot();
      setLastSnapshot(res);
      setCapturing(false);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to capture snapshot';
      setSnapshotError(msg);
      setCapturing(false);
      throw err;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function poll() {
      if (active) {
        await refreshStatus();
      }
    }

    poll();
    const interval = setInterval(poll, intervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [intervalMs, refreshStatus]);

  return {
    status,
    loading,
    error,
    capturing,
    snapshotError,
    lastSnapshot,
    streamKey,
    refreshStatus,
    refreshStream,
    takeSnapshot,
  };
}
