import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import DictationButton from "../components/DictationButton";
import { useProfileStore } from "../hooks/useStore";
import { useToast } from "../hooks/useToast";
import type { CaseProfile } from "../types";

function insertTranscriptAtCursor(
  currentValue: string,
  transcript: string,
  textarea: HTMLTextAreaElement | null,
) {
  const cleanTranscript = transcript.trim();

  if (!cleanTranscript) {
    return currentValue;
  }

  if (!textarea) {
    return `${currentValue}${currentValue.trim() ? "\n" : ""}${cleanTranscript}`;
  }

  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;

  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);

  const addLeadingSpace =
    before.length > 0 &&
    !/\s$/.test(before) &&
    !/^\s/.test(cleanTranscript);

  const addTrailingSpace =
    after.length > 0 &&
    !/^\s/.test(after) &&
    !/\s$/.test(cleanTranscript);

  return `${before}${addLeadingSpace ? " " : ""}${cleanTranscript}${
    addTrailingSpace ? " " : ""
  }${after}`;
}

export default function Profile() {
  const { profile, update, loaded } = useProfileStore();
  const { show } = useToast();

  const [draft, setDraft] = useState<CaseProfile>(profile);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (loaded) {
      setDraft(profile);
    }
  }, [loaded, profile]);

  async function handleSave() {
    try {
      await update(draft);
      show("Profile saved");
    } catch {
      show("Profile could not be saved.", "error");
    }
  }

  function insertDictatedNotes(transcript: string) {
    const nextNotes = insertTranscriptAtCursor(
      draft.notes,
      transcript,
      notesRef.current,
    );

    setDraft((current) => ({
      ...current,
      notes: nextNotes,
    }));

    requestAnimationFrame(() => {
      notesRef.current?.focus();
      notesRef.current?.setSelectionRange(nextNotes.length, nextNotes.length);
    });
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
            <input
              value={draft.caseName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  caseName: event.target.value,
                }))
              }
              placeholder="e.g., Smith v. Johnson"
            />
          </div>

          <div className="form-group">
            <label>Case Type</label>
            <select
              value={draft.caseType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  caseType: event.target.value,
                }))
              }
            >
              <option>Family Law - Custody</option>
              <option>Family Law - Parenting Time</option>
              <option>Family Law - Support</option>
              <option>Family Law - Modification</option>
              <option>Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Client Name</label>
            <input
              value={draft.clientName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  clientName: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label>Opposing Party</label>
            <input
              value={draft.opposingParty}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  opposingParty: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label>Attorney Name</label>
            <input
              value={draft.attorneyName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  attorneyName: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label>Attorney Phone</label>
            <input
              value={draft.attorneyPhone}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  attorneyPhone: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label>Attorney Email</label>
            <input
              value={draft.attorneyEmail}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  attorneyEmail: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label>Court Name</label>
            <input
              value={draft.courtName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  courtName: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label>Docket Number</label>
            <input
              value={draft.docketNumber}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  docketNumber: event.target.value,
                }))
              }
            />
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Case Notes</label>

            <textarea
              ref={notesRef}
              value={draft.notes}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Any additional notes about the case..."
              style={{ minHeight: 150 }}
            />

            <div style={{ marginTop: 10 }}>
              <DictationButton
                label="Dictate Case Notes"
                onTranscript={insertDictatedNotes}
              />
            </div>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.82rem",
                marginBottom: 0,
                marginTop: 8,
              }}
            >
              Dictation inserts editable text only. Review it before saving.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!loaded}
          >
            <Save size={16} /> Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
