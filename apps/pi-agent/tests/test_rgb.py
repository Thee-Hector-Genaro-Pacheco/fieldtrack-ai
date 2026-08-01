import time
import pytest
from fastapi.testclient import TestClient

from main import app
from rgb_service import (
    RGBService,
    MockRGBDriver,
    get_rgb_service,
    start_rgb_service,
    stop_rgb_service,
    VALID_STATES,
)
from motion_service import get_motion_service
from camera_service import get_camera_service


@pytest.fixture(autouse=True)
def cleanup_rgb():
    """Ensure RGB service is clean before and after each test."""
    service = get_rgb_service()
    service.turn_off()
    yield
    service.turn_off()


def test_rgb_service_mock_mode_initialization():
    service = RGBService()
    assert service.online is True
    assert service.mock_mode is True
    assert service.gpio_pin == 18
    assert service.pixel_count == 8
    assert service.brightness <= 0.2
    assert isinstance(service._driver, MockRGBDriver)


def test_rgb_state_transitions():
    service = RGBService()

    service.set_state("healthy")
    assert service.get_current_state() == "healthy"

    service.set_state("gps_searching")
    assert service.get_current_state() == "gps_searching"

    service.set_state("error")
    assert service.get_current_state() == "error"

    service.set_state("off")
    assert service.get_current_state() == "off"


def test_rgb_invalid_state_handling():
    service = RGBService()
    with pytest.raises(ValueError) as excinfo:
        service.set_state("super_rainbow")
    assert "Invalid state 'super_rainbow'" in str(excinfo.value)


def test_snapshot_override_restores_previous_state():
    service = RGBService()
    service.set_state("gps_searching")
    assert service.get_current_state() == "gps_searching"

    # Trigger snapshot white flash override
    service.trigger_snapshot_flash()
    assert service.get_current_state() == "snapshot"

    # Wait for snapshot override (0.2s) to expire
    time.sleep(0.25)
    assert service.get_current_state() == "gps_searching"


def test_animation_priority_overrides():
    service = RGBService()
    service.set_state("healthy")
    assert service.get_current_state() == "healthy"

    # Motion detected (Priority 80) overrides healthy (Priority 0)
    service.trigger_motion_detected()
    assert service.get_current_state() == "motion_detected"

    # Snapshot (Priority 100) overrides motion_detected (Priority 80)
    service.trigger_snapshot_flash()
    assert service.get_current_state() == "snapshot"

    # After snapshot expires, it returns to active motion_detected
    time.sleep(0.25)
    assert service.get_current_state() == "motion_detected"


def test_start_stop_lifecycle():
    service = get_rgb_service()
    start_rgb_service()
    assert service._worker_thread is not None
    assert service._worker_thread.is_alive()

    stop_rgb_service()
    assert service._worker_thread is None
    assert service.get_current_state() == "off"


def test_motion_event_integration_without_hardware():
    rgb = get_rgb_service()
    rgb.set_state("healthy")
    assert rgb.get_current_state() == "healthy"

    motion = get_motion_service()
    motion.simulate_motion_event()

    # Triggering motion event must set RGB to motion_detected
    assert rgb.get_current_state() == "motion_detected"


def test_fastapi_rgb_endpoints():
    client = TestClient(app)

    # 1. GET /rgb/status
    res = client.get("/rgb/status")
    assert res.status_code == 200
    data = res.json()
    assert data["online"] is True
    assert data["mock_mode"] is True
    assert data["gpio_pin"] == 18
    assert data["pixel_count"] == 8
    assert "current_state" in data
    assert "brightness" in data

    # 2. POST /rgb/state/{state}
    res = client.post("/rgb/state/gps_searching")
    assert res.status_code == 200
    assert res.json()["current_state"] == "gps_searching"

    # 3. POST /rgb/state/invalid_state
    res = client.post("/rgb/state/invalid_state")
    assert res.status_code == 400
    assert "Invalid state" in res.json()["detail"]

    # 4. POST /rgb/test
    res = client.post("/rgb/test")
    assert res.status_code == 200
    assert res.json()["current_state"] == "motion_detected"

    # 5. POST /rgb/off
    res = client.post("/rgb/off")
    assert res.status_code == 200
    assert res.json()["current_state"] == "off"


def test_fastapi_health_endpoint_includes_rgb():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert "rgb_online" in data
    assert "rgb_state" in data
