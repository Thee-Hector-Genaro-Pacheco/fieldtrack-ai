import os
import time
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from main import app
from models import Telemetry, DeviceHealth
from gps_reader import (
    GPSState,
    calculate_nmea_checksum,
    get_gps_state,
    get_telemetry,
)


def make_sentence(body: str) -> str:
    return f"${body}*{calculate_nmea_checksum(body)}"


def test_calculate_nmea_checksum():
    assert calculate_nmea_checksum("GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,") == "47"
    assert calculate_nmea_checksum("GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W") == "6A"


def test_gps_state_initial_state():
    state = GPSState(mode="mock")
    assert state.fix is False
    assert state.latitude is None
    assert state.longitude is None
    assert state.altitude_meters is None
    assert state.satellites_used is None
    assert state.satellites_in_view is None
    assert state.hdop is None
    assert state.speed_kph is None
    assert state.sentences_received == 0
    assert state.sentences_parsed == 0
    assert state.parse_errors == 0


def test_parse_gga():
    state = GPSState(mode="mock")
    # GGA sentence: fix status 1 (GPS fix), 8 satellites, 0.9 HDOP, 545.4 meters altitude
    # 4807.038 N -> 48 + 7.038/60 = 48.1173
    # 01131.000 E -> 11 + 31.000/60 = 11.51666667
    sentence = make_sentence("GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,")
    success = state.update_from_nmea(sentence)
    
    assert success is True
    assert state.fix is True
    assert pytest.approx(state.latitude, 0.0001) == 48.1173
    assert pytest.approx(state.longitude, 0.0001) == 11.5167
    assert state.altitude_meters == 545.4
    assert state.satellites_used == 8
    assert state.hdop == 0.9
    assert state.timestamp is not None
    assert state.sentences_received == 1
    assert state.sentences_parsed == 1


def test_parse_rmc():
    state = GPSState(mode="mock")
    # RMC sentence: Active (fix), speed 22.4 knots -> 22.4 * 1.852 = 41.4848 kph
    # Date 230394 -> 23 March 1994
    sentence = make_sentence("GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,,,A")
    success = state.update_from_nmea(sentence)
    
    assert success is True
    assert state.fix is True
    assert pytest.approx(state.latitude, 0.0001) == 48.1173
    assert pytest.approx(state.longitude, 0.0001) == 11.5167
    assert pytest.approx(state.speed_kph, 0.01) == 41.4848
    assert state.timestamp == datetime(1994, 3, 23, 12, 35, 19, tzinfo=timezone.utc)


def test_parse_gsa():
    state = GPSState(mode="mock")
    # GSA sentence: fix type 3 (3D fix), HDOP 1.3
    sentence = make_sentence("GPGSA,A,3,04,05,,09,12,,,24,,28,,,2.5,1.3,2.1")
    success = state.update_from_nmea(sentence)
    
    assert success is True
    assert state.fix is True
    assert state.hdop == 1.3


def test_parse_gsv():
    state = GPSState(mode="mock")
    # GSV sentence: 8 satellites in view
    sentence = make_sentence("GPGSV,2,1,08,01,40,083,46,02,17,308,41,12,07,344,39,14,22,228,45")
    success = state.update_from_nmea(sentence)
    
    assert success is True
    assert state.satellites_in_view == 8


def test_parse_gll():
    state = GPSState(mode="mock")
    # GLL sentence: active status, latitude 4916.45 N -> 49 + 16.45/60 = 49.274167, longitude 12311.12 W -> -123.18533
    sentence = make_sentence("GPGLL,4916.45,N,12311.12,W,225444,A,A")
    success = state.update_from_nmea(sentence)
    
    assert success is True
    assert state.fix is True
    assert pytest.approx(state.latitude, 0.0001) == 49.274167
    assert pytest.approx(state.longitude, 0.0001) == -123.18533


def test_parse_vtg():
    state = GPSState(mode="mock")
    # VTG sentence: speed 10.2 km/h
    sentence = make_sentence("GPVTG,054.7,T,034.4,M,005.5,N,010.2,K,A")
    success = state.update_from_nmea(sentence)
    
    assert success is True
    assert state.speed_kph == 10.2


def test_satellites_tracking_remain_separate():
    state = GPSState(mode="mock")
    
    # GGA updates satellites_used
    gga_sentence = make_sentence("GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,")
    state.update_from_nmea(gga_sentence)
    assert state.satellites_used == 8
    assert state.satellites_in_view is None
    
    # GSV updates satellites_in_view
    gsv_sentence = make_sentence("GPGSV,2,1,11,01,40,083,46,02,17,308,41,12,07,344,39,14,22,228,45")
    state.update_from_nmea(gsv_sentence)
    assert state.satellites_used == 8
    assert state.satellites_in_view == 11


def test_stale_telemetry_detection():
    state = GPSState(mode="mock")
    
    # Send valid sentence to make it healthy initially
    sentence = make_sentence("GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,")
    state.update_from_nmea(sentence)
    
    # Initial check (not stale)
    tel = state.get_telemetry_snapshot(public_demo_mode=False, stale_after_seconds=5)
    assert tel.device_health.status == "healthy"
    assert tel.fix is True
    
    # Manipulate state to simulate time passing (mock last_sentence_at to 6 seconds ago)
    state.last_sentence_at = datetime.now(timezone.utc) - timedelta(seconds=6)
    
    # Snapshot check (stale)
    tel_stale = state.get_telemetry_snapshot(public_demo_mode=False, stale_after_seconds=5)
    assert tel_stale.device_health.status == "degraded"
    assert tel_stale.fix is False  # Fix gets cleared if data is stale
    assert tel_stale.device_health.data_age_seconds is not None
    assert tel_stale.device_health.data_age_seconds > 5


def test_coordinate_privacy():
    state = GPSState(mode="mock")
    sentence = make_sentence("GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,")
    state.update_from_nmea(sentence)
    
    lat_orig = state.latitude
    lon_orig = state.longitude
    
    # Get telemetry under public demo mode
    tel1 = state.get_telemetry_snapshot(public_demo_mode=True, stale_after_seconds=5)
    assert tel1.latitude != lat_orig
    assert tel1.longitude != lon_orig
    
    # Successive calls must return EXACTLY the same coordinates (proving it's stable and not changing randomly per request)
    tel2 = state.get_telemetry_snapshot(public_demo_mode=True, stale_after_seconds=5)
    assert tel1.latitude == tel2.latitude
    assert tel1.longitude == tel2.longitude
    
    # Check that they have at most 4 decimal places
    lat = tel1.latitude
    lon = tel1.longitude
    assert lat is not None
    assert lon is not None
    assert round(lat, 4) == lat
    assert round(lon, 4) == lon


@patch('serial.Serial')
def test_serial_reconnect_backoff(mock_serial_cls):
    # Setup mock serial instance
    mock_serial = MagicMock()
    mock_serial_cls.return_value = mock_serial
    
    # Make Serial constructor raise an exception on first call, then succeed on second call
    mock_serial_cls.side_effect = [
        Exception("Port busy or not found"),
        mock_serial
    ]
    
    # Configure serial readline to return empty/None to exit the inner loop immediately
    mock_serial.readline.return_value = b""
    
    state = GPSState(mode="hardware")
    stop_event = MagicMock()
    
    # We want stop_event to be True on the second loop iteration to exit serial_reader_loop
    # is_set() returns False first time, True second time
    stop_event.is_set.side_effect = [False, False, True, True]
    
    # Run loop (with patched time.sleep to avoid actual delays)
    from gps_reader import serial_reader_loop
    with patch('time.sleep') as mock_sleep:
        serial_reader_loop(state, stop_event)
        
        # Verify reconnect attempts incremented
        assert state.reconnect_attempts >= 1
        assert state.last_error is not None
        assert "Port busy or not found" in state.last_error
        # The serial port should not crash the app, but log and retry
        assert mock_sleep.called


def test_api_endpoints():
    # Use TestClient with startup/shutdown context manager
    with TestClient(app) as client:
        # 1. Test GET /health
        res_health = client.get("/health")
        assert res_health.status_code == 200
        data_health = res_health.json()
        assert "status" in data_health
        assert "timestamp" in data_health
        assert "gps_mode" in data_health
        assert "serial_connected" in data_health
        
        # 2. Test GET /telemetry/current
        res_tel_curr = client.get("/telemetry/current")
        assert res_tel_curr.status_code == 200
        data_tel_curr = res_tel_curr.json()
        assert "fix" in data_tel_curr
        assert "source" in data_tel_curr
        assert "device_health" in data_tel_curr
        
        # 3. Test GET /telemetry (legacy alias)
        res_tel = client.get("/telemetry")
        assert res_tel.status_code == 200
        data_tel = res_tel.json()
        
        # Remove dynamically changing float fields before comparing
        for d in [data_tel_curr, data_tel]:
            d["device_health"].pop("uptime_seconds", None)
            d["device_health"].pop("data_age_seconds", None)
            
        assert data_tel == data_tel_curr

