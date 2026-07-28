import React, { useState } from 'react';
import {
  Camera,
  Video,
  VideoOff,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Maximize2,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { getCameraStreamUrl, getSnapshotImageUrl } from '../lib/api';

export const CameraPanel: React.FC = () => {
  const {
    status,
    loading,
    error,
    capturing,
    snapshotError,
    lastSnapshot,
    streamKey,
    refreshStream,
    takeSnapshot,
  } = useCamera(6000);

  const [streamError, setStreamError] = useState<boolean>(false);
  const [snapshotSuccessMsg, setSnapshotSuccessMsg] = useState<boolean>(false);
  const [selectedSnapshotUrl, setSelectedSnapshotUrl] = useState<string | null>(null);

  const isOnline = status?.online === true && !error;
  const resolution = status?.resolution || '1280x720';
  const fpsText = status?.actual_fps ? `${status.actual_fps.toFixed(1)} FPS` : `${status?.configured_fps || 30} FPS`;
  const deviceName = status?.camera_name || 'Logitech Webcam C930e';
  const devicePath = status?.device || '/dev/video0';

  const handleCaptureSnapshot = async () => {
    try {
      setSnapshotSuccessMsg(false);
      await takeSnapshot();
      setSnapshotSuccessMsg(true);
      setTimeout(() => setSnapshotSuccessMsg(false), 4000);
    } catch {
      // Error handled in hook state
    }
  };

  const handleRetry = () => {
    setStreamError(false);
    refreshStream();
  };

  return (
    <div className="panel-container camera-panel-container">
      {/* Header */}
      <div className="panel-header camera-panel-header">
        <div className="camera-title-group">
          <Camera size={20} className="panel-icon cyan-glow" />
          <h2 className="panel-title">Live Camera</h2>
        </div>

        <div className="camera-header-badges">
          <div className={`camera-status-badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
            <span className={`status-dot ${isOnline ? 'dot-pulse' : ''}`}></span>
            <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          <div className="camera-privacy-badge">
            <ShieldCheck size={14} />
            <span>Local Edge Feed &bull; Privacy Protected</span>
          </div>
        </div>
      </div>

      {/* Metadata Bar */}
      <div className="camera-meta-bar">
        <div className="meta-pill">
          <span className="meta-label">Device:</span>
          <span className="meta-value font-mono">{devicePath}</span>
        </div>
        <div className="meta-pill">
          <span className="meta-label">Camera:</span>
          <span className="meta-value font-mono">{deviceName}</span>
        </div>
        <div className="meta-pill">
          <span className="meta-label">Resolution:</span>
          <span className="meta-value font-mono">{resolution}</span>
        </div>
        <div className="meta-pill">
          <span className="meta-label">Frame Rate:</span>
          <span className="meta-value font-mono">{fpsText}</span>
        </div>
        <div className="meta-pill">
          <span className="meta-label">Format:</span>
          <span className="meta-value font-mono">{status?.pixel_format || 'MJPG'}</span>
        </div>
      </div>

      {/* Main Stream Display */}
      <div className="camera-preview-wrapper">
        {loading && !status ? (
          <div className="camera-fallback-container">
            <div className="loading-spinner"></div>
            <p className="camera-fallback-text font-mono">INITIALIZING CAMERA EDGE SERVICE...</p>
          </div>
        ) : !isOnline || streamError ? (
          <div className="camera-fallback-container">
            <div className="camera-off-ring">
              <VideoOff size={36} className="camera-off-icon" />
            </div>
            <p className="camera-fallback-text font-mono">Camera offline or stream unavailable</p>
            <span className="camera-fallback-subtext font-mono">
              {status?.last_error || 'Verify USB /dev/video0 connection on Raspberry Pi'}
            </span>
            <button
              onClick={handleRetry}
              className="camera-retry-btn"
              aria-label="Retry camera connection"
            >
              <RefreshCw size={14} />
              <span>Retry Stream</span>
            </button>
          </div>
        ) : (
          <div className="camera-stream-container">
            <img
              src={getCameraStreamUrl(streamKey)}
              alt="Live Edge Camera Feed"
              className="camera-stream-img"
              onError={() => setStreamError(true)}
              onLoad={() => setStreamError(false)}
            />

            {/* In-Stream Overlay Pill */}
            <div className="camera-stream-overlay">
              <div className="overlay-live-indicator">
                <Video size={14} className="live-icon-pulse" />
                <span className="font-mono">LIVE PREVIEW</span>
              </div>
              <div className="overlay-fps-indicator font-mono">
                {resolution} &bull; {fpsText}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar & Snapshot Preview */}
      <div className="camera-action-bar">
        <div className="action-left">
          <button
            onClick={handleCaptureSnapshot}
            disabled={!isOnline || capturing}
            className="camera-snapshot-btn"
            aria-label="Capture camera snapshot"
          >
            {capturing ? (
              <>
                <div className="loading-spinner mini-spinner"></div>
                <span>Capturing...</span>
              </>
            ) : (
              <>
                <Camera size={16} />
                <span>Capture Snapshot</span>
              </>
            )}
          </button>

          <button
            onClick={handleRetry}
            className="camera-refresh-btn"
            title="Refresh stream"
            aria-label="Refresh stream"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Feedback Messages */}
        <div className="action-right">
          {snapshotSuccessMsg && lastSnapshot && (
            <div className="snapshot-toast toast-success">
              <CheckCircle2 size={16} />
              <span>Snapshot saved: {lastSnapshot.filename}</span>
            </div>
          )}

          {snapshotError && (
            <div className="snapshot-toast toast-error">
              <AlertCircle size={16} />
              <span>{snapshotError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Snapshot Gallery Preview Card if snapshot exists */}
      {lastSnapshot && (
        <div className="last-snapshot-card">
          <div className="snapshot-card-header">
            <span className="snapshot-card-title font-mono">LATEST SNAPSHOT</span>
            <div className="snapshot-card-time font-mono">
              <Clock size={12} />
              <span>{new Date(lastSnapshot.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="snapshot-card-body">
            <div className="snapshot-thumb-wrapper">
              <img
                src={getSnapshotImageUrl(lastSnapshot.url)}
                alt="Captured Snapshot"
                className="snapshot-thumb-img"
              />
              <button
                onClick={() => setSelectedSnapshotUrl(getSnapshotImageUrl(lastSnapshot.url))}
                className="snapshot-expand-btn"
                title="Expand Snapshot"
                aria-label="Expand snapshot view"
              >
                <Maximize2 size={14} />
              </button>
            </div>
            <div className="snapshot-meta-info">
              <div className="meta-item">
                <span className="meta-key">File:</span>
                <span className="meta-val font-mono">{lastSnapshot.filename}</span>
              </div>
              <div className="meta-item">
                <span className="meta-key">Size:</span>
                <span className="meta-val font-mono">
                  {lastSnapshot.width} x {lastSnapshot.height}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-key">URL:</span>
                <a
                  href={getSnapshotImageUrl(lastSnapshot.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="meta-link font-mono"
                >
                  {lastSnapshot.url}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Modal */}
      {selectedSnapshotUrl && (
        <div className="snapshot-modal-backdrop" onClick={() => setSelectedSnapshotUrl(null)}>
          <div className="snapshot-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title font-mono">Snapshot Preview</span>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedSnapshotUrl(null)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            <img src={selectedSnapshotUrl} alt="Snapshot Full View" className="modal-img" />
          </div>
        </div>
      )}
    </div>
  );
};
