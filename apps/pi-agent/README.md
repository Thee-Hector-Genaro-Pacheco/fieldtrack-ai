# FieldTrack AI Pi Agent

Edge-service application for Raspberry Pi GPS telemetry parsing and health status reporting.

## Features

- **Freenove 8 RGB LED Module Service**: Thread-safe background animation service supporting state transitions (`boot`, `healthy`, `gps_searching`, `motion_detected`, `snapshot`, `error`, `off`), priority overrides, and safe mock fallback on development hardware.

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

## Freenove 8 RGB LED Module Wiring & Hardware

### Physical Wiring
- **IN-S (Signal)** -> Raspberry Pi physical pin 12 / BCM GPIO18
- **IN-V (Power)** -> 5V Power (Physical pin 2 or 4)
- **IN-G (Ground)** -> Common Ground GND (Physical pin 6, 9, 14, 20, or 34)
- **OUT (Cascading)** -> Unused (remains open unless chaining another downstream RGB ring/strip)

### Signal Flow & Cascading
- The **IN** connector receives addressable pixel data directly from the Raspberry Pi GPIO18 pin.
- The **OUT** connector forwards downstream data to subsequent modules if multiple NeoPixel rings are daisy-chained.

### Electrical Warning & Logic Levels
> **[WARNING]** Raspberry Pi GPIO pins output 3.3V logic levels, while the Freenove RGB LED module is powered by 5V. While 3.3V signals are usually sufficient to trigger WS2812B data inputs, long wires or noisy environments may cause flickering. A 3.3V-to-5V logic level shifter (e.g. 74AHCT125) is recommended for production hardware setups.

### Brightness Limiting & Power Consumption
- Each RGB pixel at 100% white can draw up to 60mA (8 pixels = ~480mA max total).
- Default brightness is **capped at 20% (`0.2`)** to protect the Raspberry Pi 5V power supply rail and minimize current draw (~100mA total max).

### Raspberry Pi 5 Driver Limitation
- Raspberry Pi 5 replaces the legacy BCM2835 peripheral interface with the custom **RP1 I/O controller**.
- Traditional `rpi_ws281x` drivers relying on direct `/dev/mem` DMA access are incompatible on RPi 5 / Debian Trixie unless configured via SPI `/dev/spidev0.0` or dedicated kernel overlays.
- The `RGBService` automatically detects hardware driver availability and safely falls back to `MockRGBDriver` on non-supported platforms or macOS development environments.

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
| `RGB_GPIO_PIN` | BCM GPIO pin for RGB LED IN-S signal | `18` |
| `RGB_PIXEL_COUNT` | Number of addressable RGB pixels | `8` |
| `RGB_BRIGHTNESS` | Maximum default brightness factor (0.0 to 1.0) | `0.2` |

---

## Running the Service

Start the FastAPI application with Uvicorn:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

### Main API Endpoints

- **GET `/health`**: Returns system state, telemetry health details, and RGB LED service status.
- **GET `/telemetry/current`**: Returns structured GPS and device metrics.
- **GET `/telemetry`**: Alias of `/telemetry/current` for backward compatibility.
- **GET `/rgb/status`**: Returns RGB LED service online status, mock mode, pin configuration, brightness, active state, and last updated timestamp.
- **POST `/rgb/state/{state}`**: Sets the active RGB LED state (`boot`, `healthy`, `gps_searching`, `motion_detected`, `snapshot`, `error`, `off`).
- **POST `/rgb/test`**: Triggers a test animation pattern.
- **POST `/rgb/off`**: Turns off all RGB pixels.


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
