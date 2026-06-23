import { useRef, useState } from 'react';
import { Activity, ExternalLink, Orbit, ShieldCheck, X } from 'lucide-react';
import DictationButton from './DictationButton';
import { POPS_LEXICON_VALIDATION } from '../data/lexicon';
import { LEXICON_VALIDATION_FAILURE_MESSAGE } from '../data/validatePopsLexicon';
import { APP_CONTEXT_STATUS } from '../data/appContext';
import { runPopsAssistant } from '../services/popsAssistantRuntime';

function appendTranscript(current: string, transcript: string) {
  const text = transcript.trim();
  if (!text) return current;
  return current.trim() ? `${current}${/\s$/.test(current) ? '' : ' '}${text}` : text;
}

export default function OrbAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("Give me a disciplined summary of today's most critical case actions.");
  const [response, setResponse] = useState('POPS Case Assistant awaiting command.');
  const [runtimeStatus, setRuntimeStatus] = useState('Case Command MCP ready.');
  const [isRunning, setIsRunning] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  function insertDictatedPrompt(transcript: string) {
    setPrompt((current) => appendTranscript(current, transcript));
    requestAnimationFrame(() => {
      promptRef.current?.focus();
      promptRef.current?.setSelectionRange(promptRef.current.value.length, promptRef.current.value.length);
    });
  }

  async function runOrbQuery() {
    const input = prompt.trim();
    if (!input || isRunning) return;
    setIsRunning(true);
    setResponse('POPS is checking structured local case records...');
    try {
      const result = await runPopsAssistant(input);
      setResponse(result.text);
      setRuntimeStatus(result.statusLine);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown runtime error';
      setResponse(`POPS could not complete this request. ${detail}`);
      setRuntimeStatus('Runtime needs attention.');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="orb-assistant">
      {isOpen && (
        <div className="orb-command-panel animate-in">
          <div className="orb-command-header">
            <div className="orb-mini-dot" style={{ width: 14, height: 14 }} />
            <div className="orb-command-title">POPS Case Assistant</div>
            <button className="orb-command-close" onClick={() => setIsOpen(false)} aria-label="Close POPS Case Assistant">
              <X size={16} />
            </button>
          </div>

          <div className="orb-command-grid">
            <div className="orb-command-tile"><Activity size={15} /><span>Runtime</span><strong>{isRunning ? 'Processing' : 'Ready'}</strong></div>
            <div className="orb-command-tile"><ShieldCheck size={15} /><span>Case Command</span><strong>{APP_CONTEXT_STATUS.available ? 'Local Access Ready' : 'Unavailable'}</strong></div>
            <div className="orb-command-tile"><Orbit size={15} /><span>TPC Gate</span><strong>{POPS_LEXICON_VALIDATION.ok ? 'Lexicon Guided' : 'Review Required'}</strong></div>
          </div>

          <div className="orb-command-meta">
            <div><strong>Runtime:</strong> {runtimeStatus}</div>
            <div><strong>Case Command:</strong> Contacts, calls, documents, timeline, calendar</div>
            <div><strong>Reference:</strong> {POPS_LEXICON_VALIDATION.ok ? 'POPS Lexicon loaded' : LEXICON_VALIDATION_FAILURE_MESSAGE}</div>
          </div>

          <textarea ref={promptRef} className="orb-command-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask POPS to find, organize, or prepare a case action..." />

          <div style={{ marginTop: 10 }}>
            <DictationButton label="Dictate Prompt" disabled={isRunning} onTranscript={insertDictatedPrompt} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 0, marginTop: 8 }}>
              Dictation inserts editable text only. POPS reads local records before responding to a case-record request.
            </p>
          </div>

          <div className="orb-command-response">{response}</div>
          <div className="orb-command-actions">
            <button className="orb-command-btn" onClick={runOrbQuery} disabled={isRunning}>{isRunning ? 'Running...' : 'Run Case Command'} <ExternalLink size={13} /></button>
          </div>
        </div>
      )}
      <button className="orb-assistant-trigger orb-command-trigger" onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close POPS Case Assistant' : 'Open POPS Case Assistant'}>
        {isOpen ? <X size={20} color="white" /> : <Orbit size={20} color="white" />}
      </button>
    </div>
  );
}
