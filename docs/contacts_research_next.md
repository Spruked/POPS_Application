# People & Dossiers: Current Build and Next Work

## Current Build

Contacts now open the People & Dossiers workspace. Each person has:

- identity and role fields
- organization, phone, email, relationship, and last-contact fields
- private notes and neutral summary fields
- a user-started research workspace
- web, news, and platform search launch buttons
- saved research findings with a status, source, reference, and notes
- a local history timeline

The current research entries are stored in the existing contact `interactionHistory` so they persist through the same Tauri/SQLite dossier path already used by the application.

## Required Next Work

1. Replace the temporary history-string storage with normalized research tables.
2. Add a research item model with:
   - id
   - contact id
   - query
   - provider
   - source title
   - source URL or reference
   - captured text
   - user note
   - source type
   - status: source-backed, user-provided, heard elsewhere, needs verification
   - created time and updated time
   - evidence, event, order, and timeline links
3. Add local provider settings for optional search APIs. Credentials must remain local and encrypted where available.
4. Add provider adapters behind TPC approval. The UI must never call a provider directly.
5. Add a result-review screen so search results can be saved as findings only after the user chooses them.
6. Add import support for a user-provided document, screenshot, or saved webpage reference.
7. Preserve the distinction among direct observation, source-backed information, second-hand information, and unverified leads.
8. Add a confirmation-and-receipt flow for any durable write or export.

## Required Control Path

```text
People & Dossiers UI
-> POPS assistant / research controller
-> TPC policy and intent route
-> approved provider or local source adapter
-> reviewed result or pending finding
-> user confirmation
-> Tauri / SQLite durable write
-> receipt
-> visible success message
```

The system should support user-directed research. It should not silently run background searches, silently enrich a contact, or send private case records to an external provider.
