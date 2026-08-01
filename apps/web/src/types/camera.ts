export interface CameraStatusResponse {
  online: boolean;
  device: string;
  camera_name: string;
  resolution: string;
  configured_fps: number;
  actual_fps: number | null;
  pixel_format: string;
  last_frame_at: string | null;
  last_error: string | null;
}

export interface SnapshotResponse {
  filename: string;
  timestamp: string;
  width: number;
  height: number;
  url: string;
}
