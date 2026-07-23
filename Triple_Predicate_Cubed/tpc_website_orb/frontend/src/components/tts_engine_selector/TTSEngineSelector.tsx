import { useEffect, useState } from 'react'

interface VoiceResponse {
  kokoro?: string[]
  qwen?: string[]
}

export function TTSEngineSelector() {
  const [voices, setVoices] = useState<VoiceResponse>({})
  const [text, setText] = useState('')
  const [engine, setEngine] = useState('auto')
  const [result, setResult] = useState<string>('idle')

  useEffect(() => {
    fetch('/api/v1/voices')
      .then((response) => response.ok ? response.json() : {})
      .then((data: VoiceResponse) => setVoices(data))
      .catch(() => setVoices({}))
  }, [])

  async function speak() {
    if (!text.trim()) return
    setResult('processing')
    try {
      const response = await fetch('/api/v1/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, engine }),
      })
      const data = await response.json()
      setResult(data.error || data.audio_path || data.engine_used || 'complete')
    } catch {
      setResult('request failed')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-orb-text mb-4">TTS</h1>
      <section className="bg-orb-panel rounded-lg border border-orb-border p-4">
        <div className="flex gap-3">
          <select
            value={engine}
            onChange={(event) => setEngine(event.target.value)}
            className="rounded border border-orb-border bg-orb-bg px-3 py-2 text-sm text-orb-text"
          >
            <option value="auto">auto</option>
            <option value="kokoro">kokoro</option>
            <option value="qwen">qwen</option>
          </select>
          <button type="button" onClick={speak} className="rounded bg-orb-accent px-4 py-2 text-sm text-white">
            Speak
          </button>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-4 h-28 w-full resize-none rounded border border-orb-border bg-orb-bg p-3 text-sm text-orb-text"
          placeholder="Text to synthesize"
        />
        <div className="mt-3 text-xs text-orb-text-dim">
          Kokoro voices: {(voices.kokoro || []).join(', ') || 'unavailable'} | Qwen voices: {(voices.qwen || []).join(', ') || 'default'}
        </div>
        <div className="mt-2 text-xs text-orb-text-dim">Result: {result}</div>
      </section>
    </div>
  )
}
