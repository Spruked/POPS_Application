import { useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { formatLocation, sealCameraPhoto, type SealedCapture } from '../../utils/evidenceCapture';
import {
  LOCATION_SETTINGS_HELP,
  locationPermission,
  readAttachLocationPref,
  writeAttachLocationPref,
  type LocationPermission,
} from '../../utils/location';
import type { Evidence } from '../../types';

type CameraCaptureProps = {
  onSealed: (item: Evidence, integrity: string) => void;
  onError: (message: string) => void;
};

/** One-tap camera evidence with optional, opt-in capture location. */
export default function CameraCapture({ onSealed, onError }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SealedCapture | null>(null);
  const [attachLocation, setAttachLocation] = useState(readAttachLocationPref);
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [checking, setChecking] = useState(false);

  async function enableLocation() {
    setChecking(true);
    const status = await locationPermission(true); // explicit user intent: the toggle
    setPermission(status);
    setChecking(false);
    const enabled = status === 'granted';
    setAttachLocation(enabled);
    writeAttachLocationPref(enabled);
  }

  function toggleLocation(next: boolean) {
    if (next) {
      void enableLocation();
      return;
    }
    setAttachLocation(false);
    setPermission(null);
    writeAttachLocationPref(false);
  }

  async function handleCapture(file: File | undefined) {
    if (!file) return; // cancelled, or camera access declined
    setBusy(true);
    try {
      const result = await sealCameraPhoto(file, attachLocation);
      setLast(result);
      onSealed(result.evidence, result.integrity);
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
      <div className="camera-capture-row">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          data-testid="camera-capture-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 size={16} /> : <Camera size={16} />} {busy ? 'Sealing…' : 'Capture Photo'}
        </button>
        <label className="camera-location-toggle" data-testid="capture-location-toggle">
          <input
            type="checkbox"
            checked={attachLocation}
            disabled={checking}
            onChange={(event) => toggleLocation(event.target.checked)}
          />
          <MapPin size={15} /> {checking ? 'Checking location…' : 'Attach location'}
        </label>
      </div>
      <p className="camera-capture-hint">
        Opens your camera. The original photo is saved unaltered and sealed with SHA-256.
        {' '}Attach location adds where the photo was taken to the evidence record; it stays in your local vault.
      </p>
      {permission === 'denied' && (
        <div className="camera-location-notice" role="alert" data-testid="capture-location-blocked">
          <span>{LOCATION_SETTINGS_HELP}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void enableLocation()} data-testid="capture-location-recheck">
            Check again
          </button>
        </div>
      )}
      {permission === 'prompt' && (
        <div className="camera-location-notice" role="status" data-testid="capture-location-prompt">
          <span>Location was not allowed. Photos are still sealed without it. You can turn this on again any time.</span>
        </div>
      )}
      {permission === 'unavailable' && (
        <div className="camera-location-notice" role="status" data-testid="capture-location-unavailable">
          <span>Location isn't available on this device. Photos are still sealed without it.</span>
        </div>
      )}
      {last && (
        <div className="camera-capture-result" data-testid="camera-capture-result" role="status">
          <CheckCircle2 size={16} />
          <div>
            <strong>{last.evidence.title}</strong>
            <span>Integrity: {last.integrity}</span>
            <span>
              {last.location
                ? `Location: ${formatLocation(last.location)}`
                : last.locationMissing
                  ? 'Location could not be read; sealed without it.'
                  : 'No location attached.'}
            </span>
            <code>{last.evidence.sha256}</code>
          </div>
        </div>
      )}
    </div>
  );
}
