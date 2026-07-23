interface InputPanelProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isProcessing: boolean
}

export function InputPanel({ value, onChange, onSubmit, isProcessing }: InputPanelProps) {
  return (
    <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-orb-text">Input</h2>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || isProcessing}
          className="rounded bg-orb-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? 'Processing' : 'Run'}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-32 w-full resize-none rounded border border-orb-border bg-orb-bg p-3 text-sm text-orb-text outline-none focus:border-orb-accent"
        placeholder="Enter deterministic TPC reasoning input"
      />
    </section>
  )
}
