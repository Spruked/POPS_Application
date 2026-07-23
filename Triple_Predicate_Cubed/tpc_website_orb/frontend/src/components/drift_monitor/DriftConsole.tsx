import { useEffect, useState } from 'react'
import { useTPCStore } from '@stores/tpcStore'

interface DriftReport {
  status?: string
  total_pings?: number
  drift_rate?: number
}

export function DriftConsole() {
  const { result } = useTPCStore()
  const [report, setReport] = useState<DriftReport | null>(null)

  useEffect(() => {
    fetch('/api/v1/drift')
      .then((response) => response.ok ? response.json() : null)
      .then((data: DriftReport | null) => setReport(data))
      .catch(() => setReport(null))
  }, [])

  const activeReport = report || result?.drift

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-orb-text mb-4">Drift</h1>
      <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Metric label="Status" value={activeReport?.status || 'unknown'} />
          <Metric label="Pings" value={String(activeReport?.total_pings || 0)} />
          <Metric label="Rate" value={(activeReport?.drift_rate || 0).toFixed(4)} />
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
