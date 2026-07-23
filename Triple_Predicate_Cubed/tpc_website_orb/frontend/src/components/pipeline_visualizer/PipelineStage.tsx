interface PipelineStageProps {
  name: string
  desc: string
  active: boolean
  completed: boolean | null
}

export function PipelineStage({ name, desc, active, completed }: PipelineStageProps) {
  const stateClass = active
    ? 'border-orb-accent text-orb-accent'
    : completed
      ? 'border-orb-success text-orb-success'
      : 'border-orb-border text-orb-text-dim'

  return (
    <div className={`min-h-20 rounded-lg border p-3 ${stateClass}`}>
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-1 text-xs text-orb-text-dim">{desc}</div>
    </div>
  )
}
