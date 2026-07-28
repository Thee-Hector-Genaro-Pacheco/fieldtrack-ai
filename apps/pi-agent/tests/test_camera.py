import os
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from main import app
from camera_service import CameraService, get_camera_service


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_camera_status_endpoint(client):
    res = client.get("/camera/status")
    assert res.status_code == 200
    data = res.json()
    assert "online" in data
    assert "device" in data
    assert "resolution" in data
    assert "configured_fps" in data
    assert "pixel_format" in data


def test_camera_stream_endpoint_headers(client):
    async def mock_generator():
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\nfake_bytes\r\n"

    with patch("main.generate_mjpeg_stream", side_effect=mock_generator):
        with client.stream("GET", "/camera/stream") as res:
            assert res.status_code == 200
            assert "multipart/x-mixed-replace; boundary=frame" in res.headers["content-type"]


def test_camera_snapshot_failure_when_offline(client):
    service = get_camera_service()
    with patch.object(service, 'online', False):
        res = client.post("/camera/snapshot")
        assert res.status_code == 400
        assert "detail" in res.json()


def test_camera_snapshot_success(client, tmp_path):
    service = get_camera_service()
    mock_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xd9"
    
    with patch.object(service, 'online', True), \
         patch.object(service, '_latest_jpeg_bytes', mock_jpeg), \
         patch.object(service, '_latest_frame_dimensions', (1280, 720)), \
         patch.object(service, 'snapshots_dir', str(tmp_path)):
        
        res = client.post("/camera/snapshot")
        assert res.status_code == 200
        data = res.json()
        assert "filename" in data
        assert data["width"] == 1280
        assert data["height"] == 720
        assert data["url"].startswith("/camera/snapshots/")
        
        saved_path = tmp_path / data["filename"]
        assert saved_path.exists()
        assert saved_path.read_bytes() == mock_jpeg


def test_snapshot_path_traversal_protection(client):
    # Attempt directory traversal attacks
    res = client.get("/camera/snapshots/../main.py")
    assert res.status_code in (400, 403, 404)

    res2 = client.get("/camera/snapshots/%2e%2e%2fmain.py")
    assert res2.status_code in (400, 403, 404)


def test_snapshot_file_serving(client, tmp_path):
    service = get_camera_service()
    mock_jpeg = b"test_jpeg_bytes"
    test_filename = "snapshot_20260727_220000.jpg"
    test_filepath = tmp_path / test_filename
    test_filepath.write_bytes(mock_jpeg)

    with patch.object(service, 'snapshots_dir', str(tmp_path)):
        res = client.get(f"/camera/snapshots/{test_filename}")
        assert res.status_code == 200
        assert res.content == mock_jpeg
        assert "image/jpeg" in res.headers["content-type"]
