import { ExternalLink, MessageCircle, ShieldCheck, Users } from "lucide-react";

export default function CommunityBridge() {
  return (
    <div>
      <div className="page-header">
        <h2>Community Bridge</h2>
        <p>A future connection to the POPS website community—available only when you choose it.</p>
      </div>

      <section className="card" style={{ maxWidth: 820, borderLeft: "3px solid var(--accent-purple)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div className="orb-mini-dot" style={{ width: 44, height: 44, flex: "0 0 auto" }} />
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><Users size={18} /> POPS Community</h3>
            <p style={{ marginTop: 8, color: "var(--text-muted)", lineHeight: 1.55 }}>
              POPS will later connect to a separate website community for fathers and parents who need support, shared experience, useful resources, and people who understand the pressure of trying to stay present for their children.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 18 }}>
          <div className="card" style={{ margin: 0, padding: 14, background: "rgba(13, 39, 76, 0.42)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><MessageCircle size={16} className="trust-blue" /><strong>Community rooms</strong></div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>Topic rooms, state and local groups, practical discussion, encouragement, resources, and shared experience.</p>
          </div>
          <div className="card" style={{ margin: 0, padding: 14, background: "rgba(13, 39, 76, 0.42)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Users size={16} className="trust-green" /><strong>Optional messaging</strong></div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>Direct messages and smaller support circles will be part of the website platform, controlled by the member’s own privacy choices.</p>
          </div>
          <div className="card" style={{ margin: 0, padding: 14, background: "rgba(13, 39, 76, 0.42)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><ShieldCheck size={16} className="trust-green" /><strong>Separate from your case file</strong></div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>Nothing from your local case records, evidence, calendar, timeline, dossiers, notes, or reports will ever be shared automatically.</p>
          </div>
          <div className="card" style={{ margin: 0, padding: 14, background: "rgba(13, 39, 76, 0.42)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><ExternalLink size={16} className="trust-purple" /><strong>Website platform</strong></div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>The community will live on the POPS website with its own opt-in account and profile—not inside the private local workspace.</p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 18, marginBottom: 0, padding: 14, borderLeft: "3px solid var(--accent-amber)" }}>
          <strong>What comes next</strong>
          <p style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55 }}>
            First comes the website community page. After that: member profiles, rooms, messaging controls, local groups, resource sharing, and a clean bridge back to this desktop application. The desktop app will only open the website link; it will not turn private case records into community content.
          </p>
        </div>

        <button className="btn btn-ghost" type="button" disabled style={{ marginTop: 18 }}>
          <ExternalLink size={16} /> Website community not launched yet
        </button>
      </section>
    </div>
  );
}
