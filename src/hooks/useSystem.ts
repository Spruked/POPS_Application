import { invoke } from '@tauri-apps/api/tauri';
import type { DiagnosticsReport, FullCaseBundleReceipt } from '../types';

export function useSystem() {
  async function getDiagnostics(): Promise<DiagnosticsReport> {
    const raw = await invoke<string>('get_app_diagnostics');
    return JSON.parse(raw) as DiagnosticsReport;
  }

  async function clearRuntimeCache(): Promise<{ success: boolean; timestamp_utc: string }> {
    const raw = await invoke<string>('clear_runtime_cache');
    return JSON.parse(raw) as { success: boolean; timestamp_utc: string };
  }

  async function rebuildAllDocuments(): Promise<{ success: boolean; timestamp_utc: string }> {
    const raw = await invoke<string>('rebuild_all_documents');
    return JSON.parse(raw) as { success: boolean; timestamp_utc: string };
  }

  async function exportFullCaseBundle(caseId: string): Promise<FullCaseBundleReceipt> {
    const raw = await invoke<string>('export_full_case_bundle', { caseId });
    return JSON.parse(raw) as FullCaseBundleReceipt;
  }

  return { getDiagnostics, clearRuntimeCache, rebuildAllDocuments, exportFullCaseBundle };
}
