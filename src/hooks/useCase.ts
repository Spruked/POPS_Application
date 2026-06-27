import { invoke } from '@tauri-apps/api/tauri';
import type { CaseSummary, IntegrityCheck } from '../types';

export function useCase() {
  async function getCaseOverview(): Promise<CaseSummary[]> {
    const raw = await invoke<string>('get_case_overview');
    return JSON.parse(raw) as CaseSummary[];
  }

  async function getCaseSummary(caseId: string): Promise<CaseSummary> {
    const raw = await invoke<string>('get_case_summary', { caseId });
    return JSON.parse(raw) as CaseSummary;
  }

  async function runIntegrityCheck(): Promise<IntegrityCheck> {
    const raw = await invoke<string>('run_full_integrity_check');
    return JSON.parse(raw) as IntegrityCheck;
  }

  return { getCaseOverview, getCaseSummary, runIntegrityCheck };
}
