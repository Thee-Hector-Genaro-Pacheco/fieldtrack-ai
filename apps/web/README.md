# FieldTrack AI Live Telemetry Dashboard

A polished, responsive, dark industrial dashboard built with React, TypeScript, Vite, and Lucide React. It provides real-time monitoring of GPS coordinates and Raspberry Pi hardware diagnostic metrics.

## Features

- **Real-Time Polling**: Regularly queries `/telemetry/current` every 2 seconds.
- **Position Visualization**: Monospace coordinates (Latitude & Longitude), Ground Speed, Altitude, Satellites (Used/In View), and HDOP (Horizontal Dilution of Precision).
- **Pi Edge Diagnostics**: Tracks CPU temperature, uptime, serial link status, sentence parsing count, parse errors, reconnect attempts, and telemetry data latency.
- **Robust Alert Banners**: Warns users immediately of:
  - API connection loss
  - UART serial link faults
  - Stale telemetry data
  - Checksum/parse errors
- **Privacy Notice**: Explains coordinate alteration/rounding in public demo mode.
- **Dark Industrial Styling**: Sleek CSS variables, tech grids, LED pulses, custom scrollbars, and micro-animations.

## File Structure

- `src/types/telemetry.ts`: TypeScript data models matching the Pi agent API.
- `src/lib/api.ts`: API client accessing `VITE_PI_AGENT_API_URL`.
- `src/hooks/useTelemetry.ts`: React hook managing the 2-second interval polling.
- `src/components/StatusBadge.tsx`: Reusable status indicator badge with glowing LED behavior.
- `src/components/MetricCard.tsx`: Reusable grid card for single telemetry data points.
- `src/components/PositionPanel.tsx`: Displays GPS location and metrics.
- `src/components/DeviceHealthPanel.tsx`: Displays diagnostic details.
- `src/components/Header.tsx`: Title console, clock, and connection badges.
- `src/components/TelemetryDashboard.tsx`: Central dashboard container.

## Local Configuration

Create a `.env` file in `apps/web/` to define the API url:

```env
VITE_PI_AGENT_API_URL=http://192.168.50.2:8000
```

## Running the Web App

Inside `apps/web/`:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
4. Run the linter:
   ```bash
   npm run lint
   ```
