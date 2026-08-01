import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Zap,
  Clock,
  Camera,
  MapPin,
  Flame,
  CheckCircle2,
  RefreshCw,
  FlaskConical,
  ExternalLink,
} from 'lucide-react';
import { useMotion } from '../hooks/useMotion';
import { getSnapshotImageUrl } from '../lib/api';
import { MetricCard } from './MetricCard';

export const MotionPanel: React.FC = () => {
  const {
    status,
    events,
    loading,
    error,
    triggeringTest,
    triggerError,
    refreshAll,
    triggerTestEvent,
  } = useMotion(3000, 6000);

  const [testSuccessToast, setTestSuccessToast] = useState<boolean>(false);
  const [selectedSnapshotUrl, setSelectedSnapshotUrl] = useState<string | null>(null);

  const isOnline = status?.online === true && !error;
  const isWarmingUp = status?.warming_up === true;
  const warmupRemaining = status?.warmup_remaining_seconds ?? 0;
  const isMotionActive = status?.current_state === 'motion';
  const gpioPin = status?.gpio_pin ?? 17;
  const totalEvents = status?.total_motion_events ?? 0;
  const autoSnapshot = status?.auto_snapshot ?? true;

  const handleTestTrigger = async () => {
    try {
      setTestSuccessToast(false);
      await triggerTestEvent();
      setTestSuccessToast(true);
      setTimeout(() => setTestSuccessToast(false), 4000);
    } catch {
      // Error in hook state
    }
  };

  const formatTime = (isoStr: string | null | undefined) => {
    if (!isoStr) return 'N/A';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'N/A';
    }
  };

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="panel-container motion-panel-container">
      {/* Header */}
      <div className="panel-header motion-panel-header">
        <div className="motion-title-group">
          <Activity size={20} className="panel-icon cyan-glow" />
          <h2 className="panel-title">Motion Sensor</h2>
        </div>

        <div className="motion-header-badges">
          {/* Online / Warming Up / Offline Status */}
          {isWarmingUp ? (
            <div className="motion-status-badge badge-warmup animate-pulse">
              <Flame size={14} />
              <span>WARMING UP ({warmupRemaining}s)</span>
            </div>
          ) : (
            <div className={`motion-status-badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
              <span className={`status-dot ${isOnline ? 'dot-pulse' : ''}`}></span>
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          )}

          {/* Auto Snapshot Pill */}
          <div className={`motion-pill-badge ${autoSnapshot ? 'pill-active' : 'pill-disabled'}`}>
            <Camera size={13} />
            <span>AUTO-SNAPSHOT {autoSnapshot ? 'ON' : 'OFF'}</span>
          </div>
        </div>
      </div>

      {/* Active Motion Glowing Alert Banner */}
      {isMotionActive && (
        <div className="motion-alert-banner alert-motion-active">
          <div className="alert-motion-glow"></div>
          <AlertTriangle size={22} className="alert-motion-icon animate-bounce" />
          <div className="alert-motion-text">
            <strong className="font-mono">MOTION DETECTED</strong>
            <span>PIR sensor on BCM GPIO{gpioPin} triggered. Event recorded & auto-snapshot requested.</span>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <MetricCard
          title="Motion State"
          value={isMotionActive ? 'MOTION' : 'CLEAR'}
          subtext={isWarmingUp ? `Calibrating background IR (${warmupRemaining}s)` : 'PIR Passive Infrared'}
          icon={Zap}
          status={isMotionActive ? 'danger' : 'success'}
          loading={loading}
        />
        <MetricCard
          title="GPIO Pin"
          value={`GPIO ${gpioPin}`}
          subtext="BCM Pin 17 (Physical Pin 11)"
          icon={Activity}
          status="default"
          loading={loading}
        />
        <MetricCard
          title="Total Events"
          value={totalEvents.toLocaleString()}
          subtext={`Cooldown: ${status?.cooldown_seconds ?? 10}s threshold`}
          icon={Activity}
          status={totalEvents > 0 ? 'info' : 'default'}
          loading={loading}
        />
        <MetricCard
          title="Last Motion"
          value={formatTime(status?.last_motion_at)}
          subtext={status?.last_motion_at ? new Date(status.last_motion_at).toLocaleDateString() : 'No motion recorded'}
          icon={Clock}
          status={isMotionActive ? 'danger' : 'default'}
          loading={loading}
        />
        <MetricCard
          title="Last Cleared"
          value={formatTime(status?.last_cleared_at)}
          subtext={status?.last_cleared_at ? new Date(status.last_cleared_at).toLocaleDateString() : 'No clear timestamp'}
          icon={Clock}
          status="default"
          loading={loading}
        />
      </div>

      {/* Dev Action Bar */}
      <div className="motion-action-bar">
        <div className="action-left">
          <button
            onClick={handleTestTrigger}
            disabled={triggeringTest}
            className="motion-test-btn"
            aria-label="Trigger test motion event"
          >
            {triggeringTest ? (
              <>
                <div className="loading-spinner mini-spinner"></div>
                <span>Simulating...</span>
              </>
            ) : (
              <>
                <FlaskConical size={16} />
                <span>Test Motion Event</span>
              </>
            )}
          </button>

          <button
            onClick={() => refreshAll()}
            className="motion-refresh-btn"
            title="Refresh motion state"
            aria-label="Refresh motion status and events"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="action-right">
          {testSuccessToast && (
            <div className="motion-toast toast-success">
              <CheckCircle2 size={16} />
              <span>Simulated motion event triggered!</span>
            </div>
          )}

          {triggerError && (
            <div className="motion-toast toast-error">
              <AlertTriangle size={16} />
              <span>{triggerError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Motion Events List */}
      <div className="motion-events-section">
        <div className="events-section-header">
          <h3 className="events-title font-mono">RECENT MOTION EVENTS HISTORY</h3>
          <span className="events-count font-mono">{events.length} Recorded</span>
        </div>

        {events.length === 0 ? (
          <div className="events-empty-container">
            <Clock size={24} className="events-empty-icon" />
            <p className="events-empty-text font-mono">No motion events recorded yet</p>
          </div>
        ) : (
          <div className="events-table-wrapper">
            <table className="events-table">
              <thead>
                <tr>
                  <th>TIMESTAMP</th>
                  <th>EVENT TYPE</th>
                  <th>STATE</th>
                  <th>GEOTAG</th>
                  <th>SNAPSHOT</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id} className={evt.motion_state === 'motion' ? 'row-motion-active' : ''}>
                    <td className="font-mono">{formatDateTime(evt.timestamp)}</td>
                    <td>
                      <div className="event-type-cell">
                        <span className={`event-type-badge ${evt.event_type}`}>
                          {evt.event_type.replace('_', ' ').toUpperCase()}
                        </span>
                        {evt.simulated && (
                          <span className="badge-simulated" title="Development Simulated Event">
                            SIMULATED
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`state-badge state-${evt.motion_state}`}>
                        {evt.motion_state.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`gps-tag ${evt.fix ? 'gps-fix' : 'gps-nofix'}`}>
                        <MapPin size={11} />
                        {evt.fix ? 'GPS FIX' : 'NO FIX'}
                      </span>
                    </td>
                    <td>
                      {evt.snapshot_url ? (
                        <button
                          onClick={() => setSelectedSnapshotUrl(getSnapshotImageUrl(evt.snapshot_url!))}
                          className="event-snapshot-link font-mono"
                          title="View Snapshot"
                        >
                          <Camera size={12} />
                          <span>{evt.snapshot_filename}</span>
                          <ExternalLink size={10} />
                        </button>
                      ) : (
                        <span className="no-snapshot-text font-mono">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Snapshot Preview Modal */}
      {selectedSnapshotUrl && (
        <div className="snapshot-modal-backdrop" onClick={() => setSelectedSnapshotUrl(null)}>
          <div className="snapshot-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title font-mono">Motion Snapshot Geotag</span>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedSnapshotUrl(null)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            <img src={selectedSnapshotUrl} alt="Motion Event Snapshot" className="modal-img" />
          </div>
        </div>
      )}
    </div>
  );
};
