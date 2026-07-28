import os
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from main import app
from motion_service import MotionService, get_motion_service


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_motion_status_endpoint(client):
    res = client.get("/motion/status")
    assert res.status_code == 200
    data = res.json()
    assert "online" in data
    assert "current_state" in data
    assert "gpio_pin" in data
    assert "auto_snapshot" in data
    assert "total_motion_events" in data


def test_motion_events_endpoint_default(client):
    res = client.get("/motion/events")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_motion_events_limit_validation(client):
    # Invalid limit < 1
    res = client.get("/motion/events?limit=0")
    assert res.status_code == 422

    # Invalid limit > 100
    res2 = client.get("/motion/events?limit=101")
    assert res2.status_code == 422

    # Valid limit
    res3 = client.get("/motion/events?limit=5")
    assert res3.status_code == 200


def test_simulated_motion_test_endpoint(client):
    res = client.post("/motion/test")
    assert res.status_code == 200
    data = res.json()
    assert "id" in data
    assert data["simulated"] is True
    assert data["event_type"] == "simulated_motion"
    assert data["motion_state"] == "motion"

    # Verify event appears in /motion/events
    res_events = client.get("/motion/events?limit=5")
    assert res_events.status_code == 200
    events = res_events.json()
    assert len(events) >= 1
    assert events[0]["id"] == data["id"]


def test_motion_warmup_and_cooldown_logic():
    service = MotionService()
    
    # Warm-up check: immediately after startup, is_warming_up should be True
    service.startup_time = datetime.now(timezone.utc)
    service.warmup_seconds = 30
    assert service._is_warming_up() is True

    # Simulate past startup_time
    service.startup_time = datetime.now(timezone.utc) - timedelta(seconds=35)
    assert service._is_warming_up() is False


def test_bounded_event_history():
    service = MotionService()
    service.event_limit = 5
    service._events_buffer.clear()

    for i in range(10):
        service.simulate_motion_event()

    events = service.get_events(limit=10)
    assert len(events) <= 5
