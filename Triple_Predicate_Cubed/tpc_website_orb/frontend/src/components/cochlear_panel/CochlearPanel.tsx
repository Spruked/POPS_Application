import { useTPCStore } from '@stores/tpcStore'

export function CochlearPanel() {
  const { result } = useTPCStore()

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-orb-text mb-4">Cochlear</h1>
      <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
        <div className="text-sm text-orb-text-dim">
          Axis 1 input normalization is wired through the backend input gateway.
        </div>
        <div className="mt-4 rounded border border-orb-border bg-orb-bg p-3 text-xs text-orb-text-dim">
          Last depth event: {result?.depth_trace?.[0] || 'none'}
        </div>
      </section>
    </div>
  )
}
