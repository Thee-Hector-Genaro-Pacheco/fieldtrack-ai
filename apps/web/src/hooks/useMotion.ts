import { useState, useEffect, useCallback } from 'react';
import type { MotionStatusResponse, MotionEvent } from '../types/motion';
import {
  fetchMotionStatus,
  fetchMotionEvents,
  triggerTestMotionEvent,
} from '../lib/api';

export function useMotion(statusIntervalMs = 3000, eventsIntervalMs = 6000) {
  const [status, setStatus] = useState<MotionStatusResponse | null>(null);
  const [events, setEvents] = useState<MotionEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [triggeringTest, setTriggeringTest] = useState<boolean>(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchMotionStatus();
      setStatus(data);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Motion service unavailable'));
      setStatus((prev) => (prev ? { ...prev, online: false } : null));
      setLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const data = await fetchMotionEvents(25);
      setEvents(data);
    } catch {
      // Ignore background events poll errors if status is active
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshEvents()]);
  }, [refreshStatus, refreshEvents]);

  const triggerTestEvent = useCallback(async () => {
    setTriggeringTest(true);
    setTriggerError(null);
    try {
      const newEvent = await triggerTestMotionEvent();
      setEvents((prev) => [newEvent, ...prev.filter((e) => e.id !== newEvent.id)]);
      await refreshStatus();
      setTriggeringTest(false);
      return newEvent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger test motion event';
      setTriggerError(msg);
      setTriggeringTest(false);
      throw err;
    }
  }, [refreshStatus]);

  useEffect(() => {
    let active = true;

    async function initialFetch() {
      if (active) {
        await refreshAll();
      }
    }

    initialFetch();

    const statusTimer = setInterval(() => {
      if (active) refreshStatus();
    }, statusIntervalMs);

    const eventsTimer = setInterval(() => {
      if (active) refreshEvents();
    }, eventsIntervalMs);

    return () => {
      active = false;
      clearInterval(statusTimer);
      clearInterval(eventsTimer);
    };
  }, [statusIntervalMs, eventsIntervalMs, refreshStatus, refreshEvents, refreshAll]);

  return {
    status,
    events,
    loading,
    error,
    triggeringTest,
    triggerError,
    refreshAll,
    triggerTestEvent,
  };
}
