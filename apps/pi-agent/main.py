import logging
import os
import asyncio
from typing import Any, List
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse

from gps_reader import get_telemetry, start_gps_reader, stop_gps_reader
from camera_service import (
    get_camera_service,
    start_camera_service,
    stop_camera_service,
)
from lcd_service import start_lcd_service, stop_lcd_service
from motion_service import (
    get_motion_service,
    start_motion_service,
    stop_motion_service,
)
from rgb_service import (
    get_rgb_service,
    start_rgb_service,
    stop_rgb_service,
)
from models import Telemetry, CameraStatus, SnapshotResponse, MotionStatus, MotionEvent, RGBStatus

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("pi-agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup lifecycle
    logger.info("Initializing GPS telemetry background service...")
    start_gps_reader()
    logger.info("Initializing Live Camera service...")
    start_camera_service()
    logger.info("Initializing LCD service...")
    start_lcd_service()
    logger.info("Initializing PIR Motion Sensor service...")
    start_motion_service()
    logger.info("Initializing RGB LED service...")
    start_rgb_service()
    yield
    # Shutdown lifecycle
    logger.info("Shutting down RGB LED service...")
    stop_rgb_service()
    logger.info("Shutting down PIR Motion Sensor service...")
    stop_motion_service()
    logger.info("Shutting down LCD service...")
    stop_lcd_service()
    logger.info("Shutting down Live Camera service...")
    stop_camera_service()
    logger.info("Shutting down GPS telemetry background service...")
    stop_gps_reader()


app = FastAPI(
    title="FieldTrack AI Pi Agent",
    version="0.1.0",
    description="GPS telemetry, live camera, PIR motion, and industrial controls edge service.",
    lifespan=lifespan,
)

# Configure CORS middleware to support local frontend connections
cors_origins_raw = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "FieldTrack AI Pi Agent",
        "status": "online",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    tel = get_telemetry()
    cam_status = get_camera_service().get_status()
    motion_status = get_motion_service().get_status()
    rgb_status = get_rgb_service().get_status()
    return {
        "status": tel.device_health.status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps_mode": tel.device_health.gps_mode,
        "serial_connected": tel.device_health.serial_connected,
        "camera_online": cam_status.online,
        "motion_online": motion_status.online,
        "motion_state": motion_status.current_state,
        "rgb_online": rgb_status.online,
        "rgb_state": rgb_status.current_state,
    }


@app.get("/telemetry/current", response_model=Telemetry)
def telemetry_current() -> Telemetry:
    return get_telemetry()


@app.get("/telemetry", response_model=Telemetry)
def telemetry_legacy() -> Telemetry:
    return get_telemetry()


# Camera Routes

@app.get("/camera/status", response_model=CameraStatus)
def camera_status() -> CameraStatus:
    return get_camera_service().get_status()


async def generate_mjpeg_stream():
    camera = get_camera_service()
    while True:
        try:
            frame_bytes = camera.get_current_frame()
            if frame_bytes is not None:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame_bytes)).encode("ascii") + b"\r\n\r\n" +
                    frame_bytes +
                    b"\r\n"
                )
            await asyncio.sleep(0.033)  # ~30 FPS stream yield interval
        except (asyncio.CancelledError, GeneratorExit):
            break
        except Exception:
            await asyncio.sleep(0.1)


@app.get("/camera/stream")
def camera_stream():
    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, pre-check=0, post-check=0, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.post("/camera/snapshot", response_model=SnapshotResponse)
def camera_snapshot() -> SnapshotResponse:
    try:
        return get_camera_service().capture_snapshot()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/camera/snapshots/{filename}")
def get_camera_snapshot_file(filename: str):
    clean_filename = os.path.basename(filename)
    if clean_filename != filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid snapshot filename")

    camera = get_camera_service()
    filepath = os.path.abspath(os.path.join(camera.snapshots_dir, clean_filename))
    snapshots_dir_abs = os.path.abspath(camera.snapshots_dir)

    if not filepath.startswith(snapshots_dir_abs):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return FileResponse(filepath, media_type="image/jpeg")


# Motion Routes

@app.get("/motion/status", response_model=MotionStatus)
def motion_status() -> MotionStatus:
    return get_motion_service().get_status()


@app.get("/motion/events", response_model=List[MotionEvent])
def motion_events(
    limit: int = Query(20, ge=1, le=100, description="Maximum number of recent motion events to return")
) -> List[MotionEvent]:
    return get_motion_service().get_events(limit=limit)


@app.post("/motion/test", response_model=MotionEvent)
def motion_test() -> MotionEvent:
    try:
        return get_motion_service().simulate_motion_event()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to trigger test motion event: {e}")


# RGB Routes

@app.get("/rgb/status", response_model=RGBStatus)
def rgb_status() -> RGBStatus:
    return get_rgb_service().get_status()


@app.post("/rgb/state/{state}", response_model=RGBStatus)
def set_rgb_state(state: str) -> RGBStatus:
    try:
        get_rgb_service().set_state(state)
        return get_rgb_service().get_status()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set RGB state: {e}")


@app.post("/rgb/test", response_model=RGBStatus)
def rgb_test() -> RGBStatus:
    try:
        rgb = get_rgb_service()
        rgb.trigger_motion_detected()
        return rgb.get_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to run RGB test: {e}")


@app.post("/rgb/off", response_model=RGBStatus)
def rgb_off() -> RGBStatus:
    rgb = get_rgb_service()
    rgb.turn_off()
    return rgb.get_status()