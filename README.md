# P.O.P.S. - Proof of Presence

P.O.P.S. is a local-first desktop legal evidence and case management application built with Tauri, React, TypeScript, Rust, and SQLite.

The public POPS website now lives in its own separate repository. This repository is focused on the P.O.P.S. desktop application and its local TPC ORB integration.

Related repository:

```text
https://github.com/Spruked/POPS_website.git
```

## Architecture

| Layer | Path | Role |
|-------|------|------|
| P.O.P.S. desktop app | `./` | Main Tauri + React application |
| P.O.P.S. Rust backend | `src-tauri/src/main.rs` | Local SQLite commands and desktop runtime |
| P.O.P.S. frontend | `src/` | Case management UI and floating ORB assistant |
| TPC Website ORB | `Triple_Predicate_Cubed/tpc_website_orb/` | Cognitive layer and ORB assistant backend |
| TPC FastAPI backend | `Triple_Predicate_Cubed/tpc_website_orb/backend/main.py` | `/health`, `/api/v1/reason`, and websocket pipeline feed |
| TPC pipeline | `Triple_Predicate_Cubed/tpc_website_orb/tpc_core/pipeline/tpc_pipeline.py` | Full cognitive pipeline wiring |

## Current Reasoning Boundary

- TPC/governance is the reasoning authority.
- LLM layers are articulation/output support only.
- The floating app ORB currently sends user text to local Ollama and injects the POPS Lexicon as fixed context.
- The TPC Website ORB backend remains the local reasoning service for `/health`, `/api/v1/reason`, `/api/v1/speak`, and websocket pipeline traffic.
- Browser speech recognition is used only after user permission through the browser/Tauri webview.

## Gate 1 Input Design

- Faster-Whisper is the primary STT/input gateway.
- Qwen STT is optional.
- CP 3.0 is a sidecar acoustic feature enhancer.
- CP 3.0 is not the primary STT engine.
- Qwen 3 TTS is not part of Gate 1.
- Deprecated ACP names are retained only as a compatibility shim.

## Startup

Start the TPC Website ORB backend first:

```powershell
cd C:\dev\Desktop\P-O-P-S\proof_of_presence\Triple_Predicate_Cubed\tpc_website_orb
python backend\main.py
```

Expected backend port:

```text
http://127.0.0.1:8000
```

Then start the P.O.P.S. desktop app:

```powershell
cd C:\dev\Desktop\P-O-P-S\proof_of_presence
npm run tauri dev
```

Expected Vite/Tauri frontend port:

```text
http://127.0.0.1:18020
```

For a frontend-only app check:

```powershell
npm run dev
```

For a production frontend build check:

```powershell
npm run build
```

For the Rust/Tauri compile gate:

```powershell
cd src-tauri
cargo check
```

## Backend Checks

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Method POST `
  -Uri http://127.0.0.1:8000/api/v1/reason `
  -ContentType application/json `
  -Body '{"input":"test P.O.P.S. ORB reasoning","input_type":"text"}'
```

## Frontend / ORB Assistant

The floating ORB assistant is mounted from:

```text
src/components/OrbAssistant.tsx
```

It calls local Ollama by default:

```text
GET  http://127.0.0.1:11434/api/tags
POST http://127.0.0.1:11434/api/generate
```

Configurable environment values:

```text
VITE_OLLAMA_BASE_URL=http://127.0.0.1:11434
VITE_OLLAMA_MODEL=llama3.2:1b
```

The Orb injects this local reference before user prompts:

```text
src/data/popslexicon.md
```

It also uses browser speech APIs when available:

```text
SpeechRecognition
webkitSpeechRecognition
speechSynthesis
```

## Doctrine / Lexicon Surfaces

The app includes the same core POPS doctrine as the website:

```text
src/pages/Declaration.tsx
src/pages/Pledge.tsx
src/pages/Lexicon.tsx
src/data/doctrine.ts
src/data/lexicon.ts
src/data/popslexicon.md
```

Navigation entries are registered in:

```text
src/components/Sidebar.tsx
src/types.ts
src/App.tsx
```

Doctrine rule:

- Declaration, Creed/Pledge, and Lexicon exist in both the website and app.
- Website versions are public-facing.
- App versions are user-facing and tied to the local case command environment.
- The Orb references the app-side lexicon markdown for court-safe language guidance.

App / ORB Lexicon direction:

```text
pops_core_doctrine.md
pops_legal_terms.md
pops_constitutional_terms.md
pops_evidence_terms.md
pops_rewrite_rules.md
pops_annotation_labels.md
pops_support_terms.md
pops_visitation_terms.md
```

Current V1 uses a single Orb-loaded markdown file:

```text
src/data/popslexicon.md
```

The modular split above is the next production hardening step so the Orb can always load core doctrine, annotation labels, and rewrite rules while loading legal, constitutional, evidence, support, and visitation terms only when needed.

## Main Project Structure

See the local structure snapshot:

```text
C:\dev\Desktop\P-O-P-S\proof_of_presence\proof_structure.txt
```

Generated dependency/build folders are intentionally excluded from that structural snapshot:

```text
node_modules/
dist/
src-tauri/target/
__pycache__/
```

## Data Storage

P.O.P.S. stores local data in SQLite through the Tauri backend.

Database file:

```text
proof_of_presence.db
```

Windows app data location:

```text
%APPDATA%\com.proofofpresence.app\
```

Preserved original evidence files are copied into app-managed local storage:

```text
%APPDATA%\com.proofofpresence.app\evidence_originals\
```

Imported originals are not modified or overwritten by the app. The imported file is copied into a per-evidence folder, hashed, and then referenced by the SQLite evidence record.

## Evidence Security

Implemented V1 integrity features:

- SHA-256 hash for sealed records.
- SHA-256 hash for imported evidence files.
- SHA-256 hash for imported communication exports.
- Preserved original file path stored with each file-backed evidence record.
- Preserved original message export path stored with each communication import.
- Evidence metadata snapshot:
  - file name
  - file size
  - file type
  - original modified time
  - imported time
  - source description
  - TrustGlyph risk
- Evidence chain-of-custody rows for:
  - `EVIDENCE_SAVED`
  - `EVIDENCE_DELETED`
  - `HASH_VERIFIED`
  - `HASH_MISMATCH`
  - `MISSING_FILE`
- Verify Integrity action in the Evidence Detail view.
- Tamper-evident audit ledger hash chain for sealed records:
  - `payload_hash`
  - `previous_ledger_hash`
  - `ledger_entry_hash`
- SQLite audit ledger indexes:
  - `created_at`
  - `ledger_entry_hash`
  - `previous_ledger_hash`
  - `record_id`
- App startup ledger walk:
  - recalculates each ledger row hash
  - confirms each `previous_ledger_hash` points to the prior row
  - reports `VERIFIED` or `BREACH`
  - displays `Integrity Alert: Audit Ledger Breach Detected` on breach

Implemented communication evidence import:

- Imports PDF, TXT, HTML, CSV, and screenshot/image message exports.
- Preserves the original export under local app-managed storage.
- Hashes the original export immediately.
- Extracts readable messages from TXT, HTML, and CSV when possible.
- Detects timestamps, sender data, recipient data, and participant context when present.
- Flags missing context, missing timestamps, missing sender data, limited PDF extraction, and screenshot risk.
- Separates native exports from screenshot/image exports.
- Creates an Evidence Vault record for the imported communication export.
- Creates a linked communication timeline event.
- Writes a chain-of-custody entry for `COMMUNICATION_EXPORT_IMPORTED`.
- Generates a court-safe communication summary.

Implemented incident intake:

- Creates SQLite-backed incident records.
- Supports denied visit-specific fields:
  - scheduled start/end
  - arrival time
  - exchange location
  - who denied/interfered
  - child present status
  - reason given
  - attempted contact/mitigation
- Links evidence records to incidents.
- Generates a court-safe incident summary.
- Creates a linked timeline event for each incident.
- Applies TrustGlyph risk scoring based on missing proof/context.

Ledger storage rule:

- SQLite is the source of truth.
- JSON is used only inside structured metadata fields and future export/backup manifests.
- The primary audit ledger is not a flat JSON file.
- Ledger tamper tests should mutate SQLite rows, not a JSON ledger file.

Implemented V1 access/safety status:

- All storage is local-first.
- SQLite database persists in app data.
- Original evidence files persist in app data.
- Full database encryption and app PIN lock are not implemented yet.

## Known Current Status

- Root React/Vite build has passed.
- TPC Website ORB backend has passed `/health` and `/api/v1/reason` smoke tests.
- Tauri/Rust `cargo check` has passed.
- Evidence Vault now preserves imported originals, stores metadata, verifies file integrity, and maintains custody/security ledgers.
- App includes Declaration, Creed/Pledge, and Lexicon surfaces.
- Floating ORB is Lexicon Guided through `src/data/popslexicon.md`.
