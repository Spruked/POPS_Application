import type { PipelineResult } from '@stores/tpcStore'

interface OutputPanelProps {
  result: PipelineResult | null
}

export function OutputPanel({ result }: OutputPanelProps) {
  return (
    <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
      <h2 className="text-sm font-semibold text-orb-text mb-3">Output</h2>
      {result ? (
        <div className="space-y-3">
          <pre className="min-h-32 whitespace-pre-wrap rounded border border-orb-border bg-orb-bg p-3 text-xs text-orb-text">
            {result.output || result.status}
          </pre>
          <div className="grid grid-cols-2 gap-2 text-xs text-orb-text-dim">
            <div>Confidence: {((result.confidence || 0) * 100).toFixed(1)}%</div>
            <div>Time: {(result.processing_time_ms || 0).toFixed(1)} ms</div>
            <div className="col-span-2 truncate">Glyph: {result.glyph_signature || 'none'}</div>
          </div>
        </div>
      ) : (
        <div className="rounded border border-orb-border bg-orb-bg p-3 text-sm text-orb-text-dim">
          Awaiting pipeline result.
        </div>
      )}
    </section>
  )
}
