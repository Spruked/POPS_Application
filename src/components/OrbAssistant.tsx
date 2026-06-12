import { useEffect, useMemo, useState } from 'react';
import { Activity, ExternalLink, Orbit, ShieldCheck, X } from 'lucide-react';
import { buildOrbLexiconGuidance, POPS_LEXICON_VALIDATION } from '../data/lexicon';
import { LEXICON_VALIDATION_FAILURE_MESSAGE } from '../data/validatePopsLexicon';
import { APP_CONTEXT_STATUS, buildAppContextGuidance } from '../data/appContext';

const OLLAMA_BASE_URL = (import.meta.env.VITE_OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.2:1b';

const ORB_SYSTEM_CONTEXT = `You are the POPS ORB inside a local-first evidence workstation.
Use the POPS Lexicon as fixed language guidance.
Answer in plain English, keep guidance factual and court-safe, and do not create legal conclusions.
When high-sensitivity terms appear, explain them and recommend attorney review before export or filing.
Use structured local POPS app context only. Do not guess records that are not present.
Do not delete records. Suggest, draft, create pending records, modify, or export only after user confirmation.

${buildAppContextGuidance()}

${buildOrbLexiconGuidance()}`;

export default function OrbAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('Give me a disciplined summary of today\'s most critical case actions.');
  const [response, setResponse] = useState('ORB awaiting command.');
  const [isRunning, setIsRunning] = useState(false);
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking');

  const endpoint = useMemo(() => `${OLLAMA_BASE_URL}/api/generate`, []);

  useEffect(() => {
    let mounted = true;

    async function pingOllama() {
      try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: 'GET' });
        if (!mounted) return;
        setConnection(res.ok ? 'online' : 'offline');
      } catch {
        if (!mounted) return;
        setConnection('offline');
      }
    }

    void pingOllama();
    return () => {
      mounted = false;
    };
  }, []);

  async function runOrbQuery() {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setResponse('Running ORB inference...');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: `${ORB_SYSTEM_CONTEXT}\n\nUser request:\n${trimmed}`,
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = (data?.response || '').trim();
      setResponse(text || 'No response text returned by Ollama.');
      setConnection('online');
    } catch (err) {
      setConnection('offline');
      const detail = err instanceof Error ? err.message : 'Unknown connection error';
      setResponse(`ORB could not reach Ollama at ${OLLAMA_BASE_URL}. ${detail}`);
    } finally {
      setIsRunning(false);
    }
  }

  function openAccountPortal() {
    window.open('https://pops.spruked.com/account', '_blank', 'noopener,noreferrer');
  }

  function openSupport() {
    window.open('https://pops.spruked.com/counsel-handoff', '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="orb-assistant">
      {isOpen && (
        <div className="orb-command-panel animate-in">
          <div className="orb-command-header">
            <div className="orb-mini-dot" style={{ width: 14, height: 14 }} />
            <div className="orb-command-title">ORB Command</div>
            <button className="orb-command-close" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <div className="orb-command-grid">
            <div className="orb-command-tile">
              <Activity size={15} />
              <span>Pipeline Status</span>
              <strong>{connection === 'online' ? 'Ollama Online' : connection === 'offline' ? 'Ollama Offline' : 'Connection Check'}</strong>
            </div>
            <div className="orb-command-tile">
              <ShieldCheck size={15} />
              <span>App Context</span>
              <strong>{APP_CONTEXT_STATUS.available ? 'Local Access Ready' : 'Unavailable'}</strong>
            </div>
            <div className="orb-command-tile">
              <Orbit size={15} />
              <span>ORB Mode</span>
              <strong>{isRunning ? 'Inference Running' : POPS_LEXICON_VALIDATION.ok ? 'Lexicon Guided' : 'Lexicon Disabled'}</strong>
            </div>
          </div>

          <div className="orb-command-meta">
            <div><strong>Model:</strong> {OLLAMA_MODEL}</div>
            <div><strong>Endpoint:</strong> {endpoint}</div>
            <div><strong>Context:</strong> {APP_CONTEXT_STATUS.available ? 'Contacts, calendar, evidence, legal, reports' : 'Unavailable'}</div>
            <div><strong>Reference:</strong> {POPS_LEXICON_VALIDATION.ok ? 'POPS Lexicon loaded' : LEXICON_VALIDATION_FAILURE_MESSAGE}</div>
          </div>

          <textarea
            className="orb-command-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter ORB command prompt..."
          />

          <div className="orb-command-response">{response}</div>

          <div className="orb-command-actions">
            <button className="orb-command-btn" onClick={runOrbQuery} disabled={isRunning}>
              {isRunning ? 'Running...' : 'Run ORB Query'} <ExternalLink size={13} />
            </button>
            <button className="orb-command-btn" onClick={openAccountPortal}>
              Open Account Portal <ExternalLink size={13} />
            </button>
            <button className="orb-command-btn" onClick={openSupport}>
              Open Support <ExternalLink size={13} />
            </button>
          </div>
        </div>
      )}
      
      <button className="orb-assistant-trigger orb-command-trigger" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <X size={20} color="white" /> : <Orbit size={20} color="white" />}
      </button>
    </div>
  );
}
