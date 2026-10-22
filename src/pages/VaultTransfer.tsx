import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { usePlatformCapabilities } from '../utils/platform';

type TransferSummary = { destination: string; fileCount: number; totalBytes: number; evidenceCount: number; packageHash: string };
type TransferInspection = {
  createdAt: string;
  sourcePlatform: string;
  appVersion: string;
  evidenceCount: number;
  chainEntryCount: number;
  fileCount: number;
  totalBytes: number;
  packageHash: string;
  packageHashValid: boolean;
  currentEvidenceCount: number;
};
type RestoreReport = {
  packageHash: string;
  filesRestored: number;
  evidenceCount: number;
  originalsVerified: number;
  originalsMismatched: string[];
  originalsMissing: string[];
  preRestoreSnapshot: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Settings → Vault Transfer. Moves the full vault (SQLite records + preserved
 * originals) between devices as a .popsvault package. Every file is hashed on
 * export and re-verified on restore; nothing changes unless all checks pass.
 */
export default function VaultTransfer() {
  const caps = usePlatformCapabilities();
  const [busy, setBusy] = useState<'export' | 'inspect' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<TransferSummary | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TransferInspection | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  async function handleExport() {
    setError(null);
    setExported(null);
    const date = new Date().toISOString().split('T')[0];
    const destination = await save({
      defaultPath: `pops-vault-${date}.popsvault`,
      ...(caps?.mobile ? {} : { filters: [{ name: 'POPS Vault Transfer', extensions: ['popsvault'] }] }),
    });
    if (!destination) return;
    setBusy('export');
    try {
      setExported(await invoke<TransferSummary>('export_vault_transfer', { destination }));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleChoose() {
    setError(null);
    setReport(null);
    setInspection(null);
    setConfirmReplace(false);
    // Android/iOS pickers can't filter by a custom extension, so mobile shows all files.
    const picked = await open({
      multiple: false,
      directory: false,
      ...(caps?.mobile ? {} : { filters: [{ name: 'POPS Vault Transfer', extensions: ['popsvault', 'zip'] }] }),
    });
    const path = Array.isArray(picked) ? picked[0] : picked;
    if (!path) return;
    setSource(path);
    setBusy('inspect');
    try {
      setInspection(await invoke<TransferInspection>('inspect_vault_transfer', { source: path }));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    if (!source) return;
    setError(null);
    setBusy('restore');
    try {
      setReport(await invoke<RestoreReport>('restore_vault_transfer', { source }));
      setInspection(null);
      setConfirmReplace(false);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  const needsConfirm = !!inspection && inspection.currentEvidenceCount > 0;

  return (
    <div className="page vault-transfer" data-testid="vault-transfer-page">
      <div className="page-header">
        <h2>Vault Transfer</h2>
      </div>
      <p className="vault-transfer-intro">
        Move your full POPS vault (case records, evidence originals, chain of custody and audit ledger) to another device.
        Every file is fingerprinted with SHA-256 when the package is made and checked again before anything is restored.
      </p>

      {error && (
        <div className="vault-transfer-alert error" role="alert" data-testid="vault-transfer-error">
          <AlertTriangle size={16} /> <span>{error}</span>
        </div>
      )}

      <section className="card vault-transfer-card">
        <h3><ArrowUpFromLine size={18} /> Send this vault</h3>
        <p>Create a <code>.popsvault</code> package on this device, then copy it to your phone (USB, cloud drive, or AirDrop).</p>
        <button type="button" className="btn btn-primary" onClick={() => void handleExport()} disabled={!!busy} data-testid="vault-transfer-export-button">
          {busy === 'export' ? <Loader2 size={16} /> : <ArrowUpFromLine size={16} />} {busy === 'export' ? 'Creating package…' : 'Create transfer package'}
        </button>
        {exported && (
          <div className="vault-transfer-result" data-testid="vault-transfer-export-result">
            <CheckCircle2 size={16} />
            <div>
              <strong>Package created: {exported.fileCount} files, {formatBytes(exported.totalBytes)}, {exported.evidenceCount} evidence items</strong>
              <span>Package fingerprint</span>
              <code>{exported.packageHash}</code>
            </div>
          </div>
        )}
      </section>

      <section className="card vault-transfer-card">
        <h3><ArrowDownToLine size={18} /> Restore a vault on this device</h3>
        <p>Choose a <code>.popsvault</code> package. POPS checks it first and shows what it contains before anything changes.</p>
        <button type="button" className="btn btn-secondary" onClick={() => void handleChoose()} disabled={!!busy} data-testid="vault-transfer-choose-button">
          {busy === 'inspect' ? <Loader2 size={16} /> : <ArrowDownToLine size={16} />} {busy === 'inspect' ? 'Checking package…' : 'Choose transfer package'}
        </button>

        {inspection && (
          <div className="vault-transfer-inspection" data-testid="vault-transfer-inspection">
            <div className={`vault-transfer-alert ${inspection.packageHashValid ? 'ok' : 'error'}`} data-testid="vault-transfer-package-status">
              {inspection.packageHashValid ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
              <span>{inspection.packageHashValid ? 'Package manifest is intact.' : 'Package manifest was altered. It cannot be restored.'}</span>
            </div>
            <dl>
              <dt>Created</dt><dd>{new Date(inspection.createdAt).toLocaleString()} on {inspection.sourcePlatform} (POPS {inspection.appVersion})</dd>
              <dt>Contents</dt><dd>{inspection.evidenceCount} evidence items · {inspection.chainEntryCount} custody entries · {inspection.fileCount} files · {formatBytes(inspection.totalBytes)}</dd>
              <dt>Fingerprint</dt><dd><code>{inspection.packageHash}</code></dd>
            </dl>
            {needsConfirm && (
              <label className="vault-transfer-confirm" data-testid="vault-transfer-replace-warning">
                <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} data-testid="vault-transfer-confirm-checkbox" />
                <span>
                  This device already has {inspection.currentEvidenceCount} evidence items. POPS restores only if every record and original on
                  this device is already in the package unchanged. Otherwise the restore is refused and nothing on this device changes.
                  When it proceeds, a snapshot of the current database is saved first and its fingerprint is recorded in the audit ledger.
                </span>
              </label>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRestore()}
              disabled={!!busy || !inspection.packageHashValid || (needsConfirm && !confirmReplace)}
              data-testid="vault-transfer-restore-button"
            >
              {busy === 'restore' ? <Loader2 size={16} /> : <ShieldCheck size={16} />} {busy === 'restore' ? 'Verifying and restoring…' : 'Verify and restore'}
            </button>
          </div>
        )}

        {report && (
          <div className="vault-transfer-result" data-testid="vault-transfer-restore-result">
            <CheckCircle2 size={16} />
            <div>
              <strong>Vault restored: {report.evidenceCount} evidence items, {report.filesRestored} files</strong>
              <span data-testid="vault-transfer-verified-count">
                {report.originalsVerified} originals re-verified against their recorded SHA-256.
                {report.originalsMismatched.length > 0 && ` ${report.originalsMismatched.length} did not match and are flagged in chain of custody.`}
                {report.originalsMissing.length > 0 && ` ${report.originalsMissing.length} had no original file in the package.`}
              </span>
              <span>Previous database kept at: {report.preRestoreSnapshot}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
