# Pops Assistant Design Foundation

Pops is the in-app case-work assistant for P.O.P.S. It is a deliberate assistant dock, not a developer console.

The initial UI foundation contains a customer-safe welcome area, task cards, a composer, and an Assistant Engine section. It must not show raw model endpoints, internal pipeline labels, or false ready claims.

The future control path is:

Pops UI -> POPS assistant controller -> TPC governance -> ANSKG navigation and lexicon -> approved adapters -> confirmation -> Tauri/SQLite action -> receipt -> governed response.

An optional local or API language model can improve articulation but is not the authority for case facts, permissions, confirmations, or durable writes.

Assistant modes:

- Core Guided Mode: no model required.
- Recommended Local Model: optional local model for richer conversation.
- Custom API Model: optional user-selected provider with a privacy notice.
