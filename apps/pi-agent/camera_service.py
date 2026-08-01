import os
import time
import cv2
import threading
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple
from collections import deque
from models import CameraStatus, SnapshotResponse

logger = logging.getLogger("pi-agent")

class CameraService:
    def __init__(self):
        self._lock = threading.Lock()
        
        # Configuration
        self.enabled = os.getenv("CAMERA_ENABLED", "true").lower() in ("true", "1", "yes")
        self.device = os.getenv("CAMERA_DEVICE", "/dev/video0")
        self.width = int(os.getenv("CAMERA_WIDTH", "1280"))
        self.height = int(os.getenv("CAMERA_HEIGHT", "720"))
        self.fps = int(os.getenv("CAMERA_FPS", "30"))
        self.pixel_format = os.getenv("CAMERA_PIXEL_FORMAT", "MJPG").upper()
        self.camera_name = os.getenv("CAMERA_NAME", "Logitech Webcam C930e")
        
        self.snapshots_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "snapshots")
        os.makedirs(self.snapshots_dir, exist_ok=True)

        # Camera state
        self.online = False
        self.last_frame_at: Optional[datetime] = None
        self.last_error: Optional[str] = None
        
        self._latest_jpeg_bytes: Optional[bytes] = None
        self._latest_frame_dimensions: Tuple[int, int] = (self.width, self.height)
        
        # FPS measurement
        self._frame_timestamps = deque(maxlen=30)
        self.actual_fps: Optional[float] = None

    def _parse_device_index(self, dev_str: str):
        if dev_str.startswith("/dev/video"):
            try:
                return int(dev_str.replace("/dev/video", ""))
            except ValueError:
                pass
        try:
            return int(dev_str)
        except ValueError:
            return dev_str

    def _capture_loop(self, stop_event: threading.Event):
        logger.info(f"Starting camera capture thread for device {self.device} ({self.width}x{self.height} @ {self.fps} FPS)")
        
        backoff = 1.0
        max_backoff = 10.0
        dev_target = self._parse_device_index(self.device)

        while not stop_event.is_set():
            if not self.enabled:
                with self._lock:
                    self.online = False
                    self.last_error = "Camera disabled via configuration (CAMERA_ENABLED=false)"
                time.sleep(1.0)
                continue

            cap = None
            try:
                # Open VideoCapture using V4L2 backend if available
                cap = cv2.VideoCapture(dev_target, cv2.CAP_V4L2)
                if not cap.isOpened():
                    cap = cv2.VideoCapture(dev_target)

                if not cap.isOpened():
                    raise RuntimeError(f"Failed to open video capture device '{self.device}'")

                # Configure parameters
                if self.pixel_format == "MJPG":
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                cap.set(cv2.CAP_PROP_FPS, self.fps)

                logger.info(f"Camera device '{self.device}' opened successfully.")
                backoff = 1.0

                while not stop_event.is_set():
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        raise RuntimeError("Failed to read frame from camera device")

                    # Encode frame to JPEG
                    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
                    success, jpeg = cv2.imencode('.jpg', frame, encode_param)
                    if not success:
                        raise RuntimeError("Failed to encode frame to JPEG")

                    jpeg_bytes = jpeg.tobytes()
                    now = datetime.now(timezone.utc)
                    h, w = frame.shape[:2]

                    with self._lock:
                        self._latest_jpeg_bytes = jpeg_bytes
                        self._latest_frame_dimensions = (w, h)
                        self.last_frame_at = now
                        self.online = True
                        self.last_error = None

                        self._frame_timestamps.append(time.time())
                        if len(self._frame_timestamps) > 1:
                            dt = self._frame_timestamps[-1] - self._frame_timestamps[0]
                            if dt > 0:
                                self.actual_fps = round((len(self._frame_timestamps) - 1) / dt, 1)

            except Exception as e:
                err_msg = str(e)
                with self._lock:
                    self.online = False
                    self.last_error = f"Camera capture error: {err_msg}"
                    self.actual_fps = None
                
                logger.error(f"Camera device error ({self.device}): {err_msg}. Retrying in {backoff:.1f}s...")

                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = None

                steps = int(backoff / 0.1)
                for _ in range(max(1, steps)):
                    if stop_event.is_set():
                        break
                    time.sleep(0.1)

                backoff = min(max_backoff, backoff * 1.5)

            finally:
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass

        logger.info("Camera capture loop stopped.")

    def get_status(self) -> CameraStatus:
        with self._lock:
            res_str = f"{self.width}x{self.height}"
            if self._latest_frame_dimensions:
                res_str = f"{self._latest_frame_dimensions[0]}x{self._latest_frame_dimensions[1]}"

            return CameraStatus(
                online=self.online,
                device=self.device,
                camera_name=self.camera_name,
                resolution=res_str,
                configured_fps=self.fps,
                actual_fps=self.actual_fps if self.online else None,
                pixel_format=self.pixel_format,
                last_frame_at=self.last_frame_at,
                last_error=self.last_error,
            )

    def get_current_frame(self) -> Optional[bytes]:
        with self._lock:
            return self._latest_jpeg_bytes

    def capture_snapshot(self) -> SnapshotResponse:
        with self._lock:
            jpeg_bytes = self._latest_jpeg_bytes
            dims = self._latest_frame_dimensions
            online = self.online

        if not online or jpeg_bytes is None:
            raise RuntimeError("Camera is offline or no frame available to capture snapshot")

        now = datetime.now(timezone.utc)
        timestamp_str = now.strftime("%Y%m%d_%H%M%S")
        filename = f"snapshot_{timestamp_str}.jpg"
        filepath = os.path.join(self.snapshots_dir, filename)

        # Atomic write to file
        with open(filepath, "wb") as f:
            f.write(jpeg_bytes)

        logger.info(f"Saved snapshot to {filepath}")

        # Trigger RGB snapshot flash
        try:
            from rgb_service import get_rgb_service
            get_rgb_service().trigger_snapshot_flash()
        except Exception:
            pass


        return SnapshotResponse(
            filename=filename,
            timestamp=now,
            width=dims[0],
            height=dims[1],
            url=f"/camera/snapshots/{filename}"
        )


_camera_service: Optional[CameraService] = None
_camera_thread: Optional[threading.Thread] = None
_camera_stop_event = threading.Event()


def get_camera_service() -> CameraService:
    global _camera_service
    if _camera_service is None:
        _camera_service = CameraService()
    return _camera_service


def start_camera_service():
    global _camera_thread, _camera_stop_event
    service = get_camera_service()
    _camera_stop_event.clear()
    _camera_thread = threading.Thread(
        target=service._capture_loop,
        args=(_camera_stop_event,),
        daemon=True,
    )
    _camera_thread.start()
    logger.info("Camera service background thread started.")


def stop_camera_service():
    global _camera_thread, _camera_stop_event
    if _camera_stop_event is not None:
        _camera_stop_event.set()
    if _camera_thread is not None:
        _camera_thread.join(timeout=3.0)
        logger.info("Camera service background thread stopped.")
