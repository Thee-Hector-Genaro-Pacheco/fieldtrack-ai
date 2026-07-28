import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from 'react-leaflet';
import { MapPin, Satellite, ShieldCheck, Clock, Activity, AlertCircle } from 'lucide-react';
import type { TelemetryResponse } from '../types/telemetry';
import {
  getGeneralizedCoordinates,
  getHdopAccuracyLabel,
  formatUpdatedAge,
} from '../lib/privacy';

interface MapPanelProps {
  data: TelemetryResponse | null;
  loading: boolean;
}

// Controller component to center map and trigger Leaflet invalidateSize via ResizeObserver
const MapController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [center, map]);

  useEffect(() => {
    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    // Initial size invalidation timer after mount
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [map]);

  return null;
};

export const MapPanel: React.FC<MapPanelProps> = ({ data, loading }) => {
  const isMock = data?.source === 'mock' || data?.device_health?.gps_mode === 'mock';
  const hasFix = data?.fix ?? false;
  const rawLat = data?.latitude;
  const rawLng = data?.longitude;
  const dataAge = data?.device_health?.data_age_seconds;
  const sats = data?.satellites_used ?? 0;
  const hdop = data?.hdop;

  const hasCoordinates =
    rawLat !== null && rawLat !== undefined && rawLng !== null && rawLng !== undefined;

  // Derive generalized coordinates (2 decimal places ~1.1km neighborhood)
  const genCoords = hasCoordinates ? getGeneralizedCoordinates(rawLat, rawLng) : null;
  const center: [number, number] | null = genCoords
    ? [genCoords.latitude, genCoords.longitude]
    : null;

  // Header badge text
  const badgeLabel = isMock
    ? 'Demo Data • Privacy Protected'
    : 'Live GPS • Privacy Protected';

  return (
    <div className="panel-container map-panel-container">
      {/* Header */}
      <div className="panel-header map-panel-header">
        <div className="map-title-group">
          <MapPin size={20} className="panel-icon cyan-glow" />
          <h2 className="panel-title">Approximate Device Location</h2>
        </div>

        <div className={`map-header-badge ${isMock ? 'badge-demo' : 'badge-live'}`}>
          <ShieldCheck size={14} />
          <span>{badgeLabel}</span>
        </div>
      </div>

      {/* Main Map Content Wrapper */}
      <div className="map-wrapper">
        {loading && !data ? (
          <div className="map-fallback-container">
            <div className="loading-spinner"></div>
            <p className="map-fallback-text font-mono">INITIALIZING TELEMETRY MAP...</p>
          </div>
        ) : !center ? (
          <div className="map-fallback-container">
            <div className="no-fix-pulse-ring">
              <Satellite size={32} className="no-fix-icon" />
            </div>
            <p className="map-fallback-text font-mono">Waiting for live GPS fix...</p>
            <span className="no-fix-subtext font-mono">
              Telemetry active &bull; Searching for satellite lock
            </span>
          </div>
        ) : (
          <div className="map-element-wrapper">
            <MapContainer
              center={center}
              zoom={13}
              scrollWheelZoom={false}
              touchZoom={true}
              className="leaflet-map-element"
            >
              <MapController center={center} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                maxZoom={18}
              />

              {/* Translucent Privacy Region Circle (~1.1 km radius) */}
              <Circle
                center={center}
                radius={1100}
                pathOptions={{
                  color: '#00f0ff',
                  fillColor: '#00f0ff',
                  fillOpacity: 0.12,
                  weight: 1.5,
                  dashArray: '6, 6',
                }}
              />

              {/* Animated Pulsing Outer Halo Marker */}
              <CircleMarker
                center={center}
                radius={14}
                pathOptions={{
                  color: '#00f0ff',
                  fillColor: '#00f0ff',
                  fillOpacity: 0.25,
                  weight: 1,
                  className: 'map-pulse-aura',
                }}
              />

              {/* Soft Circular Center Location Dot */}
              <CircleMarker
                center={center}
                radius={7}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#00f0ff',
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              />
            </MapContainer>

            {/* Top-Left In-Map Compact Legend */}
            <div className="map-overlay-legend">
              <div className="legend-item">
                <span className="legend-dot glowing-dot"></span>
                <span className="legend-text">Generalized device area</span>
              </div>
              <div className="legend-item">
                <span className="legend-circle-icon"></span>
                <span className="legend-text">Privacy radius (~1.1km)</span>
              </div>
            </div>

            {/* Top-Right In-Map Status Overlay */}
            <div className="map-overlay-status">
              <div className="overlay-status-row">
                <span className={`status-pill ${isMock ? 'pill-demo' : 'pill-live'}`}>
                  <Activity size={12} />
                  {isMock ? 'Demo Data' : 'Live GPS'}
                </span>
                <span className="status-pill pill-sats">
                  <Satellite size={12} />
                  {sats} Sats
                </span>
              </div>
              <div className="overlay-accuracy-row">
                <span className="accuracy-label">Accuracy:</span>
                <span className="accuracy-value font-mono">
                  {getHdopAccuracyLabel(hdop, hasFix)}
                </span>
              </div>
            </div>

            {/* Bottom-Left In-Map Privacy Notice */}
            <div className="map-overlay-privacy">
              <p className="overlay-privacy-text">
                Location intentionally generalized for privacy.
              </p>
            </div>

            {/* Bottom-Right In-Map Data Age Badge (NO COORDINATES) */}
            <div className="map-overlay-age">
              <Clock size={12} />
              <span className="font-mono">{formatUpdatedAge(dataAge)}</span>
            </div>

            {/* No Fix Overlay Warning Banner (when no active fix but showing last known area) */}
            {!hasFix && (
              <div className="map-overlay-nofix-banner">
                <AlertCircle size={16} />
                <span>Waiting for live GPS fix... (Last known approximate area)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="map-privacy-footer">
        <p className="map-privacy-text">
          Location intentionally generalized for privacy.
        </p>
        <div className="map-footer-age font-mono">
          {formatUpdatedAge(dataAge)}
        </div>
      </div>
    </div>
  );
};
