import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import type { TelemetryResponse } from '../types/telemetry';
import { StatusBadge } from './StatusBadge';

interface HeaderProps {
  data: TelemetryResponse | null;
  isConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ data, isConnected }) => {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatClock = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatLocalDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getSourceBadge = () => {
    const src = data?.source ?? 'mock';
    const isLive = src === 'live' || src === 'hardware';
    return (
      <StatusBadge
        label={`SRC: ${src.toUpperCase()}`}
        status={isLive ? 'success' : 'info'}
      />
    );
  };

  const getApiBadge = () => {
    return (
      <StatusBadge
        label={isConnected ? 'API ONLINE' : 'API OFFLINE'}
        status={isConnected ? 'success' : 'danger'}
        pulse={isConnected}
      />
    );
  };

  const getFixBadge = () => {
    const hasFix = data?.fix ?? false;
    return (
      <StatusBadge
        label={hasFix ? 'GPS FIX ACTIVE' : 'NO GPS FIX'}
        status={hasFix ? 'success' : 'danger'}
        pulse={hasFix}
      />
    );
  };

  return (
    <header className="header-container">
      <div className="header-logo-section">
        <Shield className="header-logo" size={28} />
        <div>
          <h1 className="header-title">FIELDTRACK AI</h1>
          <p className="header-subtitle">Edge Telemetry Console</p>
        </div>
      </div>

      <div className="header-status-section">
        {getApiBadge()}
        {getFixBadge()}
        {getSourceBadge()}
      </div>

      <div className="header-time-section">
        <div className="header-clock">{formatClock(time)}</div>
        <div className="header-date">{formatLocalDate(time)}</div>
      </div>
    </header>
  );
};
