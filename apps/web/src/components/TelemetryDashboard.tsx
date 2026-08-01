import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { Header } from './Header';
import { PositionPanel } from './PositionPanel';
import { DeviceHealthPanel } from './DeviceHealthPanel';
import { MapPanel } from './MapPanel';
import { CameraPanel } from './CameraPanel';
import { MotionPanel } from './MotionPanel';
import { AlertTriangle, ShieldAlert, AlertCircle, WifiOff } from 'lucide-react';

export const TelemetryDashboard: React.FC = () => {
  const { data, loading, error, isConnected } = useTelemetry(2000);

  // Computed states
  const serialDisconnected = data && !data.device_health.serial_connected;
  const isStale = data && data.device_health.data_age_seconds > 5.0;
  const hasParseErrors = data && data.device_health.parse_errors > 0;

  // Render initial loading state when no data exists yet
  if (loading && !data) {
    return (
      <div className="loading-container">
        <div className="loading-glow"></div>
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h2 className="loading-title">BOOTSTRAPPING Edge Services</h2>
          <p className="loading-subtitle">Establishing connection to FieldTrack AI Pi Agent...</p>
          <div className="loading-bar">
            <div className="loading-bar-fill"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <Header data={data} isConnected={isConnected} />

      {/* System Warning Banners */}
      <div className="alerts-container">
        {error && (
          <div className="alert-banner alert-danger animate-pulse">
            <WifiOff size={18} className="alert-icon" />
            <div className="alert-text">
              <strong>API Connection Loss:</strong> Unable to connect to Pi Agent. Please verify the agent service is running at <code>{import.meta.env.VITE_PI_AGENT_API_URL || 'http://localhost:8000'}</code>.
            </div>
          </div>
        )}

        {isConnected && serialDisconnected && (
          <div className="alert-banner alert-danger">
            <AlertTriangle size={18} className="alert-icon" />
            <div className="alert-text">
              <strong>UART Link Fault:</strong> Raspberry Pi serial port disconnected. GPS module might be unplugged or misconfigured.
            </div>
          </div>
        )}

        {isConnected && isStale && (
          <div className="alert-banner alert-warning animate-pulse">
            <AlertCircle size={18} className="alert-icon" />
            <div className="alert-text">
              <strong>Stale Telemetry:</strong> No GPS NMEA sentences received for {data?.device_health.data_age_seconds.toFixed(1)}s (threshold: 5s). Position data may be outdated.
            </div>
          </div>
        )}

        {isConnected && hasParseErrors && (
          <div className="alert-banner alert-warning">
            <ShieldAlert size={18} className="alert-icon" />
            <div className="alert-text">
              <strong>Checksum/Parsing Errors:</strong> The parser detected {data?.device_health.parse_errors} sentence errors. Check baud rate or serial connection quality.
            </div>
          </div>
        )}
      </div>

      <main className="dashboard-grid">
        <PositionPanel data={data} loading={loading} />
        <DeviceHealthPanel data={data} loading={loading} />
        <MotionPanel />
        <CameraPanel />
        <MapPanel data={data} loading={loading} />
      </main>

      {/* Privacy Notice Banner */}
      <div className="privacy-banner">
        <div className="privacy-badge">PRIVACY NOTICE</div>
        <p className="privacy-text">
          GPS coordinates are processed securely. In public demo mode, coordinates may be rounded or altered to protect privacy.
        </p>
      </div>
    </div>
  );
};
