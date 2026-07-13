# FieldTrack AI Pi Agent

Edge-service application for Raspberry Pi GPS telemetry parsing and health status reporting.

## Features

- **Multi-Sentence parsing**: Fully parses `GGA`, `RMC`, `GSA`, `GSV`, `GLL`, and `VTG` NMEA sentences.
- **Hardware & Mock Modes**: Supports local mock-data streaming (great for macOS/Windows development) and real serial-connection reading (`/dev/ttyAMA0` by default).
- **Public Demo Mode**: Masks and offsets latitude/longitude coordinates to protect location privacy when `PUBLIC_DEMO_MODE=true` is enabled.
- **Stale Telemetry Detection**: Automatically flags GPS telemetry as degraded/unhealthy if no valid NMEA sentences are received within a configurable window (`GPS_STALE_AFTER_SECONDS`).
- **Resilient Serial Reading**: Includes bounded exponential backoff reconnection loops to keep the API server online even if the hardware device is disconnected.

---

## Installation & Setup

1. Navigate to the `apps/pi-agent` directory.
2. Initialize and activate the virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

---

## Configuration

Settings are controlled via environment variables or a `.env` file:

| Variable | Description | Default |
|---|---|---|
| `GPS_MODE` | Operation mode (`mock` or `hardware`) | `mock` |
| `GPS_SERIAL_PORT` | Raspberry Pi UART serial port path | `/dev/ttyAMA0` |
| `GPS_BAUD_RATE` | Serial port speed (baud rate) | `9600` |
| `GPS_STALE_AFTER_SECONDS` | Timeout to declare GPS data stale/degraded | `5` |
| `PUBLIC_DEMO_MODE` | Mask precise location with stable session offset | `false` |

---

## Running the Service

Start the FastAPI application with Uvicorn:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

### Main API Endpoints

- **GET `/health`**: Returns system state and telemetry health details.
- **GET `/telemetry/current`**: Returns structured GPS and device metrics.
- **GET `/telemetry`**: Alias of `/telemetry/current` for backward compatibility.

---

## Running Unit Tests

Run unit tests via `pytest`:

```bash
pytest -v
```

---

## Coordinate Privacy (Public Demo Mode)

When `PUBLIC_DEMO_MODE=true` is active:
- Coordinates are altered using a **stable, session-level offset** generated at startup.
- The relative motion of the device remains consistent and smooth (avoiding random jumps on every request).
- The returned coordinates are rounded to **4 decimal places**.
- The coordinates returned by the API are intentionally altered to preserve location privacy.
