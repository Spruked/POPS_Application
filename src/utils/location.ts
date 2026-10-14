import { checkPermissions, getCurrentPosition, requestPermissions } from '@tauri-apps/plugin-geolocation';
import { getPlatformCapabilities } from './platform';

/** granted · prompt (can still ask) · denied (blocked; user must change it in Settings) · unavailable */
export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unavailable';

export type CaptureLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

const PREF_KEY = 'pops.capture.attachLocation';

export function readAttachLocationPref(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeAttachLocationPref(value: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, String(value));
  } catch {
    /* preference is optional */
  }
}

function browserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  );
}

/**
 * Checks location permission and, only when `request` is true (explicit user
 * intent), asks for it. Mobile uses the Tauri geolocation plugin; desktop uses
 * the webview's geolocation where the OS provides it.
 */
export async function locationPermission(request: boolean): Promise<LocationPermission> {
  const caps = await getPlatformCapabilities();
  if (caps.mobile) {
    try {
      let status = await checkPermissions();
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      if (!request) return 'prompt';
      // 'prompt' or 'prompt-with-rationale' (Android: denied once, may ask again)
      status = await requestPermissions(['location']);
      if (status.location === 'granted') return 'granted';
      return status.location === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'unavailable';
    }
  }

  if (!navigator.geolocation) return 'unavailable';
  try {
    const state = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (state?.state === 'granted') return 'granted';
    if (state?.state === 'denied') return 'denied';
  } catch {
    /* permissions API not available in every webview */
  }
  if (!request) return 'prompt';
  try {
    await browserPosition();
    return 'granted';
  } catch (error) {
    return (error as GeolocationPositionError)?.code === 1 ? 'denied' : 'unavailable';
  }
}

/** Current position for a capture, or null if it can't be read. Never prompts. */
export async function getCaptureLocation(): Promise<CaptureLocation | null> {
  try {
    const caps = await getPlatformCapabilities();
    const position = caps.mobile
      ? await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
      : await browserPosition();
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  } catch {
    return null;
  }
}

export const LOCATION_SETTINGS_HELP =
  'Location is turned off for POPS. To attach locations, allow it in your device Settings → POPS (iOS) or Settings → Apps → POPS → Permissions → Location (Android), then tap Check again.';
