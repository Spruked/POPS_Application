import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  CloudCog,
  FilePlus2,
  FileText,
  FolderPlus,
  Gavel,
  Mic,
  Minimize2,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { morbManager, type MorbStatus } from "../morbs/morb_manager";
import type { Page } from "../types";

export type AssistantMode = "core" | "local" | "api";
type DockState = "open" | "minimized" | "closed";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type PopsAssistantProps = {
  activePage: Page;
  onNavigate: (page: Page) => void;
};

type QuickAction = {
  id: string;
  label: string;
  detail: string;
  page: Page;
  icon: typeof CalendarClock;
};

const PAGE_LABELS: Partial<Record<Page, string>> = {
  dashboard: "Dashboard",
  contacts: "Contacts",
  calendar: "Case Calendar",
  visitation: "Parenting Time & Exchanges",
  legal: "Legal",
  events: "Events & Timeline",
  evidence: "Evidence Vault",
  orders: "Court Orders",
  reports: "Reports",
  profile: "Case Profile",
  settings: "Settings",
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "parenting-time", label: "Log parenting time or an exchange", detail: "Document a scheduled, missed, or denied exchange", page: "visitation", icon: CalendarClock },
  { id: "evidence", label: "Add an evidence item", detail: "Record a document, image, message, or other source", page: "evidence", icon: FolderPlus },
  { id: "order", label: "Review court orders", detail: "Find terms, references, and linked material", page: "orders", icon: Gavel },
  { id: "timeline", label: "Prepare a timeline entry", detail: "Add a factual event to your record", page: "events", icon: FilePlus2 },
  { id: "report", label: "Prepare a draft report", detail: "Create a draft summary for your review", page: "reports", icon: FileText },
];

function makeCoreResponse(input: string, activePage: Page) {
  const request = input.toLowerCase();
  const currentPage = PAGE_LABELS[activePage] || "this page";

  if (request.includes("evidence") || request.includes("document")) {
    return "I can help you organize the item before it becomes part of your record. Open Evidence Vault to preserve the original, describe the source, and link it to the right event.";
  }
  if (request.includes("visit") || request.includes("exchange") || request.includes("parenting time")) {
    return "Let's document the exchange as facts: what was scheduled, where it was supposed to happen, what occurred, what you did, and any supporting material. I can guide you through the Parenting Time & Exchanges record.";
  }
  if (request.includes("order") || request.includes("court")) {
    return "I can help you locate order information and keep it separate from your interpretation. We can connect a factual event to the correct order reference after you review it.";
  }
  if (request.includes("report") || request.includes("summary")) {
    return "I can help prepare a draft report from the records you choose. It remains a draft for review until a future governed export workflow confirms what is included.";
  }
  return `You are on ${currentPage}. In Core Guided Mode, I can help you navigate, structure a factual record, prepare a draft, or point you to the right POPS workspace.`;
}

function isResearchRequest(input: string) {
  const request = input.toLowerCase();
  return request.includes("research") || request.includes("look up") || request.includes("source") || request.includes("find information");
}

function researchStatusCopy(status: MorbStatus) {
  if (status === "working") return "Research in progress";
  if (status === "complete") return "Research result ready for review";
  return "Research ready";
}

export default function PopsAssistant({ activePage, onNavigate }: PopsAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", role: "assistant", text: "I'm here to help you organize your records, prepare a draft, find a section, or work through the page you are on." },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AssistantMode>("core");
  const [dockState, setDockState] = useState<DockState>("open");
  const [engineOpen, setEngineOpen] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [morbStatus, setMorbStatus] = useState<MorbStatus>("idle");
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function addAssistantMessage(text: string) {
    setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: "assistant", text }]);
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, { id: `${Date.now()}-user`, role: "user", text: trimmed }]);
    setInput("");

    if (isResearchRequest(trimmed)) {
      setMorbStatus("working");
      try {
        const result = await morbManager.runResearch({
          topic: trimmed,
          personContext: PAGE_LABELS[activePage] || activePage,
        });
        setMorbStatus(morbManager.getStatus());
        addAssistantMessage(`Research result ready for review: ${result.finding} Receipt ${result.receipt.id}.`);
      } catch (error) {
        setMorbStatus("idle");
        addAssistantMessage(error instanceof Error ? error.message : "Research worker failed.");
      }
      return;
    }

    addAssistantMessage(makeCoreResponse(trimmed, activePage));
  }

  function handleQuickAction(action: QuickAction) {
    onNavigate(action.page);
    addAssistantMessage(`I opened ${PAGE_LABELS[action.page] || action.label}. I can help you work through it one factual step at a time.`);
  }

  function selectMode(nextMode: AssistantMode) {
    setMode(nextMode);
    if (nextMode === "core") setSetupNotice("Core Guided Mode is active. It does not require a language model.");
    if (nextMode === "local") setSetupNotice("Recommended Local Model is selected for setup. POPS remains in Core Guided Mode until a compatible local model and runtime adapter are installed.");
    if (nextMode === "api") setSetupNotice("Custom API Model is selected for setup. Provider configuration, privacy review, and an approved context boundary are required before an external model can be used.");
  }

  const modeLabel = mode === "core" ? "Core Guided Mode" : mode === "local" ? "Recommended Local Model" : "Custom API Model";

  if (dockState !== "open") {
    return (
      <aside className={`pops-assistant-launcher pops-assistant-launcher-${dockState}`} aria-label="Pops assistant">
        <button type="button" onClick={() => setDockState("open")} title={dockState === "minimized" ? "Restore Pops" : "Open Pops"}>
          <span className="pops-launcher-mark">P</span>
          {dockState === "closed" && <span>Open Pops!</span>}
        </button>
      </aside>
    );
  }

  return (
    <aside className="pops-assistant-dock" aria-label="Pops private guide">
      <div className="pops-assistant-shell">
        <header className="pops-assistant-header">
          <div>
            <div className="pops-wordmark">Pops!</div>
            <p>Your private guide</p>
          </div>
          <div className="pops-header-actions">
            <button className="pops-header-button" type="button" onClick={() => setDockState("minimized")} title="Minimize Pops to the bottom corner" aria-label="Minimize Pops to the bottom corner"><Minimize2 size={17} /></button>
            <button className="pops-header-button" type="button" onClick={() => setDockState("closed")} title="Close Pops" aria-label="Close Pops"><X size={17} /></button>
            <div className="pops-presence-mark" aria-hidden="true"><span>P</span></div>
          </div>
        </header>

        <section className="pops-private-status">
          <ShieldCheck size={16} aria-hidden="true" />
          <div><strong>Private workspace</strong><span>Guidance stays inside POPS unless you choose an external assistant engine.</span></div>
        </section>

        <section className="pops-private-status" aria-label="Research status">
          <Sparkles size={16} aria-hidden="true" />
          <div><strong>{researchStatusCopy(morbStatus)}</strong><span>User-directed research only</span></div>
        </section>

        <section className="pops-conversation" aria-live="polite" ref={messageListRef}>
          {messages.map((message) => <article className={`pops-message pops-message-${message.role}`} key={message.id}><span className="pops-message-label">{message.role === "assistant" ? "Pops!" : "You"}</span><p>{message.text}</p></article>)}
        </section>

        <section className="pops-action-list" aria-label="Suggested things to do">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return <button className="pops-action-card" key={action.id} onClick={() => handleQuickAction(action)} type="button"><span className="pops-action-icon"><Icon size={17} /></span><span className="pops-action-copy"><strong>{action.label}</strong><small>{action.detail}</small></span><ChevronRight size={17} aria-hidden="true" /></button>;
          })}
        </section>

        <form className="pops-composer" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
          <textarea aria-label="Ask Pops" onChange={(event) => setInput(event.target.value)} placeholder="Ask Pops! or describe what happened..." rows={2} value={input} />
          <div className="pops-composer-actions">
            <button className="pops-icon-button" type="button" title="Dictation setup" aria-label="Dictation setup" onClick={() => setSetupNotice("Dictation will use the approved POPS input adapter. It places editable text here and never submits a record automatically.")}><Mic size={17} /></button>
            <button className="pops-send-button" type="submit" aria-label="Send message to Pops"><Send size={17} /></button>
          </div>
        </form>

        <section className="pops-engine">
          <button className="pops-engine-trigger" type="button" onClick={() => setEngineOpen((current) => !current)} aria-expanded={engineOpen}>
            <span><Settings2 size={16} /><span><strong>Assistant Engine</strong><small>{modeLabel}</small></span></span><ChevronRight className={engineOpen ? "pops-rotate" : ""} size={17} />
          </button>
          {engineOpen && <div className="pops-engine-options">
            <button className={mode === "core" ? "active" : ""} type="button" onClick={() => selectMode("core")}><ShieldCheck size={16} /><span><strong>Core Guided Mode</strong><small>No LLM required</small></span></button>
            <button className={mode === "local" ? "active" : ""} type="button" onClick={() => selectMode("local")}><Sparkles size={16} /><span><strong>Install Local Model</strong><small>Recommended for richer conversation</small></span></button>
            <button className={mode === "api" ? "active" : ""} type="button" onClick={() => selectMode("api")}><CloudCog size={16} /><span><strong>Use API Model</strong><small>Bring your own provider and key</small></span></button>
            {setupNotice && <p className="pops-engine-notice">{setupNotice}</p>}
          </div>}
        </section>
      </div>
    </aside>
  );
}
