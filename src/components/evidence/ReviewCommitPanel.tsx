import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { CheckCircle2, LockKeyhole } from 'lucide-react';

export interface ReviewCommitDraft {
  originalInput: string;
  systemSuggestion: string;
  finalVerifiedStatement?: string;
  categorySuggestion: string;
}

interface SealVerifiedRecordResult {
  id: string;
  recordHash: string;
  createdAt: string;
  auditAction: string;
}

interface ReviewCommitPanelProps {
  draft: ReviewCommitDraft;
  onSealed?: (result: SealVerifiedRecordResult) => void;
}

export default function ReviewCommitPanel({ draft, onSealed }: ReviewCommitPanelProps) {
  const initialStatement = useMemo(
    () => draft.finalVerifiedStatement || draft.systemSuggestion || draft.originalInput,
    [draft.finalVerifiedStatement, draft.originalInput, draft.systemSuggestion]
  );
  const [finalVerifiedStatement, setFinalVerifiedStatement] = useState(initialStatement);
  const [isSealing, setIsSealing] = useState(false);
  const [sealedRecord, setSealedRecord] = useState<SealVerifiedRecordResult | null>(null);
  const [error, setError] = useState('');

  async function sealRecord() {
    if (!finalVerifiedStatement.trim()) {
      setError('Final verified statement is required.');
      return;
    }

    setIsSealing(true);
    setError('');

    try {
      const result = await invoke<SealVerifiedRecordResult>('seal_verified_record', {
        originalInput: draft.originalInput,
        systemSuggestion: draft.systemSuggestion,
        finalVerifiedStatement,
        categorySuggestion: draft.categorySuggestion,
      });
      setSealedRecord(result);
      onSealed?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSealing(false);
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h3>Evidence Review & Commit</h3>
        {sealedRecord && (
          <span className="badge badge-green">
            <CheckCircle2 size={14} /> Sealed
          </span>
        )}
      </div>

      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Original Entry</label>
          <textarea value={draft.originalInput} readOnly />
        </div>

        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>System Suggestion</label>
          <textarea value={draft.systemSuggestion} readOnly />
        </div>

        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Final Verified Statement</label>
          <textarea
            value={finalVerifiedStatement}
            onChange={event => setFinalVerifiedStatement(event.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Category Suggestion</label>
          <input value={draft.categorySuggestion} readOnly />
        </div>
      </div>

      {error && <p style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      {sealedRecord && (
        <div className="hash-display" style={{ marginTop: 16 }}>
          {sealedRecord.recordHash}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={sealRecord}
          disabled={isSealing || Boolean(sealedRecord)}
        >
          <LockKeyhole size={16} />
          {isSealing ? 'Sealing...' : 'Confirm & Seal Record'}
        </button>
      </div>
    </section>
  );
}
