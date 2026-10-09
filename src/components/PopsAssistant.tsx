import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  FilePlus2,
  FileText,
  FolderPlus,
  Gavel,
  Mic,
  Minimize2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/tauri";
import { morbManager, type MorbStatus } from "../morbs/morb_manager";
import type { Page } from "../types";

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

type LocalAgentChatResult = {
  response: string;
  model: string;
  endpoint: string;
  substrate_root: string;
  used_site_context: boolean;
  tpc_endpoint: string;
  tpc_status: string;
  available: boolean;
};

type LocalAgentReadiness = {
  ready: boolean;
  llama_status: string;
  tpc_status: string;
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
  return `You are on ${currentPage}. In guided chat mode, I can help you navigate, structure a factual record, prepare a draft, or point you to the right POPS workspace.`;
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

function buildSiteContext() {
  return [
    "Dashboard: overview of case records and vault status.",
    "People & Dossiers: contact dossier records and auditable person/contact notes.",
    "Case Calendar: hearings, appointments, deadlines, parenting time, and exchanges.",
    "Legal: court orders, violations, filings, motions, service records, court notes, attorney packets, and child support ledger.",
    "Evidence Vault: imported files, hashes, chain of custody, exhibits, metadata, and risk review.",
    "Events & Timeline: incidents, communication, denied visits, good-faith attempts, and case notes.",
    "Reports: court packets, evidence indexes, timeline summaries, export, print, and review flags.",
    "Settings: chat assistant, data backup, security, local storage, and preferences.",
  ].join("\n");
}

export default function PopsAssistant({ activePage, onNavigate }: PopsAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", role: "assistant", text: "I'm here to help you organize your records, prepare a draft, find a section, or work through the page you are on." },
  ]);
  const [input, setInput] = useState("");
  const [dockState, setDockState] = useState<DockState>("open");
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [morbStatus, setMorbStatus] = useState<MorbStatus>("idle");
  const [isThinking, setIsThinking] = useState(false);
  const [guardian, setGuardian] = useState<"starting" | "ready" | "unavailable">("starting");
  const messageListRef = useRef<HTMLDivElement | null>(null);

  async function refreshGuardian() {
    try {
      const result = await invoke<LocalAgentReadiness>("local_agent_readiness");
      setGuardian(result.ready ? "ready" : "unavailable");
    } catch {
      setGuardian("unavailable");
    }
  }

  useEffect(() => {
    void refreshGuardian();
    const timer = window.setInterval(() => void refreshGuardian(), 3000);
    return () => window.clearInterval(timer);
  }, []);

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

    setIsThinking(true);
    try {
      const result = await invoke<LocalAgentChatResult>("local_agent_chat", {
        input: {
          prompt: trimmed,
          active_page: PAGE_LABELS[activePage] || activePage,
          site_context: buildSiteContext(),
        },
      });
      addAssistantMessage(result.response || "The local llama.cpp server returned an empty response.");
      setSetupNotice(`${result.available ? "Local model response complete" : "Local model unavailable"} via ${result.tpc_endpoint} (${result.tpc_status}).`);
    } catch (error) {
      addAssistantMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  function handleQuickAction(action: QuickAction) {
    onNavigate(action.page);
    addAssistantMessage(`I opened ${PAGE_LABELS[action.page] || action.label}. I can help you work through it one factual step at a time.`);
  }

  if (dockState !== "open") {
    return (
      <aside className={`pops-assistant-launcher pops-assistant-launcher-${dockState}`} aria-label="Chat assistant">
        <button type="button" onClick={() => setDockState("open")} title={dockState === "minimized" ? "Restore chat assistant" : "Open chat assistant"}>
          <span className="pops-launcher-mark">P</span>
          {dockState === "closed" && <span>Open chat</span>}
        </button>
      </aside>
    );
  }

  return (
    <aside className="pops-assistant-dock" aria-label="Chat assistant">
      <div className="pops-assistant-shell">
        <header className="pops-assistant-header">
          <div>
            <div className="pops-wordmark">Chat Assistant</div>
            <p>LLM-ready private chat</p>
          </div>
          <div className="pops-header-actions">
            <button className="pops-header-button" type="button" onClick={() => setDockState("minimized")} title="Minimize chat assistant to the bottom corner" aria-label="Minimize chat assistant to the bottom corner"><Minimize2 size={17} /></button>
            <button className="pops-header-button" type="button" onClick={() => setDockState("closed")} title="Close chat assistant" aria-label="Close chat assistant"><X size={17} /></button>
            <img
              className="pops-presence-orb"
              src="/orb/skins/average_dadblkleatherjacket.png"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </div>
        </header>

        <section className="pops-private-status">
          <ShieldCheck size={16} aria-hidden="true" />
          <div><strong>Private workspace</strong><span>Chat guidance is routed through guided mode or the local TPC pipeline.</span></div>
        </section>

        <section className="pops-private-status" aria-label="Guardian status">
          <Sparkles size={16} aria-hidden="true" />
          <div>
            <strong>Guardian {guardian}</strong>
            <span>{guardian === "ready" ? "Assistant services are available." : guardian === "starting" ? "Assistant initialization continues in the background." : "Records and case tools remain available."}</span>
          </div>
          {guardian === "unavailable" && <div className="pops-header-actions"><button className="pops-header-button" type="button" onClick={() => void refreshGuardian()}>Retry</button><button className="pops-header-button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("pops:open-diagnostics"))}>Diagnostics</button></div>}
        </section>

        <section className="pops-private-status" aria-label="Research status">
          <Sparkles size={16} aria-hidden="true" />
          <div><strong>{researchStatusCopy(morbStatus)}</strong><span>User-directed research only</span></div>
        </section>

        <section className="pops-conversation" aria-live="polite" ref={messageListRef}>
          {messages.map((message) => <article className={`pops-message pops-message-${message.role}`} key={message.id}><span className="pops-message-label">{message.role === "assistant" ? "Assistant" : "You"}</span><p>{message.text}</p></article>)}
        </section>

        <section className="pops-action-list" aria-label="Suggested things to do">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return <button className="pops-action-card" key={action.id} onClick={() => handleQuickAction(action)} type="button"><span className="pops-action-icon"><Icon size={17} /></span><span className="pops-action-copy"><strong>{action.label}</strong><small>{action.detail}</small></span><ChevronRight size={17} aria-hidden="true" /></button>;
          })}
        </section>

        <form className="pops-composer" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
          <textarea aria-label="Ask chat assistant" onChange={(event) => setInput(event.target.value)} placeholder="Ask the assistant or describe what happened..." rows={2} value={input} />
          <div className="pops-composer-actions">
            <button className="pops-icon-button" type="button" title="Dictation setup" aria-label="Dictation setup" onClick={() => setSetupNotice("Dictation will use the approved POPS input adapter. It places editable text here and never submits a record automatically.")}><Mic size={17} /></button>
            <button className="pops-send-button" type="submit" aria-label="Send message to chat assistant" disabled={isThinking}>{isThinking ? <Sparkles size={17} /> : <Send size={17} />}</button>
          </div>
        </form>

        {setupNotice && <p className="pops-engine-notice">{setupNotice}</p>}
      </div>
    </aside>
  );
}
