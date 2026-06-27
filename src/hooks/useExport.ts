import { invoke } from '@tauri-apps/api/tauri';
import type { ExportReceipt } from '../types';

export interface PdfExportPayload {
  document_id: string;
  title: string;
  include_history: boolean;
}

export function useExport() {
  async function exportPdf(payload: PdfExportPayload): Promise<ExportReceipt> {
    const raw = await invoke<string>('export_pdf', { payload: JSON.stringify(payload) });
    return JSON.parse(raw) as ExportReceipt;
  }

  async function exportTimeline(documentId: string): Promise<ExportReceipt> {
    const raw = await invoke<string>('export_timeline', { documentId });
    return JSON.parse(raw) as ExportReceipt;
  }

  async function exportEvidenceIndex(): Promise<ExportReceipt> {
    const raw = await invoke<string>('export_evidence_index');
    return JSON.parse(raw) as ExportReceipt;
  }

  async function exportAttorneyPacket(caseId: string): Promise<ExportReceipt> {
    const raw = await invoke<string>('export_attorney_packet', { caseId });
    return JSON.parse(raw) as ExportReceipt;
  }

  return { exportPdf, exportTimeline, exportEvidenceIndex, exportAttorneyPacket };
}
