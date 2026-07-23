import { useTPCStore } from '@stores/tpcStore'

const beamColors: Record<string, string> = {
  Hume: 'text-orb-hume',
  Kant: 'text-orb-kant',
  Locke: 'text-orb-locke',
  Spinoza: 'text-orb-spinoza',
}

export function BeamMonitor() {
  const { result } = useTPCStore()
  const verdicts = result?.philosopher_verdicts || {}

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-orb-text mb-4">Beams</h1>
      <div className="grid grid-cols-2 gap-4">
        {['Hume', 'Kant', 'Locke', 'Spinoza'].map((name) => {
          const verdict = verdicts[name]
          const confidence = verdict?.confidence || 0
          return (
            <section key={name} className="bg-orb-panel rounded-lg border border-orb-border p-4">
              <h2 className={`text-sm font-semibold ${beamColors[name]}`}>{name}</h2>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-orb-bg">
                <div className="h-full bg-orb-accent" style={{ width: `${confidence * 100}%` }} />
              </div>
              <div className="mt-2 text-xs text-orb-text-dim">
                {(confidence * 100).toFixed(1)}% / {verdict?.status || 'idle'}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
