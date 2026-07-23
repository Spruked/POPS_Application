interface DepthVisualizerProps {
  depthTrace: string[]
}

export function DepthVisualizer({ depthTrace }: DepthVisualizerProps) {
  return (
    <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
      <h2 className="text-sm font-semibold text-orb-text mb-3">Depth Trace</h2>
      <ol className="space-y-2">
        {depthTrace.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-3 text-xs text-orb-text-dim">
            <span className="text-orb-accent">{String(index + 1).padStart(2, '0')}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
