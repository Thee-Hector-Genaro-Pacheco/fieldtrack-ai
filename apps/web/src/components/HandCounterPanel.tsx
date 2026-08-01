import React from 'react';
import { useHandDetection } from '../hooks/useHandDetection';
import {
  Hand,
  Activity,
  Cpu,
  WifiOff,
  CheckCircle2,
  HelpCircle,
  Zap,
} from 'lucide-react';

export const HandCounterPanel: React.FC = () => {
  const { data, handDetected, fingers, confidence, fps, isConnected, error } = useHandDetection();

  const confidencePct = Math.round(confidence * 100);

  return (
    <div className="panel-container hand-counter-container">
      {/* Panel Header */}
      <div className="panel-header">
        <div className="camera-title-group">
          <Hand size={22} className="panel-icon emerald-glow" />
          <h2 className="panel-title">AI Hand & Finger Counter</h2>
        </div>

        <div className="camera-header-badges">
          <div className={`camera-status-badge ${isConnected ? 'badge-online' : 'badge-offline'}`}>
            <span className={`status-dot ${isConnected ? 'dot-pulse' : ''}`}></span>
            <span>{isConnected ? 'LIVE WS' : 'DISCONNECTED'}</span>
          </div>

          <div className="camera-privacy-badge font-mono">
            <Cpu size={14} />
            <span>MediaPipe Edge AI &bull; {fps > 0 ? `${fps} FPS` : '15+ FPS Target'}</span>
          </div>
        </div>
      </div>

      {/* Main Hand Detection Status Banner */}
      <div className={`hand-status-banner ${handDetected ? 'banner-detected' : 'banner-undetected'}`}>
        <div className="status-banner-content">
          <div className="status-emoji-ring">
            <span className="hand-emoji" role="img" aria-label="hand">
              🖐
            </span>
          </div>

          <div className="status-text-group">
            <div className="status-headline">
              {handDetected ? (
                <>
                  <span className="detected-text font-bold">Hand Detected</span>
                  <CheckCircle2 size={18} className="text-emerald-400 inline-icon" />
                </>
              ) : (
                <>
                  <span className="undetected-text font-bold">No Hand Detected</span>
                  <HelpCircle size={18} className="text-slate-400 inline-icon" />
                </>
              )}
            </div>
            <p className="status-subtext">
              {handDetected
                ? `MediaPipe tracking active (${data.details?.handCount || 1} hand${
                    (data.details?.handCount || 1) > 1 ? 's' : ''
                  })`
                : 'Position hand clearly in camera view to begin counting'}
            </p>
          </div>
        </div>

        {/* Confidence Badge */}
        <div className="confidence-pill font-mono">
          <Zap size={14} className="text-amber-400" />
          <span>Confidence: {handDetected ? `${confidencePct}%` : '0%'}</span>
        </div>
      </div>

      {/* Big Finger Count Display */}
      <div className="finger-count-card">
        <div className="count-label-row font-mono">
          <span>FINGER COUNT</span>
          <span className="live-pulse-tag font-mono">
            <Activity size={12} className="animate-spin-slow" />
            REAL-TIME
          </span>
        </div>

        <div className="count-number-wrapper">
          <span className={`count-big-number font-mono ${handDetected ? 'text-cyan' : 'text-muted'}`}>
            {handDetected ? fingers : 0}
          </span>
          <span className="count-unit font-mono">{fingers === 1 ? 'FINGER' : 'FINGERS'}</span>
        </div>

        {/* Detailed Digit State Indicators if details available */}
        {handDetected && data.details?.perHand?.[0]?.fingerStates && (
          <div className="digit-indicators-grid font-mono">
            <div className={`digit-badge ${data.details.perHand[0].fingerStates.thumb ? 'digit-active' : ''}`}>
              👍 Thumb
            </div>
            <div className={`digit-badge ${data.details.perHand[0].fingerStates.index ? 'digit-active' : ''}`}>
              ☝️ Index
            </div>
            <div className={`digit-badge ${data.details.perHand[0].fingerStates.middle ? 'digit-active' : ''}`}>
              🖕 Middle
            </div>
            <div className={`digit-badge ${data.details.perHand[0].fingerStates.ring ? 'digit-active' : ''}`}>
              💍 Ring
            </div>
            <div className={`digit-badge ${data.details.perHand[0].fingerStates.pinky ? 'digit-active' : ''}`}>
              🤙 Pinky
            </div>
          </div>
        )}
      </div>

      {/* Payload JSON Inspector */}
      <div className="payload-inspector">
        <div className="inspector-header font-mono">
          <span>WEBSOCKET PAYLOAD TRANSMITTED:</span>
          <span className="inspector-fps font-mono">{fps.toFixed(1)} FPS</span>
        </div>
        <pre className="payload-json-box font-mono">
          {JSON.stringify(
            {
              handDetected: data.handDetected,
              fingers: data.fingers,
              confidence: data.confidence,
            },
            null,
            2
          )}
        </pre>
      </div>

      {/* Connection Warning Banner */}
      {error && !isConnected && (
        <div className="alert-banner alert-warning mt-3">
          <WifiOff size={16} />
          <span>WebSocket disconnected. Attempting automatic reconnection to Node API (port 8080)...</span>
        </div>
      )}
    </div>
  );
};
