export interface DeviceHealth {
  status: 'healthy' | 'degraded' | 'error';
  gps_mode: 'live' | 'hardware' | 'mock' | string;
  serial_connected: boolean;
  sentences_received: number;
  sentences_parsed: number;
  parse_errors: number;
  reconnect_attempts: number;
  last_error: string | null;
  cpu_temperature_c: number | null;
  uptime_seconds: number;
  last_sentence_at: string | null;
  data_age_seconds: number;
  rgb_online?: boolean;
  rgb_state?: string;
}


export interface TelemetryResponse {
  fix: boolean;
  timestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude_meters: number | null;
  satellites_used: number | null;
  satellites_in_view: number | null;
  hdop: number | null;
  speed_kph: number | null;
  source: 'live' | 'hardware' | 'mock' | string;
  device_health: DeviceHealth;
}
