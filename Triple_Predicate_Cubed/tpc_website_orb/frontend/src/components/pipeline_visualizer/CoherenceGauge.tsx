interface CoherenceGaugeProps {
  score: number
  status: string
}

export function CoherenceGauge({ score, status }: CoherenceGaugeProps) {
  const boundedScore = Math.max(0, Math.min(1, score))

  return (
    <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-orb-text">Coherence</h2>
        <span className="text-xs text-orb-text-dim">{status}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-orb-bg">
        <div className="h-full bg-orb-success" style={{ width: `${boundedScore * 100}%` }} />
      </div>
      <div className="mt-2 text-right text-xs text-orb-text-dim">{(boundedScore * 100).toFixed(1)}%</div>
    </section>
  )
}
