import React from 'react';
import { Compass, Gauge, ArrowUp, Satellite, Hash } from 'lucide-react';
import type { TelemetryResponse } from '../types/telemetry';
import { MetricCard } from './MetricCard';

interface PositionPanelProps {
  data: TelemetryResponse | null;
  loading: boolean;
}

export const PositionPanel: React.FC<PositionPanelProps> = ({ data, loading }) => {
  const fix = data?.fix ?? false;
  const latitude = data?.latitude;
  const longitude = data?.longitude;
  const speed = data?.speed_kph;
  const altitude = data?.altitude_meters;
  const satellitesUsed = data?.satellites_used;
  const satellitesInView = data?.satellites_in_view;
  const hdop = data?.hdop;

  // Formatting helpers
  const formatCoordinate = (val: number | null | undefined, isLat: boolean) => {
    if (val === null || val === undefined) return 'N/A';
    const absVal = Math.abs(val).toFixed(6);
    if (isLat) {
      return `${absVal}° ${val >= 0 ? 'N' : 'S'}`;
    } else {
      return `${absVal}° ${val >= 0 ? 'E' : 'W'}`;
    }
  };

  const formatSpeed = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '0.00';
    return val.toFixed(2);
  };

  const formatAltitude = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '0.0';
    return val.toFixed(1);
  };

  const hdopStatus = () => {
    if (!fix || hdop === null || hdop === undefined) return 'default';
    if (hdop <= 1.0) return 'success';
    if (hdop <= 2.0) return 'info';
    if (hdop <= 5.0) return 'warning';
    return 'danger';
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <Compass size={20} className="panel-icon cyan-glow" />
        <h2 className="panel-title">GPS & Position Telemetry</h2>
      </div>

      <div className="metrics-grid">
        <MetricCard
          title="Latitude"
          value={fix ? formatCoordinate(latitude, true) : 'NO FIX'}
          icon={Compass}
          status={fix ? 'success' : 'danger'}
          loading={loading}
        />
        <MetricCard
          title="Longitude"
          value={fix ? formatCoordinate(longitude, false) : 'NO FIX'}
          icon={Compass}
          status={fix ? 'success' : 'danger'}
          loading={loading}
        />
        <MetricCard
          title="Ground Speed"
          value={fix ? formatSpeed(speed) : '0.00'}
          unit="km/h"
          icon={Gauge}
          status={fix && speed && speed > 5 ? 'info' : 'default'}
          loading={loading}
        />
        <MetricCard
          title="Altitude (MSL)"
          value={fix ? formatAltitude(altitude) : '0.0'}
          unit="m"
          icon={ArrowUp}
          status={fix ? 'default' : 'default'}
          loading={loading}
        />
        <MetricCard
          title="Satellites Used"
          value={fix ? (satellitesUsed ?? 0) : 0}
          subtext={`In view: ${satellitesInView ?? 0}`}
          icon={Satellite}
          status={fix && satellitesUsed && satellitesUsed >= 6 ? 'success' : 'warning'}
          loading={loading}
        />
        <MetricCard
          title="Horizontal Dilution (HDOP)"
          value={fix && hdop !== null && hdop !== undefined ? hdop.toFixed(2) : 'N/A'}
          subtext={fix ? (hdop && hdop <= 2 ? 'Ideal/Excellent' : 'Moderate/Poor') : 'No GPS Fix'}
          icon={Hash}
          status={hdopStatus()}
          loading={loading}
        />
      </div>
    </div>
  );
};
