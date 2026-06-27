import { ExternalLink, MessageCircle, Users } from "lucide-react";

export default function CommunityBridge() {
  return (
    <div>
      <div className="page-header">
        <h2>Community Bridge</h2>
        <p>Support, shared experience, and connection—when you choose it.</p>
      </div>

      <section className="card" style={{ maxWidth: 760, borderLeft: "3px solid var(--accent-purple)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div className="orb-mini-dot" style={{ width: 42, height: 42, flex: "0 0 auto" }} />
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><Users size={18} /> POPS Community</h3>
            <p style={{ marginTop: 8, color: "var(--text-muted)", lineHeight: 1.55 }}>
              The POPS website community is planned for peer rooms, shared experience, resources, and optional member messaging. It will live on the website, not inside the local case workspace.
            </p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 18, marginBottom: 0, padding: 14, background: "rgba(13, 39, 76, 0.42)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><MessageCircle size={16} className="trust-blue" /><strong>Coming later</strong></div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
            The future website platform will provide community rooms and messaging through a separate, opt-in website account. Nothing from your local POPS records, evidence, calendar, timeline, dossiers, or notes will be shared automatically.
          </p>
        </div>

        <button className="btn btn-ghost" type="button" disabled style={{ marginTop: 18 }}>
          <ExternalLink size={16} /> Website community not launched yet
        </button>
      </section>
    </div>
  );
}
