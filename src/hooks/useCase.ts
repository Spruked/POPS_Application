import { invoke } from '@tauri-apps/api/tauri';
import type { CaseAlert, CaseMatter, CaseOverviewData, CaseSummary, IntegrityCheck } from '../types';

const CASE_STORAGE_KEY = 'pops_case_matters_v1';
const ALERT_STORAGE_KEY = 'pops_case_alerts_v1';

function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__ || window.location.protocol === 'tauri:');
}

function defaultPrimaryCase(): CaseMatter {
  const now = new Date().toISOString();
  return { id: 'primary', parentCaseId: null, caseType: 'primary_custody', title: 'Primary Custody / Family Case', caseNumber: '', courtName: '', judgeName: '', status: 'active', lifecycleStage: 'filing', openedDate: '', closedDate: '', nextDeadline: '', nextHearingDate: '', orderIds: [], evidenceIds: [], eventIds: [], documentIds: [], notes: '', createdAt: now, updatedAt: now };
}

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function save<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }

export function useCase() {
  async function getCaseOverviewData(): Promise<CaseOverviewData> {
    if (isTauriRuntime()) return invoke<CaseOverviewData>('get_case_overview_data');
    const matters = load<CaseMatter[]>(CASE_STORAGE_KEY, [defaultPrimaryCase()]);
    const alerts = load<CaseAlert[]>(ALERT_STORAGE_KEY, []);
    return { primaryCase: matters.find((item) => item.id === 'primary') || defaultPrimaryCase(), relatedCases: matters.filter((item) => item.id !== 'primary'), alerts, activeOrderCount: 0, upcomingDeadlineCount: matters.filter((item) => Boolean(item.nextDeadline || item.nextHearingDate)).length, crossCaseEvidenceCount: matters.reduce((count, item) => count + item.evidenceIds.length, 0) };
  }

  async function saveCaseMatter(item: CaseMatter) {
    if (isTauriRuntime()) return invoke('save_case_matter', { item });
    const matters = load<CaseMatter[]>(CASE_STORAGE_KEY, [defaultPrimaryCase()]);
    save(CASE_STORAGE_KEY, [item, ...matters.filter((current) => current.id !== item.id)]);
  }

  async function deleteCaseMatter(id: string) {
    if (isTauriRuntime()) return invoke('delete_case_matter', { id });
    save(CASE_STORAGE_KEY, load<CaseMatter[]>(CASE_STORAGE_KEY, [defaultPrimaryCase()]).filter((item) => item.id !== id && item.id !== 'primary'));
  }

  async function saveCaseAlert(item: CaseAlert) {
    if (isTauriRuntime()) return invoke('save_case_alert', { item });
    const alerts = load<CaseAlert[]>(ALERT_STORAGE_KEY, []);
    save(ALERT_STORAGE_KEY, [item, ...alerts.filter((current) => current.id !== item.id)]);
  }

  async function resolveCaseAlert(id: string) {
    if (isTauriRuntime()) return invoke('resolve_case_alert', { id });
    save(ALERT_STORAGE_KEY, load<CaseAlert[]>(ALERT_STORAGE_KEY, []).map((item) => item.id === id ? { ...item, resolved: true } : item));
  }

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

  return { getCaseOverview, getCaseSummary, runIntegrityCheck, getCaseOverviewData, saveCaseMatter, deleteCaseMatter, saveCaseAlert, resolveCaseAlert };
}
