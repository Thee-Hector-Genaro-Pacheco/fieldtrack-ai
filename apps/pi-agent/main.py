import logging
import os
from typing import Any
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from gps_reader import get_telemetry, start_gps_reader, stop_gps_reader
from models import Telemetry

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
    yield
    # Shutdown lifecycle
    logger.info("Shutting down GPS telemetry background service...")
    stop_gps_reader()


app = FastAPI(
    title="FieldTrack AI Pi Agent",
    version="0.1.0",
    description="GPS telemetry and industrial controls edge service.",
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
    return {
        "status": tel.device_health.status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gps_mode": tel.device_health.gps_mode,
        "serial_connected": tel.device_health.serial_connected,
    }


@app.get("/telemetry/current", response_model=Telemetry)
def telemetry_current() -> Telemetry:
    return get_telemetry()


@app.get("/telemetry", response_model=Telemetry)
def telemetry_legacy() -> Telemetry:
    return get_telemetry()