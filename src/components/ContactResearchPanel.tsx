import { useMemo, useState } from "react";
import { ExternalLink, Link2, Search, ShieldCheck } from "lucide-react";
import { useContactResearchStore } from "../hooks/useStore";
import { generateId } from "../utils/helpers";
import type { ContactResearchStatus, PlayerDossierRecord } from "../types";

type ContactResearchPanelProps = {
  contact: PlayerDossierRecord;
  onUpdate: (updates: Partial<PlayerDossierRecord>) => void;
};

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

export default function ContactResearchPanel({ contact, onUpdate: _onUpdate }: ContactResearchPanelProps) {
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState("");
  const [reference, setReference] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [finding, setFinding] = useState("");
  const [userNote, setUserNote] = useState("");
  const [status, setStatus] = useState<ContactResearchStatus>("Source-backed");
  const [saving, setSaving] = useState(false);
  const research = useContactResearchStore(contact.id);

  const terms = useMemo(() => searchTerms(contact, question), [contact, question]);

  function openResearch(provider: "web" | "news" | "platform") {
    if (!terms) return;
    window.open(makeSearchUrl(provider, terms), "_blank", "noopener,noreferrer");
  }

  async function saveFinding() {
    if (!finding.trim() || saving) return;

    const now = new Date().toISOString();
    setSaving(true);
    try {
      await research.add({
        id: generateId(),
        contactId: contact.id,
        researchQuestion: question.trim(),
        providerOrSource: source.trim(),
        sourceReference: reference.trim(),
        sourceTitle: sourceTitle.trim(),
        capturedFinding: finding.trim(),
        userNote: userNote.trim(),
        status,
        linkedPersonId: contact.id,
        linkedEvidenceId: "",
        linkedEventId: "",
        linkedCourtOrderId: "",
        linkedCalendarItemId: "",
        linkedTimelineItemId: "",
        createdAt: now,
        updatedAt: now,
      });
      setSource("");
      setReference("");
      setSourceTitle("");
      setFinding("");
      setUserNote("");
    } finally {
      setSaving(false);
    }
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
        Start a search, preserve what you find, and keep the origin clear. POPS stores structured research findings locally with this person's dossier.
      </p>

      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Research question</label>
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
          <label>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as ContactResearchStatus)}>
            <option>Source-backed</option>
            <option>User-provided</option>
            <option>Heard elsewhere</option>
            <option>Needs verification</option>
          </select>
        </div>
        <div className="form-group">
          <label>Provider or source name</label>
          <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Site, record system, person, or platform" />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Source URL, docket, document, or platform reference</label>
          <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="URL, document title, docket, or other reference" />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Title or source label</label>
          <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Page title, docket label, document name, or source label" />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Captured finding</label>
          <textarea value={finding} onChange={(event) => setFinding(event.target.value)} placeholder="Write what the source says or what you learned. Keep unknown or second-hand information clearly marked." />
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>User note</label>
          <textarea value={userNote} onChange={(event) => setUserNote(event.target.value)} placeholder="Your note, follow-up question, or verification reminder." />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 11 }}>
          <ShieldCheck size={13} /> Searches are user-started. Findings stay local with this dossier.
        </span>
        <button className="btn btn-primary btn-sm" type="button" onClick={saveFinding} disabled={!finding.trim() || saving}>
          <Link2 size={14} /> Save finding
        </button>
      </div>

      <div className="timeline" style={{ marginTop: 14 }}>
        {research.items.length === 0 && research.loaded && <div className="empty-state" style={{ padding: 16 }}><p>No research findings saved yet.</p></div>}
        {research.items.map((item) => (
          <div className="timeline-item" key={item.id}>
            <div className="timeline-dot blue" />
            <div className="timeline-content">
              <h4>{item.sourceTitle || item.providerOrSource || item.status}</h4>
              <p>{item.capturedFinding}</p>
              {item.researchQuestion ? <p><strong>Question:</strong> {item.researchQuestion}</p> : null}
              {item.sourceReference ? <p><strong>Reference:</strong> {item.sourceReference}</p> : null}
              {item.userNote ? <p><strong>Note:</strong> {item.userNote}</p> : null}
              <div className="date">{item.status} - {new Date(item.updatedAt).toLocaleString()}</div>
              {item.receiptHash ? <div className="date">Receipt: {item.receiptHash.slice(0, 16)}...</div> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
