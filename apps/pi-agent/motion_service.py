import os
import time
import uuid
import queue
import threading
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Optional, List, Tuple

from models import MotionStatus, MotionEvent
from camera_service import get_camera_service
from gps_reader import get_telemetry
from lcd_service import get_lcd_service

logger = logging.getLogger("pi-agent")

class MotionService:
    def __init__(self):
        self._lock = threading.Lock()
        
        # Configuration
        self.enabled = os.getenv("MOTION_ENABLED", "true").lower() in ("true", "1", "yes")
        self.gpio_pin = int(os.getenv("MOTION_GPIO_PIN", "17"))
        self.warmup_seconds = int(os.getenv("MOTION_WARMUP_SECONDS", "30"))
        self.cooldown_seconds = float(os.getenv("MOTION_COOLDOWN_SECONDS", "10"))
        self.auto_snapshot = os.getenv("MOTION_AUTO_SNAPSHOT", "true").lower() in ("true", "1", "yes")
        self._event_limit = int(os.getenv("MOTION_EVENT_LIMIT", "100"))

        # State tracking
        self.startup_time = datetime.now(timezone.utc)
        self.sensor_online = False
        self.initialized = False
        self.mock_mode = False
        
        self.current_state = "clear"
        self.last_motion_at: Optional[datetime] = None
        self.last_cleared_at: Optional[datetime] = None
        self.total_motion_events = 0
        self.last_error: Optional[str] = None
        self.last_snapshot_at: float = 0.0

        # Event buffer & processing queue
        self._events_buffer: deque[MotionEvent] = deque(maxlen=self._event_limit)
        self._event_queue: queue.Queue[Tuple[str, datetime, bool]] = queue.Queue()
        
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._pir_sensor = None

        self._init_sensor()

    @property
    def event_limit(self) -> int:
        return self._event_limit

    @event_limit.setter
    def event_limit(self, value: int):
        with self._lock:
            self._event_limit = value
            items = list(self._events_buffer)
            self._events_buffer = deque(items, maxlen=value)

    def _init_sensor(self):
        if not self.enabled:
            self.last_error = "Motion sensor disabled via configuration (MOTION_ENABLED=false)"
            logger.info(f"[MOTION SERVICE] {self.last_error}")
            return

        # Explicitly configure lgpio pin factory on Raspberry Pi 5 Linux
        if os.name != "nt" and os.path.exists("/proc/device-tree/model"):
            os.environ["GPIOZERO_PIN_FACTORY"] = os.getenv("GPIOZERO_PIN_FACTORY", "lgpio")

        try:
            import gpiozero  # type: ignore
            self._pir_sensor = gpiozero.MotionSensor(pin=self.gpio_pin)
            self._pir_sensor.when_motion = self._on_gpio_motion_started
            self._pir_sensor.when_no_motion = self._on_gpio_motion_cleared
            self.sensor_online = True
            self.initialized = True
            self.mock_mode = False
            logger.info(f"[MOTION SERVICE] Successfully initialized PIR sensor on BCM GPIO{self.gpio_pin} using gpiozero.")
        except Exception as e:
            self.sensor_online = True  # Sensor service online in development/mock fallback mode
            self.initialized = True
            self.mock_mode = True
            self.last_error = f"GPIO hardware unavailable: {e}"
            logger.info(f"[MOTION SERVICE] GPIO hardware unavailable ({e}). Operating in development mock mode.")

    def _on_gpio_motion_started(self):
        if self._is_warming_up():
            logger.info("[MOTION SERVICE] Suppressed GPIO motion trigger during PIR warm-up calibration.")
            return
        self._event_queue.put(("motion_started", datetime.now(timezone.utc), False))

    def _on_gpio_motion_cleared(self):
        if self._is_warming_up():
            return
        self._event_queue.put(("motion_cleared", datetime.now(timezone.utc), False))

    def _is_warming_up(self) -> bool:
        elapsed = (datetime.now(timezone.utc) - self.startup_time).total_seconds()
        return elapsed < self.warmup_seconds

    def start(self):
        self._stop_event.clear()
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()
        logger.info("[MOTION SERVICE] Worker thread started.")

    def stop(self):
        self._stop_event.set()
        if self._pir_sensor is not None:
            try:
                self._pir_sensor.close()
            except Exception:
                pass
            self._pir_sensor = None
        if self._worker_thread is not None:
            self._worker_thread.join(timeout=2.0)
            logger.info("[MOTION SERVICE] Worker thread stopped.")

    def simulate_motion_event(self) -> MotionEvent:
        now = datetime.now(timezone.utc)
        return self._process_single_event("simulated_motion", now, True)

    def _worker_loop(self):
        while not self._stop_event.is_set():
            try:
                event_type, ts, is_simulated = self._event_queue.get(timeout=0.5)
                self._process_single_event(event_type, ts, is_simulated)
                self._event_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"[MOTION WORKER] Error processing motion event: {e}")

    def _process_single_event(self, event_type: str, ts: datetime, is_simulated: bool) -> MotionEvent:
        snapshot_filename = None
        snapshot_url = None
        
        # Determine motion state
        is_motion_active = event_type in ("motion_started", "simulated_motion")
        state_str = "motion" if is_motion_active else "clear"
        
        with self._lock:
            self.current_state = state_str
            if is_motion_active:
                self.last_motion_at = ts
                self.total_motion_events += 1
            else:
                self.last_cleared_at = ts

        # Trigger LCD notification
        lcd = get_lcd_service()
        if is_motion_active:
            lcd.notify_motion(ts.strftime("%H:%M:%S"))

        # Auto-snapshot integration on motion start
        if is_motion_active and self.auto_snapshot:
            now_mono = time.time()
            if (now_mono - self.last_snapshot_at) >= self.cooldown_seconds:
                try:
                    cam = get_camera_service()
                    if cam.online:
                        snap_res = cam.capture_snapshot()
                        snapshot_filename = snap_res.filename
                        snapshot_url = snap_res.url
                        self.last_snapshot_at = now_mono
                        lcd.notify_snapshot(ts.strftime("%H:%M:%S"))
                except Exception as snap_err:
                    logger.warning(f"[MOTION SNAPSHOT] Auto-snapshot capture skipped/failed: {snap_err}")

        # Fetch current GPS telemetry for event geotagging
        lat = None
        lon = None
        fix_status = False
        try:
            tel = get_telemetry()
            lat = tel.latitude
            lon = tel.longitude
            fix_status = tel.fix
        except Exception:
            pass

        # Construct MotionEvent
        event_id = f"evt_{uuid.uuid4().hex[:10]}"
        event = MotionEvent(
            id=event_id,
            event_type=event_type,
            timestamp=ts,
            motion_state=state_str,
            snapshot_filename=snapshot_filename,
            snapshot_url=snapshot_url,
            latitude=lat,
            longitude=lon,
            fix=fix_status,
            simulated=is_simulated,
        )

        with self._lock:
            self._events_buffer.append(event)

        logger.info(f"[MOTION EVENT] {event_type.upper()} | State: {state_str} | Snapshot: {snapshot_filename or 'None'} | Geotag Fix: {fix_status}")
        return event

    def get_status(self) -> MotionStatus:
        now = datetime.now(timezone.utc)
        elapsed = (now - self.startup_time).total_seconds()
        is_warm = elapsed < self.warmup_seconds
        remaining = max(0, int(self.warmup_seconds - elapsed))

        with self._lock:
            return MotionStatus(
                online=self.sensor_online,
                current_state=self.current_state,
                initialized=self.initialized,
                warming_up=is_warm,
                warmup_remaining_seconds=remaining,
                gpio_pin=self.gpio_pin,
                auto_snapshot=self.auto_snapshot,
                cooldown_seconds=self.cooldown_seconds,
                last_motion_at=self.last_motion_at,
                last_cleared_at=self.last_cleared_at,
                total_motion_events=self.total_motion_events,
                last_error=self.last_error,
            )

    def get_events(self, limit: int = 20) -> List[MotionEvent]:
        with self._lock:
            events_list = list(self._events_buffer)[::-1]
            return events_list[:limit]


_motion_service: Optional[MotionService] = None

def get_motion_service() -> MotionService:
    global _motion_service
    if _motion_service is None:
        _motion_service = MotionService()
    return _motion_service

def start_motion_service():
    service = get_motion_service()
    service.start()

def stop_motion_service():
    service = get_motion_service()
    service.stop()
