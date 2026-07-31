import os
import math
import time
import threading
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional, Tuple, List

from models import RGBStatus

logger = logging.getLogger("pi-agent")

# Priorities for animation overrides
PRIORITY_SNAPSHOT = 100
PRIORITY_BOOT = 90
PRIORITY_MOTION = 80
PRIORITY_BASELINE = 0

VALID_STATES = {
    "boot",
    "healthy",
    "gps_searching",
    "motion_detected",
    "snapshot",
    "error",
    "off",
}


class BaseRGBDriver(ABC):
    """Abstract base class for RGB LED hardware and mock drivers."""

    @abstractmethod
    def set_pixel(self, index: int, r: int, g: int, b: int) -> None:
        """Set the RGB color of a specific pixel (0-indexed)."""
        pass

    @abstractmethod
    def show(self) -> None:
        """Update hardware or mock state with set pixel values."""
        pass

    @abstractmethod
    def clear(self) -> None:
        """Turn off all pixels."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Clean up driver resources."""
        pass


class HardwareRGBDriver(BaseRGBDriver):
    """
    Physical hardware driver for NeoPixel/WS2812B RGB module using rpi_ws281x.
    Note: On Raspberry Pi 5 (RP1 controller), direct DMA /dev/mem access used by
    rpi_ws281x is unsupported. If initialization fails, fallback to MockRGBDriver.
    """

    def __init__(self, gpio_pin: int = 18, pixel_count: int = 8):
        self.gpio_pin = gpio_pin
        self.pixel_count = pixel_count
        self._strip = None

        if os.name == "nt" or not os.path.exists("/proc/device-tree/model"):
            raise RuntimeError("Hardware RGB driver requires Linux Raspberry Pi environment")

        try:
            import rpi_ws281x  # type: ignore
            self._strip = rpi_ws281x.PixelStrip(
                pixel_count,
                gpio_pin,
                800000,
                10,
                False,
                255,
                0,
            )
            self._strip.begin()
            logger.info(f"[RGB SERVICE] Hardware WS2812 driver initialized on BCM GPIO{gpio_pin} with {pixel_count} pixels.")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize hardware WS2812 strip on BCM GPIO{gpio_pin}: {e}")

    def set_pixel(self, index: int, r: int, g: int, b: int) -> None:
        if self._strip is not None and 0 <= index < self.pixel_count:
            import rpi_ws281x  # type: ignore
            color = rpi_ws281x.Color(r, g, b)
            self._strip.setPixelColor(index, color)

    def show(self) -> None:
        if self._strip is not None:
            self._strip.show()

    def clear(self) -> None:
        if self._strip is not None:
            import rpi_ws281x  # type: ignore
            for i in range(self.pixel_count):
                self._strip.setPixelColor(i, rpi_ws281x.Color(0, 0, 0))
            self._strip.show()

    def close(self) -> None:
        if self._strip is not None:
            try:
                self.clear()
            except Exception:
                pass
            self._strip = None


class MockRGBDriver(BaseRGBDriver):
    """Software mock driver for development and non-hardware environments."""

    def __init__(self, pixel_count: int = 8):
        self.pixel_count = pixel_count
        self.pixels: List[Tuple[int, int, int]] = [(0, 0, 0)] * pixel_count

    def set_pixel(self, index: int, r: int, g: int, b: int) -> None:
        if 0 <= index < self.pixel_count:
            self.pixels[index] = (r, g, b)

    def show(self) -> None:
        pass

    def clear(self) -> None:
        self.pixels = [(0, 0, 0)] * self.pixel_count

    def close(self) -> None:
        self.clear()


class RGBService:
    def __init__(self):
        self._lock = threading.Lock()

        # Configurable settings
        self.gpio_pin = int(os.getenv("RGB_GPIO_PIN", "18"))
        self.pixel_count = int(os.getenv("RGB_PIXEL_COUNT", "8"))
        # Default brightness strictly limited to 20% to prevent excessive current draw
        self.brightness = min(0.2, float(os.getenv("RGB_BRIGHTNESS", "0.2")))

        # State management
        self.online = False
        self.mock_mode = False
        self.last_error: Optional[str] = None
        self.last_updated_at = datetime.now(timezone.utc)

        # Baseline state vs Active Override state
        self._baseline_state: str = "off"
        self._override_state: Optional[str] = None
        self._override_expires_at: float = 0.0
        self._override_priority: int = PRIORITY_BASELINE

        # Saved state stack for restoring pre-snapshot override state
        self._saved_override_state: Optional[str] = None
        self._saved_override_expires_at: float = 0.0
        self._saved_override_priority: int = PRIORITY_BASELINE

        # Worker thread
        self._driver: Optional[BaseRGBDriver] = None
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

        self._init_driver()

    def _init_driver(self):
        try:
            self._driver = HardwareRGBDriver(gpio_pin=self.gpio_pin, pixel_count=self.pixel_count)
            self.online = True
            self.mock_mode = False
            logger.info(f"[RGB SERVICE] Hardware driver initialized on GPIO{self.gpio_pin}.")
        except Exception as e:
            self.online = True
            self.mock_mode = True
            self.last_error = f"Hardware unavailable, using mock mode: {e}"
            self._driver = MockRGBDriver(pixel_count=self.pixel_count)
            logger.info(f"[RGB SERVICE] Hardware driver unavailable ({e}). Operating in mock mode.")

    def start(self):
        with self._lock:
            self._stop_event.clear()
            if self._worker_thread is None or not self._worker_thread.is_alive():
                self._worker_thread = threading.Thread(target=self._animation_loop, daemon=True)
                self._worker_thread.start()
                logger.info("[RGB SERVICE] Background worker thread started.")
        # Trigger boot animation on startup
        self.trigger_boot_animation()

    def stop(self):
        self._stop_event.set()
        if self._worker_thread is not None:
            self._worker_thread.join(timeout=2.0)
            self._worker_thread = None

        with self._lock:
            self._baseline_state = "off"
            self._override_state = None
            self._override_expires_at = 0.0
            self._override_priority = PRIORITY_BASELINE
            self._saved_override_state = None
            if self._driver:
                try:
                    self._driver.close()
                except Exception as e:
                    logger.error(f"[RGB SERVICE] Error closing driver: {e}")
            logger.info("[RGB SERVICE] Service stopped cleanly and pixels turned off.")

    def get_current_state(self) -> str:
        with self._lock:
            return self._get_active_state_unlocked()

    def set_state(self, state: str) -> None:
        if state not in VALID_STATES:
            raise ValueError(f"Invalid state '{state}'. Valid states: {sorted(list(VALID_STATES))}")

        with self._lock:
            self.last_updated_at = datetime.now(timezone.utc)
            if state == "snapshot":
                self._apply_override("snapshot", duration=0.2, priority=PRIORITY_SNAPSHOT)
            elif state == "boot":
                self._apply_override("boot", duration=2.0, priority=PRIORITY_BOOT)
            elif state == "motion_detected":
                self._apply_override("motion_detected", duration=3.0, priority=PRIORITY_MOTION)
            else:
                # Explicit baseline state change clears active transient overrides
                self._baseline_state = state
                self._override_state = None
                self._override_expires_at = 0.0
                self._override_priority = PRIORITY_BASELINE
                self._saved_override_state = None
                logger.info(f"[RGB SERVICE] Baseline state set to '{state}'. Active overrides cleared.")

    def _apply_override(self, state: str, duration: float, priority: int):
        now = time.time()

        if state == "snapshot":
            # Save active override if valid and unexpired before snapshot
            if self._override_state is not None and self._override_state != "snapshot" and now < self._override_expires_at:
                self._saved_override_state = self._override_state
                self._saved_override_expires_at = self._override_expires_at
                self._saved_override_priority = self._override_priority
            else:
                self._saved_override_state = None

            self._override_state = "snapshot"
            self._override_expires_at = now + duration
            self._override_priority = priority
            logger.info(f"[RGB SERVICE] Triggered temporary snapshot white flash ({duration}s).")
            return

        if self._override_state is None or now >= self._override_expires_at or priority >= self._override_priority:
            self._override_state = state
            self._override_expires_at = now + duration
            self._override_priority = priority
            logger.info(f"[RGB SERVICE] Triggered temporary override '{state}' for {duration}s (priority {priority}).")

    def trigger_boot_animation(self):
        with self._lock:
            self._baseline_state = "healthy"
            self._apply_override("boot", duration=2.0, priority=PRIORITY_BOOT)

    def trigger_motion_detected(self):
        with self._lock:
            self._apply_override("motion_detected", duration=3.0, priority=PRIORITY_MOTION)

    def trigger_snapshot_flash(self):
        with self._lock:
            self._apply_override("snapshot", duration=0.2, priority=PRIORITY_SNAPSHOT)

    def set_error_state(self, error_msg: Optional[str] = None):
        with self._lock:
            if error_msg:
                self.last_error = error_msg
            self.last_updated_at = datetime.now(timezone.utc)
            self._baseline_state = "error"
            self._override_state = None
            self._override_expires_at = 0.0
            self._override_priority = PRIORITY_BASELINE
            self._saved_override_state = None
            logger.info(f"[RGB SERVICE] Error state activated: {error_msg or 'Hardware error'}")

    def turn_off(self):
        self.set_state("off")

    def get_status(self) -> RGBStatus:
        with self._lock:
            current_st = self._get_active_state_unlocked()
            return RGBStatus(
                online=self.online,
                mock_mode=self.mock_mode,
                gpio_pin=self.gpio_pin,
                pixel_count=self.pixel_count,
                current_state=current_st,
                brightness=self.brightness,
                last_error=self.last_error,
                last_updated_at=self.last_updated_at,
            )

    def _get_active_state_unlocked(self) -> str:
        now = time.time()
        if self._override_state is not None:
            if now < self._override_expires_at:
                return self._override_state
            else:
                expired_state = self._override_state
                self._override_state = None
                self._override_expires_at = 0.0
                self._override_priority = PRIORITY_BASELINE

                # Restore saved override if it was snapshot and saved override hasn't expired
                if expired_state == "snapshot" and self._saved_override_state is not None:
                    if now < self._saved_override_expires_at:
                        self._override_state = self._saved_override_state
                        self._override_expires_at = self._saved_override_expires_at
                        self._override_priority = self._saved_override_priority
                        self._saved_override_state = None
                        logger.info(f"[RGB SERVICE] Snapshot override ended, restored prior override '{self._override_state}'.")
                        return self._override_state
                    self._saved_override_state = None

                if expired_state == "boot":
                    self._baseline_state = "healthy"
                    logger.info("[RGB SERVICE] Boot animation complete, transitioning baseline to healthy.")
                else:
                    logger.info(f"[RGB SERVICE] Override '{expired_state}' ended, restored baseline '{self._baseline_state}'.")

        return self._baseline_state

    def _animation_loop(self):
        frame_idx = 0
        fps = 20
        frame_time = 1.0 / fps

        while not self._stop_event.is_set():
            start_t = time.time()

            with self._lock:
                state = self._get_active_state_unlocked()
                b_factor = self.brightness
                driver = self._driver

            if driver is not None:
                try:
                    self._render_frame(driver, state, frame_idx, b_factor)
                except Exception as e:
                    logger.error(f"[RGB SERVICE] Rendering error: {e}")

            frame_idx += 1
            elapsed = time.time() - start_t
            sleep_t = max(0.005, frame_time - elapsed)
            time.sleep(sleep_t)

    def _render_frame(self, driver: BaseRGBDriver, state: str, frame_idx: int, brightness: float):
        n = self.pixel_count

        def scale(r: int, g: int, b: int) -> Tuple[int, int, int]:
            return (
                max(0, min(255, int(r * brightness))),
                max(0, min(255, int(g * brightness))),
                max(0, min(255, int(b * brightness))),
            )

        if state == "boot":
            driver.clear()
            head = frame_idx % n
            trail = (head - 1) % n
            head_rgb = scale(0, 100, 255)
            trail_rgb = scale(0, 20, 100)
            driver.set_pixel(head, *head_rgb)
            driver.set_pixel(trail, *trail_rgb)
            driver.show()

        elif state == "healthy":
            rgb = scale(0, 255, 0)
            for i in range(n):
                driver.set_pixel(i, *rgb)
            driver.show()

        elif state == "gps_searching":
            pulse = (math.sin(frame_idx * 0.15) + 1.0) / 2.0
            blue_val = int(40 + pulse * 215)
            rgb = scale(0, 0, blue_val)
            for i in range(n):
                driver.set_pixel(i, *rgb)
            driver.show()

        elif state == "motion_detected":
            pulse = (math.sin(frame_idx * 0.4) + 1.0) / 2.0
            red_val = int(50 + pulse * 205)
            rgb = scale(red_val, 0, 0)
            for i in range(n):
                driver.set_pixel(i, *rgb)
            driver.show()

        elif state == "snapshot":
            rgb = scale(255, 255, 255)
            for i in range(n):
                driver.set_pixel(i, *rgb)
            driver.show()

        elif state == "error":
            rgb = scale(255, 0, 0)
            for i in range(n):
                driver.set_pixel(i, *rgb)
            driver.show()

        elif state == "off":
            driver.clear()


_rgb_service: Optional[RGBService] = None


def get_rgb_service() -> RGBService:
    global _rgb_service
    if _rgb_service is None:
        _rgb_service = RGBService()
    return _rgb_service


def start_rgb_service():
    service = get_rgb_service()
    service.start()


def stop_rgb_service():
    service = get_rgb_service()
    service.stop()
