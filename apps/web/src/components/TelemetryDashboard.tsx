import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useApiHealth } from '../hooks/useApiHealth';
import { API_BASE_URL } from '../lib/api';
import { Header } from './Header';
import { PositionPanel } from './PositionPanel';
import { DeviceHealthPanel } from './DeviceHealthPanel';
import { MapPanel } from './MapPanel';
import { CameraPanel } from './CameraPanel';
import { MotionPanel } from './MotionPanel';
import { HandCounterPanel } from './HandCounterPanel';
import { AlertTriangle, ShieldAlert, AlertCircle, WifiOff, Terminal } from 'lucide-react';

export const TelemetryDashboard: React.FC = () => {
  const { data, loading: telemetryLoading } = useTelemetry(2000);
  const apiHealth = useApiHealth(3000, 3);

  const isConnected = apiHealth.isConnected;
  const loading = telemetryLoading && apiHealth.loading;

  // Computed states
  const serialDisconnected = data && !data.device_health.serial_connected;
  const dataAge = data?.device_health.data_age_seconds;
  const isStale = data && dataAge !== null && dataAge !== undefined && dataAge > 5.0;
  const hasParseErrors = data && data.device_health.parse_errors > 0;

  // Render initial loading state when no data exists yet and bootstrapping health check
  if (loading && !data) {
    return (
      <div className="loading-container">
        <div className="loading-glow"></div>
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h2 className="loading-title">BOOTSTRAPPING Edge Services</h2>
          <p className="loading-subtitle">Establishing connection to FieldTrack AI Pi Agent at <code>{API_BASE_URL}</code>...</p>
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

      {/* Dev Diagnostics Panel */}
      {import.meta.env.DEV && (
        <div className="dev-diagnostics-bar font-mono text-xs" style={{ margin: '0.75rem 0', padding: '0.6rem 1rem', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '6px', color: '#67e8f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.35rem', color: '#22d3ee' }}>
            <Terminal size={14} />
            <span>DEV DIAGNOSTICS</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
            <div><span style={{ color: '#94a3b8' }}>API URL:</span> {apiHealth.apiUrl}</div>
            <div><span style={{ color: '#94a3b8' }}>Health Status:</span> {apiHealth.health?.status || 'N/A'}</div>
            <div><span style={{ color: '#94a3b8' }}>Consecutive Failures:</span> {apiHealth.consecutiveFailures}</div>
            <div><span style={{ color: '#94a3b8' }}>Last Success:</span> {apiHealth.lastSuccessTime ? apiHealth.lastSuccessTime.toLocaleTimeString() : 'None'}</div>
            <div><span style={{ color: '#94a3b8' }}>Telemetry Source:</span> {data?.source ? data.source.toUpperCase() : 'UNKNOWN'}</div>
          </div>
        </div>
      )}

      {/* System Warning Banners */}
      <div className="alerts-container">
        {!isConnected && (
          <div className="alert-banner alert-danger animate-pulse">
            <WifiOff size={18} className="alert-icon" />
            <div className="alert-text">
              <strong>API Connection Loss:</strong> Unable to connect to Pi Agent. Please verify the agent service is running at <code>{API_BASE_URL}</code>.
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
              <strong>Stale Telemetry:</strong> No GPS NMEA sentences received for {dataAge?.toFixed(1) ?? 'N/A'}s (threshold: 5s). Position data may be outdated.
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
        <HandCounterPanel />
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
