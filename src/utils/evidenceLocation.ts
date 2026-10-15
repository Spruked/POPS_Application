import { invoke } from '@tauri-apps/api/core';

/** A capture location stored in evidence_metadata by the camera capture flow. */
export type EvidenceLocation = {
  evidenceId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string | null;
  device: string;
};

type MetadataRecord = {
  evidence_id: string;
  exif_json: string;
  gps_lat: number | null;
  gps_lon: number | null;
  device_identity: string;
  timestamp_utc: string;
};

function toLocation(record: MetadataRecord | null): EvidenceLocation | null {
  if (!record || record.gps_lat == null || record.gps_lon == null) return null;
  let exif: { accuracy_m?: number; captured_at?: string } = {};
  try {
    exif = JSON.parse(record.exif_json || '{}');
  } catch {
    /* exif_json is free-form for non-camera metadata */
  }
  return {
    evidenceId: record.evidence_id,
    latitude: record.gps_lat,
    longitude: record.gps_lon,
    accuracy: typeof exif.accuracy_m === 'number' ? exif.accuracy_m : null,
    capturedAt: exif.captured_at || record.timestamp_utc || null,
    device: record.device_identity,
  };
}

export async function fetchEvidenceLocation(evidenceId: string): Promise<EvidenceLocation | null> {
  try {
    const raw = await invoke<string>('get_evidence_metadata', { evidenceId });
    return toLocation(JSON.parse(raw) as MetadataRecord | null);
  } catch {
    return null;
  }
}

export async function fetchEvidenceLocations(): Promise<Map<string, EvidenceLocation>> {
  try {
    const rows = await invoke<MetadataRecord[]>('get_evidence_locations');
    const map = new Map<string, EvidenceLocation>();
    rows.forEach((row) => {
      const location = toLocation(row);
      if (location) map.set(location.evidenceId, location);
    });
    return map;
  } catch {
    return new Map();
  }
}

export function formatEvidenceLocation(location: EvidenceLocation): string {
  const accuracy = location.accuracy != null ? ` (±${Math.round(location.accuracy)} m)` : '';
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}${accuracy}`;
}

export function openStreetMapUrl(location: EvidenceLocation): string {
  const { latitude: lat, longitude: lon } = location;
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=17/${lat.toFixed(6)}/${lon.toFixed(6)}`;
}
