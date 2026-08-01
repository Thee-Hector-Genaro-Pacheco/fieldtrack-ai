import type { TelemetryResponse } from '../types/telemetry';
import type { CameraStatusResponse, SnapshotResponse } from '../types/camera';
import type { MotionStatusResponse, MotionEvent } from '../types/motion';

const getHost = () =>
  typeof window !== 'undefined' && window.location.hostname
    ? window.location.hostname
    : 'localhost';

const getProtocol = () =>
  typeof window !== 'undefined' && window.location.protocol
    ? window.location.protocol
    : 'http:';

export const API_BASE_URL =
  import.meta.env.VITE_PI_AGENT_API_URL ||
  `${getProtocol()}//${getHost()}:8000`;

export const HAND_API_BASE_URL =
  import.meta.env.VITE_HAND_API_HOST ||
  `${getProtocol()}//${getHost()}:8001`;

export interface HealthResponse {
  status: string;
  timestamp: string;
  gps_mode: string;
  serial_connected: boolean;
  camera_online: boolean;
  motion_online: boolean;
  motion_state: string;
  rgb_online: boolean;
  rgb_state: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}


export async function fetchTelemetry(): Promise<TelemetryResponse> {
  const response = await fetch(`${API_BASE_URL}/telemetry/current`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function fetchCameraStatus(): Promise<CameraStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/camera/status`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function captureSnapshot(): Promise<SnapshotResponse> {
  const response = await fetch(`${API_BASE_URL}/camera/snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export function getCameraStreamUrl(streamKey: string | number): string {
  return `${API_BASE_URL}/camera/stream?t=${streamKey}`;
}

export function getSnapshotImageUrl(relativeUrl: string): string {
  if (relativeUrl.startsWith('http')) return relativeUrl;
  return `${API_BASE_URL}${relativeUrl}`;
}

export async function fetchMotionStatus(): Promise<MotionStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/motion/status`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function fetchMotionEvents(limit = 20): Promise<MotionEvent[]> {
  const response = await fetch(`${API_BASE_URL}/motion/events?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function triggerTestMotionEvent(): Promise<MotionEvent> {
  const response = await fetch(`${API_BASE_URL}/motion/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}
