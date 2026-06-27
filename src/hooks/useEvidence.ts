import { invoke } from '@tauri-apps/api/tauri';
import type { EvidenceRecord } from '../types';

export interface EvidencePayload {
  evidence_id: string;
  document_id: string;
  file_path: string;
  file_hash: string;
  exif_json: string;
  gps_lat?: number;
  gps_lon?: number;
  device_identity: string;
}

export interface ChainOfCustodyPayload {
  evidence_id: string;
  operation: string;
  actor_identity: string;
  notes?: string;
}

export function useEvidence() {
  async function submitEvidence(payload: EvidencePayload) {
    return invoke<string>('submit_evidence', {
      payload: JSON.stringify(payload),
    });
  }

  async function getMetadata(evidenceId: string): Promise<EvidenceRecord | null> {
    const raw = await invoke<string>('get_evidence_metadata', { evidenceId });
    return JSON.parse(raw) as EvidenceRecord | null;
  }

  async function recordChain(payload: ChainOfCustodyPayload) {
    return invoke<string>('record_chain_of_custody', {
      payload: JSON.stringify(payload),
    });
  }

  return { submitEvidence, getMetadata, recordChain };
}
