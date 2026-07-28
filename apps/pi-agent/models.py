from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DeviceHealth(BaseModel):
    status: str
    gps_mode: str
    serial_connected: bool
    sentences_received: int
    sentences_parsed: int
    parse_errors: int
    reconnect_attempts: int
    last_error: Optional[str]
    cpu_temperature_c: Optional[float]
    uptime_seconds: float
    last_sentence_at: Optional[datetime]
    data_age_seconds: Optional[float]


class Telemetry(BaseModel):
    fix: bool
    timestamp: Optional[datetime]
    latitude: Optional[float]
    longitude: Optional[float]
    altitude_meters: Optional[float]
    satellites_used: Optional[int]
    satellites_in_view: Optional[int]
    hdop: Optional[float]
    speed_kph: Optional[float]
    source: str
    device_health: DeviceHealth


class CameraStatus(BaseModel):
    online: bool
    device: str
    camera_name: str
    resolution: str
    configured_fps: int
    actual_fps: Optional[float]
    pixel_format: str
    last_frame_at: Optional[datetime]
    last_error: Optional[str]


class SnapshotResponse(BaseModel):
    filename: str
    timestamp: datetime
    width: int
    height: int
    url: str


class MotionStatus(BaseModel):
    online: bool
    current_state: str  # "clear" | "motion"
    initialized: bool
    warming_up: bool
    warmup_remaining_seconds: int
    gpio_pin: int
    auto_snapshot: bool
    cooldown_seconds: float
    last_motion_at: Optional[datetime]
    last_cleared_at: Optional[datetime]
    total_motion_events: int
    last_error: Optional[str]


class MotionEvent(BaseModel):
    id: str
    event_type: str  # "motion_started" | "motion_cleared" | "simulated_motion"
    timestamp: datetime
    motion_state: str  # "motion" | "clear"
    snapshot_filename: Optional[str] = None
    snapshot_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    fix: bool = False
    simulated: bool = False