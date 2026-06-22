# P.O.P.S. - Proof of Presence Desktop App

P.O.P.S. is a local-first desktop evidence and case command application built with Tauri, React, TypeScript, Rust, and SQLite.

This repository is the desktop application only. The public website lives in a separate repository:

```text
https://github.com/Spruked/POPS_website.git
```

Current pushed head before the local handoff/README update:

```text
bda73a3 Separate member command from dashboard
```

## Current App Boundary

- The app owns local-first case command workflows.
- The app owns evidence storage, chain-of-custody, local SQLite records, desktop runtime, and ORB shell.
- The website owns public doctrine, SEO, access/download/account-facing public pages, and public marketing/navigation.
- The website does not own local evidence storage or ORB runtime decisions.

## Commands

Install:

```powershell
npm install

Frontend-only dev:

```powershell
npm run dev
```

Tauri desktop dev:

```powershell
npm run tauri dev
```

Production frontend build gate:

```powershell
npm run build
```

Rust/Tauri compile gate:

```powershell
cd src-tauri
cargo check
```

Expected Vite/Tauri frontend port:

```text
http://127.0.0.1:18020
```

## App Navigation

The app has one main Dashboard. It is the app landing/main page and is not duplicated under Members.

Main command sections:

```text
Dashboard
Contacts
Calendar
Legal
Events
Evidence
Members
About
Reports
Settings
```

Members is for member/account/license/download/access workflows only.

Missing operational subpages currently render through:

```text
src/pages/CommandPlaceholder.tsx
```

Navigation entries and page ids are wired through:

```text
src/components/Sidebar.tsx
src/types.ts
src/App.tsx
```

## Doctrine Pages

App doctrine and identity pages:

```text
src/pages/AboutMission.tsx
src/pages/Mission.tsx
src/pages/Doctrine.tsx
src/pages/HowItWorks.tsx
src/pages/Declaration.tsx
src/pages/Pledge.tsx
src/pages/Lexicon.tsx
src/pages/AccessBrotherhood.tsx
```

Do not change doctrine wording unless new wording is explicitly provided.

## Validated Lexicon Source

The Lexicon source of truth is JSON:

```text
src/data/popslexicon.json
```

Validation and schema files:

```text
src/data/popslexicon.schema.json
src/data/validatePopsLexicon.ts
src/data/lexicon.ts
```

Rules:

- Do not recreate `popslexicon.md` as a runtime source.
- Do not duplicate Lexicon definitions manually in page text.
- Render Lexicon pages from validated JSON.
- ORB guidance must come from validated JSON.
- If validation fails, Lexicon guidance is disabled.

Failure message:

```text
POPS Lexicon validation failed. Lexicon guidance disabled until repaired.
```

Current validation checks:

- required fields
- semantic version format, currently `1.0.0`
- duplicate term names
- high-sensitivity terms exist in `terms`
- high-sensitivity terms are marked `high`
- required UI behavior flags

## ORB Assistant

ORB component:

```text
src/components/OrbAssistant.tsx
```

Local Ollama defaults:

```text
GET  http://127.0.0.1:11434/api/tags
POST http://127.0.0.1:11434/api/generate
```

Configurable environment values:

```text
VITE_OLLAMA_BASE_URL=http://127.0.0.1:11434
VITE_OLLAMA_MODEL=llama3.2:1b
```

App context direction:

```text
src/data/appContext.ts
```

ORB should be prepared to read structured local app context:

```text
contacts
calendar
reminders
evidence metadata
court orders
violations
events
reports
case profile
lexicon
support tracker
parenting plan
players dossier
```

ORB permission model:

```text
read
suggest
draft
create pending record after confirmation
modify after confirmation
export after confirmation
delete only after explicit confirmation
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

Storage rule:

- SQLite is the source of truth.
- Originals are preserved.
- JSON is used for structured data/config/export surfaces where appropriate.
- The audit ledger is SQLite-backed, not a flat JSON file.

## Implemented Evidence Integrity

- SHA-256 hash for sealed records.
- SHA-256 hash for imported evidence files.
- SHA-256 hash for imported communication exports.
- Preserved original file path stored with each file-backed evidence record.
- Preserved message export path stored with communication imports.
- Evidence metadata snapshots.
- Chain-of-custody rows.
- Verify Integrity action in Evidence Detail.
- Tamper-evident audit ledger hash chain.
- Startup ledger verification.
- Communication export import.
- Incident intake with court-safe summaries and TrustGlyph risk scoring.

## Current Build Status

Most recent app build passed:

```powershell
npm run build
```

Most recent pushed head before this local doc update:

```text
bda73a3 Separate member command from dashboard
```

Do not assume README/handoff updates are pushed. Bryan explicitly requested no push for this handoff update.
