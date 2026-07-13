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