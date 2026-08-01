import { useState, useEffect, useRef } from 'react';
import type { HandDetectionPayload, UseHandDetectionOptions } from '../types/handDetection';

export const useHandDetection = (options: UseHandDetectionOptions = {}) => {
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const envHost = import.meta.env.VITE_HAND_WS_HOST;
  const host = envHost || (typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost');
  const wsUrl = options.wsUrl || `${protocol}//${host}:8080`;
  const reconnectInterval = options.reconnectInterval ?? 2500;

  const [data, setData] = useState<HandDetectionPayload>({
    handDetected: false,
    fingers: 0,
    confidence: 0,
  });

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const connect = () => {
      try {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          setError(null);
          console.log('[useHandDetection] Connected to WebSocket at', wsUrl);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const parsed: HandDetectionPayload = JSON.parse(event.data);
            if (typeof parsed.handDetected === 'boolean') {
              setData(parsed);
            }
          } catch (e) {
            console.error('[useHandDetection] Failed to parse payload:', e);
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setError(`WebSocket connection error at ${wsUrl}`);
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setIsConnected(false);
          wsRef.current = null;
          // Schedule auto-reconnect
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) connect();
          }, reconnectInterval);
        };
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || 'WebSocket initialization failed');
        reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [wsUrl, reconnectInterval]);

  return {
    data,
    handDetected: data.handDetected,
    fingers: data.fingers,
    confidence: data.confidence,
    fps: data.fps || 0,
    isConnected,
    error,
  };
};
