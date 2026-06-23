# POPS Case Command Build Status

Branch: `feat/pops-tpc-mcp-case-command`

Initial runtime foundation:

- Read adapter: contacts, communications, documents, timeline, and upcoming calendar items.
- Routing layer: structured local reads do not go through a language model first.
- TPC client: calls the existing local TPC reasoning service.
- Assistant runtime: joins the command layer and TPC.

Next native slice: connect the assistant surface, confirm current Tauri helper names, expose communications reads, then add confirmed writes and receipts.
