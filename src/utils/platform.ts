import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** Mirrors `PlatformCapabilities` in src-tauri/src/local_agent.rs. */
export type PlatformCapabilities = {
  platform: string;
  mobile: boolean;
  sqlite_vault: boolean;
  evidence_import: boolean;
  evidence_hashing: boolean;
  reports_export: boolean;
  guided_assistant: boolean;
  local_ai: boolean;
  ocr: boolean;
  voice_output: boolean;
  dictation_service: boolean;
  research_substrate: boolean;
};

const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

/** Used only when the Rust backend is unreachable (e.g. `npm run dev` in a browser). */
function fallbackCapabilities(): PlatformCapabilities {
  const mobile = typeof navigator !== 'undefined' && MOBILE_UA.test(navigator.userAgent);
  return {
    platform: mobile ? 'mobile-web' : 'web',
    mobile,
    sqlite_vault: false,
    evidence_import: false,
    evidence_hashing: false,
    reports_export: false,
    guided_assistant: true,
    local_ai: !mobile,
    ocr: !mobile,
    voice_output: !mobile,
    dictation_service: !mobile,
    research_substrate: !mobile,
  };
}

let cached: Promise<PlatformCapabilities> | null = null;

export function getPlatformCapabilities(): Promise<PlatformCapabilities> {
  if (!cached) {
    cached = invoke<PlatformCapabilities>('platform_capabilities').catch(() => fallbackCapabilities());
  }
  return cached;
}

export function usePlatformCapabilities(): PlatformCapabilities | null {
  const [caps, setCaps] = useState<PlatformCapabilities | null>(null);
  useEffect(() => {
    let active = true;
    void getPlatformCapabilities().then((result) => {
      if (active) setCaps(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return caps;
}

/** Phone layout breakpoint — matches the existing 760px rules in index.css. */
export const COMPACT_QUERY = '(max-width: 760px)';

export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
