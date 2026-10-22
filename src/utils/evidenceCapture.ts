import { invoke } from '@tauri-apps/api/core';
import { generateId } from './helpers';
import { getPlatformCapabilities } from './platform';
import { getCaptureLocation, locationPermission, type CaptureLocation } from './location';
import type { Evidence } from '../types';

type ImportedEvidenceFile = {
  filePath: string;
  sha256: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  originalModifiedAt?: string;
  importedAt: string;
};

type IntegrityCheckResult = { status: string; expectedHash: string; actualHash?: string | null };

export type SealedCapture = {
  evidence: Evidence;
  integrity: string;
  location: CaptureLocation | null;
  /** True when the user asked for location but it could not be read. */
  locationMissing: boolean;
};

/** Fired after a capture is sealed so mounted vault views can reload from SQLite. */
export const EVIDENCE_SEALED_EVENT = 'pops:evidence-sealed';

function formatLocation(location: CaptureLocation) {
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(location.accuracy)} m)`;
}

/**
 * Seals a camera photo with the existing vault pipeline, unchanged:
 * import_evidence_file (original bytes + SHA-256) → save_evidence (EVIDENCE_SAVED)
 * → optional submit_evidence (GPS into evidence_metadata, EVIDENCE_METADATA_SUBMITTED)
 * → verify_evidence_integrity (re-hash of the stored original, logged).
 */
export async function sealCameraPhoto(file: File, attachLocation: boolean, fromGallery = false): Promise<SealedCapture> {
  const caps = await getPlatformCapabilities();
  const capturedAt = new Date();
  // Read the position at capture time, in parallel with reading the bytes. Never prompts here.
  const locationPromise =
    attachLocation && (await locationPermission(false)) === 'granted' ? getCaptureLocation() : Promise.resolve(null);

  const evidenceId = generateId();
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const imported = await invoke<ImportedEvidenceFile>('import_evidence_file', {
    evidenceId,
    fileName: file.name || `camera-${capturedAt.getTime()}.jpg`,
    fileType: file.type || 'image/jpeg',
    originalModifiedAt: new Date(file.lastModified || capturedAt.getTime()).toISOString(),
    bytes,
  });
  const location = await locationPromise;

  const source = fromGallery
    ? `Picked from the device photo library in POPS (${caps.platform}); file last modified ${new Date(file.lastModified || capturedAt.getTime()).toISOString()}. File preserved exactly as received and sealed with SHA-256 at import.`
    : `Captured with the device camera in POPS (${caps.platform}). Original preserved unaltered and sealed with SHA-256 at import.`;
  const baseTag = fromGallery ? 'gallery-import' : 'camera-capture';
  const evidence: Evidence = {
    id: evidenceId,
    caseId: 'primary',
    type: 'photo',
    title: `${fromGallery ? 'Gallery photo' : 'Camera capture'} ${capturedAt.toLocaleString()}`,
    description: '',
    date: capturedAt.toISOString().split('T')[0],
    filePath: imported.filePath,
    sha256: imported.sha256,
    tags: location ? [baseTag, 'location-attached'] : [baseTag],
    fileName: imported.fileName,
    fileSize: imported.fileSize,
    fileType: imported.fileType,
    trustGlyphRisk: 'low',
    sourceDescription: location ? `${source} Location at capture: ${formatLocation(location)}.` : source,
    originalModifiedAt: imported.originalModifiedAt,
    importedAt: imported.importedAt,
    createdAt: capturedAt.toISOString(),
  };
  await invoke('save_evidence', { item: evidence });

  if (location) {
    await invoke('submit_evidence', {
      payload: JSON.stringify({
        evidence_id: evidenceId,
        document_id: evidenceId,
        file_path: imported.filePath,
        file_hash: imported.sha256,
        exif_json: JSON.stringify({
          source: 'device_location_at_capture',
          accuracy_m: location.accuracy,
          position_timestamp: new Date(location.timestamp).toISOString(),
          captured_at: capturedAt.toISOString(),
        }),
        gps_lat: location.latitude,
        gps_lon: location.longitude,
        device_identity: `POPS ${caps.platform}`,
      }),
    });
  }

  const integrity = await invoke<IntegrityCheckResult>('verify_evidence_integrity', {
    evidenceId,
    filePath: imported.filePath,
    expectedHash: imported.sha256,
  });

  window.dispatchEvent(new CustomEvent(EVIDENCE_SEALED_EVENT, { detail: { id: evidenceId } }));
  return { evidence, integrity: integrity.status, location, locationMissing: attachLocation && !location };
}

export { formatLocation };
