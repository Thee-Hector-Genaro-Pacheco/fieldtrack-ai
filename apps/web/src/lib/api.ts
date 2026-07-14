import type { TelemetryResponse } from '../types/telemetry';

const API_BASE_URL = import.meta.env.VITE_PI_AGENT_API_URL || 'http://localhost:8000';

export async function fetchTelemetry(): Promise<TelemetryResponse> {
  const response = await fetch(`${API_BASE_URL}/telemetry/current`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
