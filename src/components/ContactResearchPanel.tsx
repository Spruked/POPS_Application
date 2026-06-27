import { useMemo, useState } from "react";
import { ExternalLink, Link2, Search, ShieldCheck } from "lucide-react";
import { generateId } from "../utils/helpers";
import type { PlayerDossierRecord, PlayerInteractionLog } from "../types";

type ContactResearchPanelProps = {
  contact: PlayerDossierRecord;
  onUpdate: (updates: Partial<PlayerDossierRecord>) => void;
};

type FindingStatus = "Source-backed" | "User-provided" | "Heard elsewhere" | "Needs verification";

function searchTerms(contact: PlayerDossierRecord, question: string) {
  return [contact.name, contact.organization, contact.knownRole, question]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function makeSearchUrl(provider: "web" | "news" | "platform", terms: string) {
  const query = encodeURIComponent(terms);
  if (provider === "news") return `https://news.google.com/search?q=${query}`;
  if (provider === "platform") return `https://www.google.com/search?q=${query}%20site%3Alinkedin.com%20OR%20site%3Afacebook.com`;
  return `https://www.google.com/search?q=${query}`;
}

export default function ContactResearchPanel({ contact, onUpdate }: ContactResearchPanelProps) {
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState("");
  const [reference, setReference] = useState("");
  const [finding, setFinding] = useState("");
  const [status, setStatus] = useState<FindingStatus>("Source-backed");

  const terms = useMemo(() => searchTerms(contact, question), [contact, question]);

  function openResearch(provider: "web" | "news" | "platform") {
    if (!terms) return;
    window.open(makeSearchUrl(provider, terms), "_blank", "noopener,noreferrer");
  }

  function saveFinding() {
    if (!finding.trim()) return;

    const entry: PlayerInteractionLog = {
      id: generateId(),
      when: new Date().toISOString(),
      summary: [
        `[Research · ${status}]`,
        question.trim() ? `Question: ${question.trim()}` : "",
        source.trim() ? `Source: ${source.trim()}` : "",
        reference.trim() ? `Reference: ${reference.trim()}` : "",
        `Finding: ${finding.trim()}`,
      ].filter(Boolean).join(" | "),
    };

    onUpdate({ interactionHistory: [entry, ...(contact.interactionHistory || [])] });
    setSource("");
    setReference("");
    setFinding("");
  }

  return (
    <section
      className="card"
      style={{ marginTop: 16, marginBottom: 0, padding: 14, borderLeft: "3px solid var(--accent-blue)" }}
    >
      <div className="card-header" style={{ marginBottom: 8 }}>
        <h3><Search size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />Research workspace</h3>
      </div>
      <p style={{ marginBottom: 12, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
        Start a search, preserve what you find, and keep the origin clear. POPS stores your research notes locally with this person’s dossier.
      </p>

      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>What are you trying to learn?</label>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: professional role, public case information, organization, or a specific question" />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => openResearch("web")} disabled={!terms}>
          <ExternalLink size={14} /> Search web
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => openResearch("news")} disabled={!terms}>
          <ExternalLink size={14} /> Search news
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => openResearch("platform")} disabled={!terms}>
          <ExternalLink size={14} /> Search platforms
        </button>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>How do you know this?</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as FindingStatus)}>
            <option>Source-backed</option>
            <option>User-provided</option>
            <option>Heard elsewhere</option>
            <option>Needs verification</option>
          </select>
        </div>
        <div className="form-group">
          <label>Source or platform</label>
          <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Site, record system, person, or platform" />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Source link or reference</label>
          <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="URL, document title, docket, or other reference" />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>What did you find?</label>
          <textarea value={finding} onChange={(event) => setFinding(event.target.value)} placeholder="Write what the source says or what you learned. Keep unknown or second-hand information clearly marked." />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 11 }}>
          <ShieldCheck size={13} /> Searches are user-started. Notes stay with this dossier.
        </span>
        <button className="btn btn-primary btn-sm" type="button" onClick={saveFinding} disabled={!finding.trim()}>
          <Link2 size={14} /> Save finding
        </button>
      </div>
    </section>
  );
}
