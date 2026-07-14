import React from 'react';
import { Cpu, Clock, Radio, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import type { TelemetryResponse } from '../types/telemetry';
import { MetricCard } from './MetricCard';

interface DeviceHealthPanelProps {
  data: TelemetryResponse | null;
  loading: boolean;
}

export const DeviceHealthPanel: React.FC<DeviceHealthPanelProps> = ({ data, loading }) => {
  const health = data?.device_health;

  // Format uptime
  const formatUptime = (seconds: number | undefined | null): string => {
    if (seconds === undefined || seconds === null) return 'N/A';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const getCpuTempStatus = (temp: number | null | undefined) => {
    if (temp === null || temp === undefined) return 'default';
    if (temp >= 75) return 'danger';
    if (temp >= 60) return 'warning';
    return 'success';
  };

  const getParseErrorsStatus = (errors: number | undefined) => {
    if (errors === undefined) return 'default';
    return errors > 0 ? 'danger' : 'success';
  };

  const getReconnectsStatus = (attempts: number | undefined) => {
    if (attempts === undefined) return 'default';
    return attempts > 0 ? 'warning' : 'success';
  };

  const formatDataAge = (age: number | undefined | null) => {
    if (age === null || age === undefined) return 'N/A';
    if (age < 0.001) return '< 1 ms';
    if (age < 1) return `${(age * 1000).toFixed(0)} ms`;
    return `${age.toFixed(3)} s`;
  };

  const getDataAgeStatus = (age: number | undefined | null) => {
    if (age === null || age === undefined) return 'default';
    if (age > 5.0) return 'danger';
    if (age > 2.0) return 'warning';
    return 'success';
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <Cpu size={20} className="panel-icon orange-glow" />
        <h2 className="panel-title">Raspberry Pi diagnostics</h2>
      </div>

      <div className="metrics-grid">
        <MetricCard
          title="CPU Temperature"
          value={health?.cpu_temperature_c?.toFixed(1) ?? 'N/A'}
          unit="°C"
          icon={Cpu}
          status={getCpuTempStatus(health?.cpu_temperature_c)}
          loading={loading}
        />
        <MetricCard
          title="Uptime"
          value={formatUptime(health?.uptime_seconds)}
          icon={Clock}
          loading={loading}
        />
        <MetricCard
          title="Serial Connection"
          value={health?.serial_connected ? 'CONNECTED' : 'DISCONNECTED'}
          subtext={health?.last_error ? `Error: ${health.last_error}` : 'UART link active'}
          icon={Radio}
          status={health?.serial_connected ? 'success' : 'danger'}
          loading={loading}
        />
        <MetricCard
          title="NMEA Sentences"
          value={health?.sentences_parsed?.toLocaleString() ?? '0'}
          subtext={`Received: ${health?.sentences_received?.toLocaleString() ?? 0}`}
          icon={RefreshCw}
          status="default"
          loading={loading}
        />
        <MetricCard
          title="Parse Errors"
          value={health?.parse_errors ?? 0}
          icon={ShieldAlert}
          status={getParseErrorsStatus(health?.parse_errors)}
          loading={loading}
        />
        <MetricCard
          title="Reconnect Attempts"
          value={health?.reconnect_attempts ?? 0}
          icon={AlertTriangle}
          status={getReconnectsStatus(health?.reconnect_attempts)}
          loading={loading}
        />
        <MetricCard
          title="Data Age / Latency"
          value={formatDataAge(health?.data_age_seconds)}
          subtext={health?.last_sentence_at ? `Last Rx: ${new Date(health.last_sentence_at).toLocaleTimeString()}` : 'No packet received'}
          icon={Clock}
          status={getDataAgeStatus(health?.data_age_seconds)}
          loading={loading}
        />
      </div>
    </div>
  );
};
