import { useEffect, useMemo, useState } from 'react'

export interface PhilosopherVerdict {
  status: string
  confidence: number
}

export interface PipelineResult {
  status: string
  output?: string
  confidence?: number
  philosopher_verdicts?: Record<string, PhilosopherVerdict>
  coherence?: {
    score?: number
    status?: string
  }
  vault_retrieval?: {
    result?: string
    confidence?: number
    recommendation?: string
  }
  ecm?: {
    verdict?: string
    confidence?: number
    violations?: string[]
  }
  drift?: {
    status?: string
    total_pings?: number
    drift_rate?: number
  }
  processing_time_ms?: number
  glyph_signature?: string
  depth_trace?: string[]
}

interface TPCState {
  result: PipelineResult | null
  history: PipelineResult[]
  wsConnected: boolean
}

const state: TPCState = {
  result: null,
  history: [],
  wsConnected: false,
}

const listeners = new Set<() => void>()
let socket: WebSocket | null = null

function emit() {
  listeners.forEach((listener) => listener())
}

function setResult(result: PipelineResult) {
  state.result = result
  emit()
}

function addToHistory(result: PipelineResult) {
  state.history = [result, ...state.history].slice(0, 25)
  emit()
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${protocol}://${window.location.host}/ws/pipeline`)

  socket.onopen = () => {
    state.wsConnected = true
    emit()
  }

  socket.onclose = () => {
    state.wsConnected = false
    emit()
  }

  socket.onerror = () => {
    state.wsConnected = false
    emit()
  }
}

function disconnect() {
  socket?.close()
  socket = null
  state.wsConnected = false
  emit()
}

export function useTPCStore() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const listener = () => forceUpdate((value) => value + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return useMemo(() => ({
    result: state.result,
    history: state.history,
    wsConnected: state.wsConnected,
    setResult,
    addToHistory,
    connect,
    disconnect,
  }), [state.result, state.history, state.wsConnected])
}
