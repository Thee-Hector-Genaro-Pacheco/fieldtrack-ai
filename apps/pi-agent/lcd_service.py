import time
import threading
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple, List

logger = logging.getLogger("pi-agent")

# PCF8574 I2C Backpack HD44780 Constants
LCD_BACKLIGHT = 0x08
ENABLE = 0x04
COMMAND = 0
DATA = 1

LCD_LINE_1 = 0x80
LCD_LINE_2 = 0xC0


class LCDService:
    def __init__(self):
        self._lock = threading.Lock()
        self.enabled = True
        self.i2c_bus = 1
        self.i2c_addr = 0x27
        self.hardware_present = False
        self._bus = None

        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

        # Double-buffering render cache to eliminate flicker & duplicate I2C traffic
        self._last_rendered_line1 = ""
        self._last_rendered_line2 = ""

        # Priority alert override state
        self._override_line1: Optional[str] = None
        self._override_line2: Optional[str] = None
        self._override_expires_at: float = 0.0

        self._init_hardware()

    def _init_hardware(self):
        try:
            import smbus2  # type: ignore
            self._bus = smbus2.SMBus(self.i2c_bus)
            
            # Scan bus 1 for address 0x27 first, fallback to 0x3F
            detected_addr = None
            for addr in (0x27, 0x3F):
                try:
                    # Write dummy test byte to verify device response
                    self._bus.write_byte(addr, LCD_BACKLIGHT)
                    detected_addr = addr
                    break
                except Exception:
                    continue

            if detected_addr is not None:
                self.i2c_addr = detected_addr
                self.hardware_present = True
                logger.info(f"[LCD SERVICE] LCD hardware opened at bus {self.i2c_bus} address {hex(self.i2c_addr)}")
                self._init_hd44780_display()
            else:
                self.hardware_present = False
                logger.info(f"[LCD SERVICE] I2C LCD hardware not detected on bus {self.i2c_bus} (0x27/0x3F). Operating in mock mode.")
        except Exception as e:
            self.hardware_present = False
            logger.info(f"[LCD SERVICE] I2C bus initialization error ({e}). Operating in mock/logging mode.")

    def _write_nibble(self, nibble: int, mode: int):
        if not self.hardware_present or self._bus is None:
            return

        try:
            # Send upper 4 bits + RS (mode) + Backlight ON (0x08)
            byte_val = (nibble & 0xF0) | mode | LCD_BACKLIGHT
            self._bus.write_byte(self.i2c_addr, byte_val)
            self._bus.write_byte(self.i2c_addr, byte_val | ENABLE)
            time.sleep(0.0005)
            self._bus.write_byte(self.i2c_addr, byte_val & ~ENABLE)
            time.sleep(0.0005)
        except Exception as e:
            logger.error(f"[LCD SERVICE] Hardware nibble write error on address {hex(self.i2c_addr)}: {e}")
            self.hardware_present = False

    def _lcd_byte(self, bits: int, mode: int):
        if not self.hardware_present or self._bus is None:
            return

        try:
            high_nibble = bits & 0xF0
            low_nibble = (bits << 4) & 0xF0
            self._write_nibble(high_nibble, mode)
            self._write_nibble(low_nibble, mode)
        except Exception as e:
            logger.error(f"[LCD SERVICE] Hardware byte write error on address {hex(self.i2c_addr)}: {e}")
            self.hardware_present = False

    def _init_hd44780_display(self):
        try:
            time.sleep(0.05)  # Wait > 40ms for LCD power stabilization

            # 1. Force 8-bit mode 3 times to reset controller state machine
            self._write_nibble(0x30, COMMAND)
            time.sleep(0.0045)
            self._write_nibble(0x30, COMMAND)
            time.sleep(0.0045)
            self._write_nibble(0x30, COMMAND)
            time.sleep(0.0002)

            # 2. Select 4-bit interface mode
            self._write_nibble(0x20, COMMAND)
            time.sleep(0.0002)

            # 3. Configure HD44780 display parameters
            self._lcd_byte(0x28, COMMAND)  # Function set: 2 lines, 5x8 font
            self._lcd_byte(0x0C, COMMAND)  # Display ON, Cursor OFF, Blink OFF
            self._lcd_byte(0x01, COMMAND)  # Clear display
            time.sleep(0.002)
            self._lcd_byte(0x06, COMMAND)  # Entry mode set: Increment cursor

            # Render initial boot screen
            self._write_string_to_lcd("FIELDTRACK AI   ", "EDGE TELEMETRY  ")
            logger.info("[LCD SERVICE] Initial screen written to LCD")
        except Exception as e:
            logger.error(f"[LCD SERVICE] Failed to initialize HD44780 display: {e}")
            self.hardware_present = False

    def _write_string_to_lcd(self, line1_16: str, line2_16: str):
        if not self.hardware_present:
            return

        try:
            # Line 1 cursor position
            self._lcd_byte(LCD_LINE_1, COMMAND)
            for char in line1_16:
                self._lcd_byte(ord(char), DATA)

            # Line 2 cursor position
            self._lcd_byte(LCD_LINE_2, COMMAND)
            for char in line2_16:
                self._lcd_byte(ord(char), DATA)
        except Exception as e:
            logger.error(f"[LCD SERVICE] Hardware string write error: {e}")
            self.hardware_present = False

    def _render(self, line1: str, line2: str):
        line1_padded = line1.ljust(16)[:16]
        line2_padded = line2.ljust(16)[:16]

        # Double-buffering check: skip duplicate writes to avoid flicker & I2C bus congestion
        if line1_padded == self._last_rendered_line1 and line2_padded == self._last_rendered_line2:
            return

        self._last_rendered_line1 = line1_padded
        self._last_rendered_line2 = line2_padded

        if self.hardware_present:
            self._write_string_to_lcd(line1_padded, line2_padded)

    def start(self):
        self._stop_event.clear()
        self._worker_thread = threading.Thread(target=self._display_loop, daemon=True)
        self._worker_thread.start()
        logger.info("[LCD SERVICE] LCD worker thread started")

    def stop(self):
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=2.0)
        
        if self.hardware_present and self._bus is not None:
            try:
                self._lcd_byte(0x01, COMMAND)  # Clear display
                self._bus.write_byte(self.i2c_addr, 0x00)  # Turn off backlight
            except Exception:
                pass
        logger.info("[LCD SERVICE] LCD service stopped cleanly.")

    def notify_motion(self, time_str: Optional[str] = None):
        with self._lock:
            now_str = time_str or datetime.now(timezone.utc).strftime("%H:%M:%S")
            self._override_line1 = "MOTION DETECTED"
            self._override_line2 = now_str
            self._override_expires_at = time.time() + 2.0
        logger.info(f"[LCD NOTIFY] MOTION DETECTED | {now_str}")

    def notify_snapshot(self, time_str: Optional[str] = None):
        with self._lock:
            now_str = time_str or datetime.now(timezone.utc).strftime("%H:%M:%S")
            self._override_line1 = "SNAPSHOT SAVED"
            self._override_line2 = now_str
            self._override_expires_at = time.time() + 2.0
        logger.info(f"[LCD NOTIFY] SNAPSHOT SAVED | {now_str}")

    @staticmethod
    def _create_scroll_frames(text: str) -> List[str]:
        if len(text) <= 16:
            return [text.ljust(16)]

        padded = text + "    "
        frames = []
        for i in range(len(padded)):
            window = (padded[i:] + padded[:i])[:16]
            frames.append(window)
        return frames

    def _fetch_screen4_telemetry(self) -> Tuple[str, str]:
        line1 = "CAMERA: OFFLINE"
        line2 = "GPS: NO FIX"
        try:
            from camera_service import get_camera_service
            cam = get_camera_service().get_status()
            line1 = f"CAMERA: {'ONLINE' if cam.online else 'OFFLINE'}"
        except Exception:
            pass

        try:
            from gps_reader import get_telemetry
            tel = get_telemetry()
            if tel.fix and tel.satellites_used is not None:
                line2 = f"GPS: {tel.satellites_used} SATS"
            elif tel.satellites_used is not None and tel.satellites_used > 0:
                line2 = f"GPS: {tel.satellites_used} SATS"
            else:
                line2 = "GPS: NO FIX"
        except Exception:
            pass

        return line1, line2

    def _fetch_screen5_telemetry(self) -> Tuple[str, str]:
        line1 = "MOTION: CLEAR"
        line2 = "CPU: N/A"
        try:
            from motion_service import get_motion_service
            motion = get_motion_service().get_status()
            line1 = f"MOTION: {motion.current_state.upper()}"
        except Exception:
            pass

        try:
            from gps_reader import get_telemetry
            tel = get_telemetry()
            if tel.device_health.cpu_temperature_c is not None:
                line2 = f"CPU: {tel.device_health.cpu_temperature_c:.1f} C"
        except Exception:
            pass

        return line1, line2

    def _display_loop(self):
        screen_index = 0
        tick = 0

        while not self._stop_event.is_set():
            now = time.time()

            # 1. Check for priority alert override
            with self._lock:
                has_override = self._override_line1 is not None and now < self._override_expires_at
                override_l1 = self._override_line1
                override_l2 = self._override_line2

            if has_override and override_l1 is not None:
                self._render(override_l1, override_l2 or "")
                time.sleep(0.2)
                continue

            # Clear override when expired
            with self._lock:
                if self._override_expires_at > 0 and now >= self._override_expires_at:
                    self._override_line1 = None
                    self._override_line2 = None
                    self._override_expires_at = 0.0

            # 2. Continuous Idle Rotation Screens
            if screen_index == 0:
                # Screen 1: Static "FIELDTRACK AI" / "EDGE TELEMETRY" (Hold ~2.0s -> 10 ticks x 0.2s)
                self._render("FIELDTRACK AI", "EDGE TELEMETRY")
                tick += 1
                if tick >= 10:
                    screen_index = 1
                    tick = 0

            elif screen_index == 1:
                # Screen 2: Marquee scroll "Built in the Field"
                text = "Built in the Field"
                frames = self._create_scroll_frames(text)
                frame_idx = tick % len(frames)
                self._render("FIELDTRACK AI", frames[frame_idx])
                tick += 1
                if tick >= len(frames) + 5:  # Scroll once + brief pause
                    screen_index = 2
                    tick = 0

            elif screen_index == 2:
                # Screen 3: Marquee scroll "Engineered in Software"
                text = "Engineered in Software"
                frames = self._create_scroll_frames(text)
                frame_idx = tick % len(frames)
                self._render("FIELDTRACK AI", frames[frame_idx])
                tick += 1
                if tick >= len(frames) + 5:  # Scroll once + brief pause
                    screen_index = 3
                    tick = 0

            elif screen_index == 3:
                # Screen 4: CAMERA & GPS telemetry (Hold ~2.0s -> 10 ticks x 0.2s)
                l1, l2 = self._fetch_screen4_telemetry()
                self._render(l1, l2)
                tick += 1
                if tick >= 10:
                    screen_index = 4
                    tick = 0

            elif screen_index == 4:
                # Screen 5: MOTION & CPU temp telemetry (Hold ~2.0s -> 10 ticks x 0.2s)
                l1, l2 = self._fetch_screen5_telemetry()
                self._render(l1, l2)
                tick += 1
                if tick >= 10:
                    screen_index = 0
                    tick = 0

            time.sleep(0.2)


_lcd_service: Optional[LCDService] = None


def get_lcd_service() -> LCDService:
    global _lcd_service
    if _lcd_service is None:
        _lcd_service = LCDService()
    return _lcd_service


def start_lcd_service():
    service = get_lcd_service()
    service.start()


def stop_lcd_service():
    service = get_lcd_service()
    service.stop()
