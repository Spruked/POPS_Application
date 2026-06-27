import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { usePlayersStore } from "../hooks/useStore";
import { generateId } from "../utils/helpers";
import type { PlayerDossierRecord, PlayerInteractionLog } from "../types";
import ContactResearchPanel from "../components/ContactResearchPanel";

const ROLES = ["Other parent", "Attorney", "Court clerk", "Judge", "School contact", "Medical contact", "Support agency", "Law enforcement", "Witness", "Advocate", "Family member", "Other involved person"];

function newContact(): PlayerDossierRecord {
  const now = new Date().toISOString();
  return {
    id: generateId(), name: "", role: "Other involved person", knownRole: "", organization: "", phoneNumbers: "", emails: "", address: "", relationshipToCase: "", status: "active", lastContact: "", followUpNeeded: false, conflictConcern: false, documentsRequested: "", documentsProvided: "", linkedEvidence: "", linkedIncidents: "", linkedTimelineEvents: "", privateFieldNotes: "", courtSafeNotes: "", interactionHistory: [], createdAt: now, updatedAt: now,
  };
}

export default function ContactsDossier() {
  const store = usePlayersStore();
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const contacts = store.items;
  const selected = contacts.find((item) => item.id === selectedId) ?? contacts[0];

  useEffect(() => {
    if (!selectedId && contacts.length) setSelectedId(contacts[0].id);
  }, [contacts, selectedId]);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((item) => [item.name, item.role, item.organization].join(" ").toLowerCase().includes(term));
  }, [contacts, query]);

  function update(updates: Partial<PlayerDossierRecord>) {
    if (selected) void store.update(selected.id, updates);
  }

  function addContact() {
    const contact = newContact();
    void store.add(contact);
    setSelectedId(contact.id);
  }

  function addNote() {
    if (!selected || !note.trim()) return;
    const entry: PlayerInteractionLog = { id: generateId(), when: new Date().toISOString(), summary: `[Note] ${note.trim()}` };
    update({ interactionHistory: [entry, ...(selected.interactionHistory || [])] });
    setNote("");
  }

  if (!selected) {
    return <div><div className="page-header"><h2>People & Dossiers</h2><p>Keep people, information, and follow-ups organized.</p></div><div className="card"><button className="btn btn-primary" type="button" onClick={addContact}><Plus size={16} /> Add a person</button></div></div>;
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div><h2>People & Dossiers</h2><p>Know who is involved, keep the facts together, and stay ready.</p></div>
        <button className="btn btn-primary" type="button" onClick={addContact}><Plus size={16} /> Add a person</button>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "flex-start", gap: 10, borderLeft: "3px solid var(--accent-green)", padding: "14px 16px" }}>
        <ShieldCheck size={18} className="trust-green" />
        <div><strong>Stay organized and clear-headed.</strong><p style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 12 }}>Keep what you know, what you find, and what still needs confirmation in the same dossier.</p></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: 16 }}>
        <aside className="card" style={{ marginBottom: 0, padding: 14 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 12 }}><Users size={18} className="trust-blue" /><div><strong>People</strong><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{contacts.length} total</div></div></div>
          <div className="search-bar" style={{ marginBottom: 10 }}><Search size={14} color="var(--text-dim)" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a person..." /></div>
          <div style={{ display: "grid", gap: 7 }}>
            {shown.map((contact) => <button key={contact.id} className={`nav-item ${contact.id === selected.id ? "active" : ""}`} style={{ margin: 0 }} type="button" onClick={() => setSelectedId(contact.id)}><div style={{ textAlign: "left" }}><div style={{ fontSize: 13, fontWeight: 700 }}>{contact.name || "Unnamed person"}</div><div style={{ fontSize: 11, color: "var(--text-dim)" }}>{contact.role}</div></div>{contact.followUpNeeded && <span className="nav-badge">Follow-up</span>}</button>)}
          </div>
        </aside>

        <main className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><div><div style={{ color: "var(--text-dim)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Private dossier</div><h3 style={{ marginTop: 5 }}>{selected.name || "New person"}</h3></div><span className="badge badge-blue">{selected.status}</span></div>
          <div className="form-grid">
            <div className="form-group"><label>Name</label><input value={selected.name} onChange={(event) => update({ name: event.target.value })} /></div>
            <div className="form-group"><label>Role</label><select value={selected.role} onChange={(event) => update({ role: event.target.value })}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></div>
            <div className="form-group"><label>Organization / office</label><input value={selected.organization} onChange={(event) => update({ organization: event.target.value })} /></div>
            <div className="form-group"><label>Known title</label><input value={selected.knownRole} onChange={(event) => update({ knownRole: event.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input value={selected.phoneNumbers} onChange={(event) => update({ phoneNumbers: event.target.value })} /></div>
            <div className="form-group"><label>Email</label><input value={selected.emails} onChange={(event) => update({ emails: event.target.value })} /></div>
            <div className="form-group"><label>Relationship</label><input value={selected.relationshipToCase} onChange={(event) => update({ relationshipToCase: event.target.value })} /></div>
            <div className="form-group"><label>Last contact</label><input type="date" value={selected.lastContact} onChange={(event) => update({ lastContact: event.target.value })} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
            <div className="card" style={{ marginBottom: 0, padding: 14, borderLeft: "3px solid var(--accent-purple)" }}><div className="card-header" style={{ marginBottom: 9 }}><h3>Private notes</h3></div><textarea value={selected.privateFieldNotes} onChange={(event) => update({ privateFieldNotes: event.target.value })} placeholder="Your observations, reminders, and questions." /></div>
            <div className="card" style={{ marginBottom: 0, padding: 14, borderLeft: "3px solid var(--accent-amber)" }}><div className="card-header" style={{ marginBottom: 9 }}><h3>Neutral summary</h3></div><textarea value={selected.courtSafeNotes} onChange={(event) => update({ courtSafeNotes: event.target.value })} placeholder="Source-supported, professional wording for later review." /></div>
          </div>

          <ContactResearchPanel contact={selected} onUpdate={update} />

          <div className="card" style={{ marginTop: 16, marginBottom: 0, padding: 14 }}>
            <div className="card-header" style={{ marginBottom: 10 }}><h3>History</h3></div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}><input style={{ flex: 1 }} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note or a follow-up..." /><button className="btn btn-ghost btn-sm" type="button" onClick={addNote}><ClipboardList size={14} /> Add</button></div>
            <div className="timeline">{(selected.interactionHistory || []).length === 0 && <div className="empty-state" style={{ padding: 16 }}><p>No history yet.</p></div>}{(selected.interactionHistory || []).map((entry) => <div className="timeline-item" key={entry.id}><div className={`timeline-dot ${entry.summary.startsWith("[Research") ? "blue" : "amber"}`} /><div className="timeline-content"><h4>{entry.summary}</h4><div className="date">{new Date(entry.when).toLocaleString()}</div></div></div>)}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
