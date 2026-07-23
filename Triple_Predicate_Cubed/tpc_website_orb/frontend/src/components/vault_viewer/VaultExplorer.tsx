import { useTPCStore } from '@stores/tpcStore'

export function VaultExplorer() {
  const { result, history } = useTPCStore()
  const retrieval = result?.vault_retrieval

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-orb-text mb-4">Vaults</h1>
      <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Metric label="Last Result" value={retrieval?.result || 'none'} />
          <Metric label="Confidence" value={`${((retrieval?.confidence || 0) * 100).toFixed(1)}%`} />
          <Metric label="History" value={String(history.length)} />
        </div>
        <div className="mt-4 rounded border border-orb-border bg-orb-bg p-3 text-sm text-orb-text-dim">
          {retrieval?.recommendation || 'No vault retrieval has been recorded in this session.'}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-orb-text-dim">{label}</div>
      <div className="mt-1 font-semibold text-orb-text">{value}</div>
    </div>
  )
}
