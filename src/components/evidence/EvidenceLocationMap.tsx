import { useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { formatEvidenceLocation, openStreetMapUrl, type EvidenceLocation } from '../../utils/evidenceLocation';

const ZOOM = 16;
const TILE = 256;
const COLS = 5; // 1280px wide: covers any modal width with the pin centred
const ROWS = 3;
const HEIGHT = 240;

function tilePoint(lat: number, lon: number) {
  const n = 2 ** ZOOM;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/**
 * Capture location for one evidence item. Coordinates are shown immediately from
 * the local vault; map tiles are only requested from OpenStreetMap after the user
 * taps "Show map", so nothing about the location leaves the device by default.
 */
export default function EvidenceLocationMap({ location }: { location: EvidenceLocation }) {
  const [showMap, setShowMap] = useState(false);
  const point = tilePoint(location.latitude, location.longitude);
  const firstX = Math.floor(point.x) - Math.floor(COLS / 2);
  const firstY = Math.floor(point.y) - Math.floor(ROWS / 2);
  const offsetX = (point.x - firstX) * TILE;
  const offsetY = (point.y - firstY) * TILE;
  const metersPerPixel = (156543.03392 * Math.cos((location.latitude * Math.PI) / 180)) / 2 ** ZOOM;
  const accuracyPx = location.accuracy ? Math.max(14, (2 * location.accuracy) / metersPerPixel) : 0;

  async function openExternal() {
    const url = openStreetMapUrl(location);
    try {
      await open(url);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }

  return (
    <div className="evidence-location" data-testid="evidence-location">
      <div className="evidence-location-summary">
        <MapPin size={16} />
        <div>
          <strong data-testid="evidence-location-coords">{formatEvidenceLocation(location)}</strong>
          <span>
            {location.capturedAt ? `Captured ${new Date(location.capturedAt).toLocaleString()}` : 'Capture time not recorded'}
            {location.device ? ` · ${location.device}` : ''}
          </span>
        </div>
      </div>

      {showMap ? (
        <div className="evidence-map" style={{ height: HEIGHT }} data-testid="evidence-location-map">
          <div className="evidence-map-tiles" style={{ transform: `translate(${-offsetX}px, ${-offsetY}px)` }}>
            {Array.from({ length: ROWS }).map((_, row) =>
              Array.from({ length: COLS }).map((__, col) => (
                <img
                  key={`${row}-${col}`}
                  src={`https://tile.openstreetmap.org/${ZOOM}/${firstX + col}/${firstY + row}.png`}
                  alt=""
                  draggable={false}
                  style={{ left: col * TILE, top: row * TILE }}
                />
              ))
            )}
          </div>
          {accuracyPx > 0 && <span className="evidence-map-accuracy" style={{ width: accuracyPx, height: accuracyPx }} />}
          <span className="evidence-map-pin" aria-label="Capture location"><MapPin size={28} /></span>
          <a className="evidence-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </div>
      ) : (
        <p className="evidence-location-privacy">
          Showing the map loads map images from OpenStreetMap, which shares this area with their servers.
        </p>
      )}

      <div className="evidence-location-actions">
        {!showMap && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMap(true)} data-testid="evidence-location-show-map">
            <MapPin size={14} /> Show map
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openExternal()} data-testid="evidence-location-open-maps">
          <ExternalLink size={14} /> Open in maps
        </button>
      </div>
    </div>
  );
}
