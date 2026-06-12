import { useState } from 'react';
import { FileText, Download, Trash2, Clock, AlertTriangle, Shield, Calendar } from 'lucide-react';
import { useReportStore, useEvidenceStore, useOrderStore, useViolationStore, useEventStore, useProfileStore } from '../hooks/useStore';
import { useToast } from '../hooks/useToast';
import { generateId, formatDate, formatDateTime, downloadTextFile } from '../utils/helpers';
import Modal from '../components/Modal';
import type { Report } from '../types';

const REPORT_TYPES = [
  { value: 'timeline', label: 'Timeline Report', desc: 'Chronological log of all events and evidence' },
  { value: 'violation', label: 'Violation Report', desc: 'All violations with severity and descriptions' },
  { value: 'evidence', label: 'Evidence Summary', desc: 'Complete evidence inventory with hashes' },
  { value: 'summary', label: 'Case Summary', desc: 'High-level overview of the entire case' },
  { value: 'attorney', label: 'Attorney Packet', desc: 'Formatted packet ready for attorney review' },
];

export default function Reports() {
  const { items: reports, add, remove } = useReportStore();
  const evidence = useEvidenceStore();
  const orders = useOrderStore();
  const violations = useViolationStore();
  const events = useEventStore();
  const { profile } = useProfileStore();
  const { show } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [selectedType, setSelectedType] = useState('timeline');

  function generateReportContent(type: string): string {
    const now = formatDateTime(new Date().toISOString());
    let content = '';

    switch (type) {
      case 'timeline': {
        const allItems = [
          ...evidence.items.map(e => ({ date: e.date, text: `[EVIDENCE] ${e.title} — ${e.type} — ${e.description.slice(0, 120)}` })),
          ...orders.items.map(o => ({ date: o.orderDate, text: `[COURT ORDER] ${o.title} — ${o.courtName}` })),
          ...violations.items.map(v => ({ date: v.date, text: `[VIOLATION] ${v.severity.toUpperCase()} — ${v.description.slice(0, 120)}` })),
          ...events.items.map(e => ({ date: e.date, text: `[${e.type.toUpperCase()}] ${e.title} — ${e.description.slice(0, 120)}` })),
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        content = `TIMELINE REPORT
Case: ${profile.caseName}
Generated: ${now}
${'='.repeat(60)}

`;
        allItems.forEach(item => {
          content += `${formatDate(item.date)} — ${item.text}

`;
        });
        break;
      }
      case 'violation': {
        content = `VIOLATION REPORT
Case: ${profile.caseName}
Generated: ${now}
${'='.repeat(60)}

`;
        violations.items.forEach(v => {
          const order = orders.items.find(o => o.id === v.orderId);
          content += `DATE: ${formatDate(v.date)}
ORDER: ${order?.title || 'Unknown'}
SEVERITY: ${v.severity.toUpperCase()}
STATUS: ${v.status}
DESCRIPTION: ${v.description}
${'-'.repeat(40)}

`;
        });
        break;
      }
      case 'evidence': {
        content = `EVIDENCE INVENTORY
Case: ${profile.caseName}
Generated: ${now}
${'='.repeat(60)}

`;
        evidence.items.forEach(e => {
          content += `TITLE: ${e.title}
TYPE: ${e.type}
DATE: ${formatDate(e.date)}
SHA-256: ${e.sha256}
TAGS: ${e.tags.join(', ')}
DESCRIPTION: ${e.description}
${'-'.repeat(40)}

`;
        });
        break;
      }
      case 'summary': {
        content = `CASE SUMMARY
${'='.repeat(60)}

`;
        content += `CASE NAME: ${profile.caseName}
CLIENT: ${profile.clientName}
OPPOSING PARTY: ${profile.opposingParty}
ATTORNEY: ${profile.attorneyName}
COURT: ${profile.courtName}
DOCKET: ${profile.docketNumber}

`;
        content += `EVIDENCE ITEMS: ${evidence.items.length}
COURT ORDERS: ${orders.items.length}
VIOLATIONS: ${violations.items.length}
EVENTS LOGGED: ${events.items.length}

`;
        content += `NOTES:
${profile.notes}
`;
        break;
      }
      case 'attorney': {
        content = `ATTORNEY PACKET — PROOF OF PRESENCE
${'='.repeat(60)}

`;
        content += `TO: ${profile.attorneyName}
CASE: ${profile.caseName}
DOCKET: ${profile.docketNumber}
COURT: ${profile.courtName}
DATE: ${now}

`;
        content += `EXECUTIVE SUMMARY:
This packet contains ${evidence.items.length} evidence items, ${orders.items.length} court orders, and ${violations.items.length} documented violations.

`;
        content += `EVIDENCE INVENTORY:
`;
        evidence.items.forEach((e, i) => {
          content += `${i + 1}. ${e.title} (${e.type}) — Hash: ${e.sha256.slice(0, 32)}...
`;
        });
        content += `
VIOLATIONS SUMMARY:
`;
        violations.items.forEach((v, i) => {
          content += `${i + 1}. ${formatDate(v.date)} — ${v.severity.toUpperCase()} — ${v.description.slice(0, 100)}
`;
        });
        content += `
COURT ORDERS:
`;
        orders.items.forEach((o, i) => {
          content += `${i + 1}. ${o.title} — ${o.courtName} — ${formatDate(o.orderDate)}
`;
        });
        break;
      }
    }
    return content;
  }

  function handleGenerate() {
    const content = generateReportContent(selectedType);
    const report: Report = {
      id: generateId(),
      title: `${REPORT_TYPES.find(r => r.value === selectedType)?.label} — ${formatDate(new Date().toISOString())}`,
      type: selectedType as Report['type'],
      content,
      generatedAt: new Date().toISOString(),
    };
    add(report);
    show('Report generated');
    setIsModalOpen(false);
  }

  function handleDownload(report: Report) {
    const filename = `report_${report.type}_${new Date(report.generatedAt).toISOString().split('T')[0]}.txt`;
    downloadTextFile(filename, report.content);
    show('Report downloaded');
  }

  return (
    <div>
      <div className="page-header">
        <h2>Reports</h2>
        <p>Generate formatted reports and attorney packets from your case data</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <FileText size={16} /> Generate Report
        </button>
      </div>

      <div className="card">
        {reports.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <p>No reports generated yet. Create your first report above.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Generated</th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.title}</strong></td>
                    <td><span className="badge badge-blue">{r.type}</span></td>
                    <td>{formatDateTime(r.generatedAt)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPreviewReport(r)}>Preview</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(r)}><Download size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { remove(r.id); show('Report deleted'); }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Generate Report"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerate}>Generate</button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {REPORT_TYPES.map(rt => (
            <div
              key={rt.value}
              onClick={() => setSelectedType(rt.value)}
              style={{
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${selectedType === rt.value ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                background: selectedType === rt.value ? 'rgba(74,158,255,0.08)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{rt.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{rt.desc}</div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={!!previewReport}
        onClose={() => setPreviewReport(null)}
        title={previewReport?.title || 'Report Preview'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPreviewReport(null)}>Close</button>
            {previewReport && (
              <button className="btn btn-primary" onClick={() => handleDownload(previewReport)}>
                <Download size={16} /> Download
              </button>
            )}
          </>
        }
      >
        <div className="report-preview">{previewReport?.content}</div>
      </Modal>
    </div>
  );
}
