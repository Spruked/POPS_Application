import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { generateId } from '../../utils/helpers';
import { getPlatformCapabilities } from '../../utils/platform';
import type { Evidence } from '../../types';

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

type CameraCaptureProps = {
  add: (item: Evidence) => Promise<void>;
  onSealed: (item: Evidence, integrity: string) => void;
  onError: (message: string) => void;
};

/**
 * One-tap camera evidence. Reuses the existing vault pipeline unchanged:
 * import_evidence_file (original bytes preserved + SHA-256) → save_evidence
 * (EVIDENCE_SAVED chain row) → verify_evidence_integrity (re-hash of the stored
 * original, logged to chain of custody). The photo is never resized or re-encoded.
 */
export default function CameraCapture({ add, onSealed, onError }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ title: string; sha256: string; integrity: string } | null>(null);

  async function handleCapture(file: File | undefined) {
    if (!file) return; // user cancelled or camera access was declined
    setBusy(true);
    try {
      const caps = await getPlatformCapabilities();
      const capturedAt = new Date();
      const evidenceId = generateId();
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const imported = await invoke<ImportedEvidenceFile>('import_evidence_file', {
        evidenceId,
        fileName: file.name || `camera-${capturedAt.getTime()}.jpg`,
        fileType: file.type || 'image/jpeg',
        originalModifiedAt: new Date(file.lastModified || capturedAt.getTime()).toISOString(),
        bytes,
      });

      const evidence: Evidence = {
        id: evidenceId,
        caseId: 'primary',
        type: 'photo',
        title: `Camera capture ${capturedAt.toLocaleString()}`,
        description: '',
        date: capturedAt.toISOString().split('T')[0],
        filePath: imported.filePath,
        sha256: imported.sha256,
        tags: ['camera-capture'],
        fileName: imported.fileName,
        fileSize: imported.fileSize,
        fileType: imported.fileType,
        trustGlyphRisk: 'low',
        sourceDescription: `Captured with the device camera in POPS (${caps.platform}). Original preserved unaltered and sealed with SHA-256 at import.`,
        originalModifiedAt: imported.originalModifiedAt,
        importedAt: imported.importedAt,
        createdAt: capturedAt.toISOString(),
      };
      await add(evidence);

      const integrity = await invoke<IntegrityCheckResult>('verify_evidence_integrity', {
        evidenceId,
        filePath: imported.filePath,
        expectedHash: imported.sha256,
      });

      setLast({ title: evidence.title, sha256: imported.sha256, integrity: integrity.status });
      onSealed(evidence, integrity.status);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="camera-capture">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="camera-capture-input"
        onChange={(event) => void handleCapture(event.target.files?.[0])}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        data-testid="camera-capture-button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 size={16} /> : <Camera size={16} />} {busy ? 'Sealing…' : 'Capture Photo'}
      </button>
      <p className="camera-capture-hint">
        Opens your camera. The original photo is saved unaltered and sealed with SHA-256.
      </p>
      {last && (
        <div className="camera-capture-result" data-testid="camera-capture-result" role="status">
          <CheckCircle2 size={16} />
          <div>
            <strong>{last.title}</strong>
            <span>Integrity: {last.integrity}</span>
            <code>{last.sha256}</code>
          </div>
        </div>
      )}
    </div>
  );
}
