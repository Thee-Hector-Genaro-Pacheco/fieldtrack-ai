import time
import pytest
from unittest.mock import MagicMock, patch
from lcd_service import LCDService, get_lcd_service, start_lcd_service, stop_lcd_service


def test_lcd_init_and_mock_mode():
    service = LCDService()
    assert hasattr(service, "hardware_present")
    assert service.enabled is True


def test_create_scroll_frames():
    # Short text (<= 16 chars)
    short_text = "EDGE TELEMETRY"
    frames = LCDService._create_scroll_frames(short_text)
    assert len(frames) == 1
    assert frames[0] == "EDGE TELEMETRY  "

    # Long text (> 16 chars)
    long_text = "Built in the Field"
    frames_long = LCDService._create_scroll_frames(long_text)
    assert len(frames_long) > 1
    for frame in frames_long:
        assert len(frame) == 16


def test_double_buffering_cache():
    service = LCDService()
    service._render("FIELDTRACK AI", "EDGE TELEMETRY")
    assert service._last_rendered_line1 == "FIELDTRACK AI   "
    assert service._last_rendered_line2 == "EDGE TELEMETRY  "

    # Repeat render should hit cache
    with patch.object(service, "_write_string_to_lcd") as mock_write:
        service._render("FIELDTRACK AI", "EDGE TELEMETRY")
        mock_write.assert_not_called()


def test_priority_override():
    service = LCDService()
    service.notify_motion("12:34:56")
    assert service._override_line1 == "MOTION DETECTED"
    assert service._override_line2 == "12:34:56"
    assert service._override_expires_at > time.time()

    service.notify_snapshot("12:35:00")
    assert service._override_line1 == "SNAPSHOT SAVED"
    assert service._override_line2 == "12:35:00"


def test_write_nibble_and_lcd_byte():
    service = LCDService()
    service.hardware_present = True
    service._bus = MagicMock()

    service._write_nibble(0x30, 0)
    assert service._bus.write_byte.call_count == 3  # byte, byte|enable, byte&~enable

    service._bus.reset_mock()
    service._lcd_byte(0x28, 0)
    assert service._bus.write_byte.call_count == 6  # 2 nibbles x 3 calls


def test_i2c_error_resilience():
    service = LCDService()
    service.hardware_present = True
    service._bus = MagicMock()
    service._bus.write_byte.side_effect = OSError("I2C bus error")

    # Should catch exception and set hardware_present to False without crashing
    service._lcd_byte(0x01, 0)
    assert service.hardware_present is False


def test_start_and_stop_lcd_service():
    service = get_lcd_service()
    start_lcd_service()
    assert service._worker_thread is not None
    assert service._worker_thread.is_alive()
    stop_lcd_service()
    assert service._stop_event.is_set()
