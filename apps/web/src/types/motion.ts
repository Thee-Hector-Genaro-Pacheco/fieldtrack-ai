export interface MotionStatusResponse {
  online: boolean;
  current_state: 'clear' | 'motion' | string;
  initialized: boolean;
  warming_up: boolean;
  warmup_remaining_seconds: number;
  gpio_pin: number;
  auto_snapshot: boolean;
  cooldown_seconds: number;
  last_motion_at: string | null;
  last_cleared_at: string | null;
  total_motion_events: number;
  last_error: string | null;
}

export interface MotionEvent {
  id: string;
  event_type: 'motion_started' | 'motion_cleared' | 'simulated_motion' | string;
  timestamp: string;
  motion_state: 'motion' | 'clear' | string;
  snapshot_filename: string | null;
  snapshot_url: string | null;
  latitude: number | null;
  longitude: number | null;
  fix: boolean;
  simulated: boolean;
}
