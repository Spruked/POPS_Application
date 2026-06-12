import { User, Save } from 'lucide-react';
import { useProfileStore } from '../hooks/useStore';
import { useToast } from '../hooks/useToast';

export default function Profile() {
  const { profile, update } = useProfileStore();
  const { show } = useToast();

  function handleSave() {
    show('Profile saved');
  }

  return (
    <div>
      <div className="page-header">
        <h2>Case Profile</h2>
        <p>Case overview, baseline details, and top-level context</p>
      </div>

      <div className="card">
        <div className="form-grid">
          <div className="form-group">
            <label>Case Name</label>
            <input value={profile.caseName} onChange={e => update({ caseName: e.target.value })} placeholder="e.g., Smith v. Johnson" />
          </div>
          <div className="form-group">
            <label>Case Type</label>
            <select value={profile.caseType} onChange={e => update({ caseType: e.target.value })}>
              <option>Family Law - Custody</option>
              <option>Family Law - Visitation</option>
              <option>Family Law - Support</option>
              <option>Family Law - Modification</option>
              <option>Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Client Name</label>
            <input value={profile.clientName} onChange={e => update({ clientName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Opposing Party</label>
            <input value={profile.opposingParty} onChange={e => update({ opposingParty: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Attorney Name</label>
            <input value={profile.attorneyName} onChange={e => update({ attorneyName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Attorney Phone</label>
            <input value={profile.attorneyPhone} onChange={e => update({ attorneyPhone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Attorney Email</label>
            <input value={profile.attorneyEmail} onChange={e => update({ attorneyEmail: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Court Name</label>
            <input value={profile.courtName} onChange={e => update({ courtName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Docket Number</label>
            <input value={profile.docketNumber} onChange={e => update({ docketNumber: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Case Notes</label>
            <textarea value={profile.notes} onChange={e => update({ notes: e.target.value })} placeholder="Any additional notes about the case..." />
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={16} /> Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
