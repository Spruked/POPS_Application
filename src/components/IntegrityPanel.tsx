import type { IntegrityCheck } from '../types';

interface Props {
  result: IntegrityCheck | null;
}

export function IntegrityPanel({ result }: Props) {
  return (
    <div className="pops-integrity-panel">
      {result ? (
        <span>{result.success ? 'Verified' : 'Needs review'}</span>
      ) : (
        <span>No integrity check run.</span>
      )}
    </div>
  );
}
