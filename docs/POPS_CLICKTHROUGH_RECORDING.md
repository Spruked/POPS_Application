# POPS Click-Through Recording Runbook

Purpose: capture a short, repeatable screen recording of the real POPS desktop application for the public "See POPS in Action" page.

## Recording safety boundary

Use demo/sanitized records only. Do not record real child names, medical records, school information, court documents, private messages, addresses, phone numbers, account credentials, case numbers, or evidence belonging to a real person.

The public recording should demonstrate system behavior, not expose real case content.

## Target recording

- Format: MP4 (H.264 video + AAC audio preferred)
- Aspect ratio: 16:9
- Resolution: 1920x1080 preferred
- Length: approximately 2-4 minutes
- Cursor: visible
- Notifications: off
- Desktop/taskbar clutter: minimized
- App window: maximized
- Audio: clear narration, no copyrighted background music
- Final website asset path: `public/media/pops-in-action.mp4`

## Deterministic click-through

### 1. Dashboard — opening frame
Show the main Dashboard for 8-12 seconds.

Narration target:
"POPS is a local-first case command and evidence workstation. The dashboard brings case activity, records, deadlines, evidence, and review status into one working environment."

### 2. Contacts
Open Contacts and show a sanitized dossier entry.

Show:
- role/category
- source provenance
- verification status
- linked records

Narration target:
"People are documented as structured case records, with source and verification context instead of loose notes."

### 3. Calendar / parenting time
Open Calendar and show one demo parenting-time or exchange record.

Show:
- scheduled date/time
- status
- location
- order reference
- attempted contact or note

Narration target:
"Parenting-time events and exchanges become dated records that can be connected back to orders and supporting evidence."

### 4. Legal
Open Legal / Court Orders.

Show one sanitized order and related case linkage.

Narration target:
"Court orders and legal records stay connected to the case rather than living as isolated files."

### 5. Events / incidents
Open Events or Incidents and show one demo denied-visit or communication event.

Show:
- factual description
- court-safe summary
- linked evidence
- TrustGlyph risk or verification state if visible

Narration target:
"POPS separates what was entered, what is supported, and what still needs verification."

### 6. Evidence Vault
Open Evidence.

Show:
- one sanitized imported file
- SHA-256 hash
- metadata
- preserved original
- integrity verification / chain-of-custody view if available

Narration target:
"Evidence is preserved with integrity information so the user can show what was stored and whether it still matches the original record."

### 7. Glyph Trace / auditability
Open Glyph Trace.

Show one record relationship or trace entry.

Narration target:
"Material activity leaves a trace so records can be reconstructed instead of silently changing."

### 8. Reports
Open Reports.

Show the available report/case-bundle surface. Do not export a real case.

Narration target:
"The same structured records can be assembled into reviewable timelines, evidence indexes, reports, and case bundles."

### 9. POPS Assistant
Open the POPS Assistant and ask a safe demo question tied to demo records, for example:

"What records do I have for the denied exchange?"

The expected demonstration should show that the assistant works from supplied POPS/Vault context and does not invent missing case facts.

Narration target:
"The assistant can reason over the records, but the records remain the authority."

### 10. Closing frame
Return to Dashboard.

Closing narration target:
"Preserve. Protect. Prove. POPS keeps the working record local and gives the user a structured way to document presence."

## Recording acceptance checks

Before publishing, verify:

- no real/private case data appears anywhere in the video
- no passwords, tokens, local file paths containing private names, or notifications are visible
- no broken page or failed command appears in the recording
- evidence hash/integrity UI shown is operating on demo data
- assistant answer is grounded in visible demo context
- video can be understood without rapid clicking
- final MP4 plays from beginning to end
- captions are created before public release when practical

## Website handoff

Copy the final file to the POPS website repository at:

`public/media/pops-in-action.mp4`

The website route is:

`/see-pops-in-action`

The page is already designed to use that file automatically.
