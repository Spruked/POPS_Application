import { useEffect, useMemo, useState } from 'react';
import { Plus, Users, Search, ClipboardList, Link2 } from 'lucide-react';
import { useEvidenceStore, useEventStore, usePlayersStore, useViolationStore } from '../hooks/useStore';
import { generateId } from '../utils/helpers';
import type { PlayerDossierRecord, PlayerInteractionLog } from '../types';

type PlayerRole =
  | 'My attorney'
  | 'Former attorney'
  | 'Consulted attorney'
  | 'Opposing attorney'
  | 'Judge'
  | 'Court clerk'
  | 'Prosecutor'
  | 'Guardian ad litem'
  | 'Mediator'
  | 'Parent coordinator'
  | 'Case worker'
  | 'School contact'
  | 'Medical contact'
  | 'Police officer'
  | 'DOR / child support worker'
  | 'Witness'
  | 'Advocate'
  | 'Forensic consultant'
  | 'Other parent'
  | 'Family member'
  | 'Other involved person';

interface Player extends PlayerDossierRecord {
  name: string;
  role: PlayerRole;
  knownRole: string;
  organization: string;
  phoneNumbers: string;
  emails: string;
  address: string;
  relationshipToCase: string;
  status: 'active' | 'watch' | 'inactive';
  lastContact: string;
  followUpNeeded: boolean;
  conflictConcern: boolean;
  documentsRequested: string;
  documentsProvided: string;
  linkedEvidence: string;
  linkedIncidents: string;
  linkedTimelineEvents: string;
  privateFieldNotes: string;
  courtSafeNotes: string;
  interactionHistory: PlayerInteractionLog[];
}

const ROLE_OPTIONS: readonly PlayerRole[] = [
  'My attorney',
  'Former attorney',
  'Consulted attorney',
  'Opposing attorney',
  'Judge',
  'Court clerk',
  'Prosecutor',
  'Guardian ad litem',
  'Mediator',
  'Parent coordinator',
  'Case worker',
  'School contact',
  'Medical contact',
  'Police officer',
  'DOR / child support worker',
  'Witness',
  'Advocate',
  'Forensic consultant',
  'Other parent',
  'Family member',
  'Other involved person',
];

function makeBlankPlayer(): Player {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: '',
    role: 'Other involved person',
    knownRole: '',
    organization: '',
    phoneNumbers: '',
    emails: '',
    address: '',
    relationshipToCase: '',
    status: 'active',
    lastContact: '',
    followUpNeeded: false,
    conflictConcern: false,
    documentsRequested: '',
    documentsProvided: '',
    linkedEvidence: '',
    linkedIncidents: '',
    linkedTimelineEvents: '',
    privateFieldNotes: '',
    courtSafeNotes: '',
    interactionHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

export default function PlayersDossier() {
  const evidence = useEvidenceStore();
  const events = useEventStore();
  const violations = useViolationStore();
  const playersStore = usePlayersStore();

  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [newInteraction, setNewInteraction] = useState('');

  const players = playersStore.items as Player[];

  const selected = players.find((p) => p.id === selectedId) ?? players[0];

  useEffect(() => {
    if (!selectedId && players.length > 0) {
      setSelectedId(players[0].id);
    }
  }, [players, selectedId]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.organization.toLowerCase().includes(q)
    );
  }, [players, query]);

  function updateSelected(updates: Partial<Player>) {
    if (!selected) return;
    void playersStore.update(selected.id, updates);
  }

  function addPlayer() {
    const next = makeBlankPlayer();
    void playersStore.add(next);
    setSelectedId(next.id);
  }

  function addInteraction() {
    const text = newInteraction.trim();
    if (!text || !selected) return;
    const log: PlayerInteractionLog = {
      id: generateId(),
      when: new Date().toISOString(),
      summary: text,
    };
    updateSelected({ interactionHistory: [log, ...selected.interactionHistory] });
    setNewInteraction('');
  }

  if (!selected) {
    return (
      <div>
        <div className="page-header">
          <h2>The Players Dossier</h2>
          <p>Complete contact/person/entity database for everyone involved in your case.</p>
        </div>

        {!playersStore.loaded && <p>Loading dossier...</p>}
        {playersStore.loaded && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p>No players recorded yet. Start your dossier now.</p>
            <button className="btn btn-primary btn-sm" onClick={addPlayer}>
              <Plus size={14} /> Add Player
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>The Players Dossier</h2>
        <p>Players, contact intelligence, paper trail, and field notes under pressure.</p>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={18} className="trust-blue" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Known Players</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {players.length} total | {players.filter((p) => p.followUpNeeded).length} follow-up needed
            </div>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={addPlayer}>
          <Plus size={14} /> Add Player
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <div className="card" style={{ marginBottom: 0, padding: 16 }}>
          <div className="search-bar" style={{ marginBottom: 12 }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players..."
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredPlayers.map((p) => (
              <button
                key={p.id}
                className={`nav-item ${p.id === selected.id ? 'active' : ''}`}
                style={{ width: '100%', margin: 0 }}
                onClick={() => setSelectedId(p.id)}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name || 'Unnamed Player'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.role}</div>
                </div>
                {p.followUpNeeded && <span className="nav-badge">Follow-Up</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h3>Contact Intelligence</h3>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Name</label>
              <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={selected.role} onChange={(e) => updateSelected({ role: e.target.value as PlayerRole })}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Known Role</label>
              <input value={selected.knownRole} onChange={(e) => updateSelected({ knownRole: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Organization / Office</label>
              <input value={selected.organization} onChange={(e) => updateSelected({ organization: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Phone Numbers</label>
              <input value={selected.phoneNumbers} onChange={(e) => updateSelected({ phoneNumbers: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Emails</label>
              <input value={selected.emails} onChange={(e) => updateSelected({ emails: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={selected.address} onChange={(e) => updateSelected({ address: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Relationship to Case</label>
              <input value={selected.relationshipToCase} onChange={(e) => updateSelected({ relationshipToCase: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={selected.status} onChange={(e) => updateSelected({ status: e.target.value as Player['status'] })}>
                <option value="active">Active</option>
                <option value="watch">Watch</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="form-group">
              <label>Last Contact</label>
              <input type="date" value={selected.lastContact} onChange={(e) => updateSelected({ lastContact: e.target.value })} />
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label>Follow-Up Needed</label>
              <select
                value={selected.followUpNeeded ? 'yes' : 'no'}
                onChange={(e) => updateSelected({ followUpNeeded: e.target.value === 'yes' })}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label>Conflict Concern</label>
              <select
                value={selected.conflictConcern ? 'yes' : 'no'}
                onChange={(e) => updateSelected({ conflictConcern: e.target.value === 'yes' })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Documents Requested</label>
              <textarea value={selected.documentsRequested} onChange={(e) => updateSelected({ documentsRequested: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Documents Provided</label>
              <textarea value={selected.documentsProvided} onChange={(e) => updateSelected({ documentsProvided: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Linked Evidence</label>
              <input value={selected.linkedEvidence} onChange={(e) => updateSelected({ linkedEvidence: e.target.value })} placeholder="evidence_id_1, evidence_id_2" />
            </div>
            <div className="form-group">
              <label>Linked Incidents</label>
              <input value={selected.linkedIncidents} onChange={(e) => updateSelected({ linkedIncidents: e.target.value })} placeholder="incident_id_1, incident_id_2" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Linked Timeline Events</label>
              <input value={selected.linkedTimelineEvents} onChange={(e) => updateSelected({ linkedTimelineEvents: e.target.value })} placeholder="event_id_1, event_id_2" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
            <div className="card" style={{ marginBottom: 0, padding: 14 }}>
              <div className="card-header" style={{ marginBottom: 10 }}>
                <h3>Private Field Notes</h3>
              </div>
              <textarea
                value={selected.privateFieldNotes}
                onChange={(e) => updateSelected({ privateFieldNotes: e.target.value })}
                placeholder="Memory aid only. Not for export."
              />
            </div>
            <div className="card" style={{ marginBottom: 0, padding: 14 }}>
              <div className="card-header" style={{ marginBottom: 10 }}>
                <h3>Court-Safe Notes</h3>
              </div>
              <textarea
                value={selected.courtSafeNotes}
                onChange={(e) => updateSelected({ courtSafeNotes: e.target.value })}
                placeholder="Professional language for sharing/export."
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, marginBottom: 0, padding: 14 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <h3>Contact Log</h3>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                style={{ flex: 1 }}
                value={newInteraction}
                onChange={(e) => setNewInteraction(e.target.value)}
                placeholder="Add interaction summary..."
              />
              <button className="btn btn-ghost btn-sm" onClick={addInteraction}>
                <ClipboardList size={14} /> Add
              </button>
            </div>
            <div className="timeline">
              {selected.interactionHistory.length === 0 && (
                <div className="empty-state" style={{ padding: 20 }}>
                  <p>No interactions logged yet.</p>
                </div>
              )}
              {selected.interactionHistory.map((entry) => (
                <div key={entry.id} className="timeline-item">
                  <div className="timeline-dot blue" />
                  <div className="timeline-content">
                    <h4>{entry.summary}</h4>
                    <div className="date">{new Date(entry.when).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, marginBottom: 0, padding: 14 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <h3>Paper Trail and Hard Evidence</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 10 }}>
              <div className="badge badge-blue" style={{ justifyContent: 'center' }}>
                <Link2 size={12} style={{ marginRight: 6 }} /> Evidence: {evidence.items.length}
              </div>
              <div className="badge badge-amber" style={{ justifyContent: 'center' }}>
                <Link2 size={12} style={{ marginRight: 6 }} /> Timeline: {events.items.length}
              </div>
              <div className="badge badge-red" style={{ justifyContent: 'center' }}>
                <Link2 size={12} style={{ marginRight: 6 }} /> Violations: {violations.items.length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
