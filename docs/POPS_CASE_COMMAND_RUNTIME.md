# POPS Case Command Runtime

## Doctrine

POPS is not built around the limits of one language model. The language model is a replaceable cognitive and articulation component. The durable system is:

1. **TPC** — evaluates inputs, retrieves context, checks coherence, and governs intent.
2. **POPS Case Command MCP** — exposes structured, local case tools.
3. **Local case substrate** — Tauri + SQLite, evidence originals, audit ledger, and verified links.
4. **Assistant surface** — displays results, drafts, confirmations, and receipts.

The assistant may be replaced without replacing the case substrate, MCP tool contracts, audit history, or TPC doctrine.

## Runtime path

```text
User voice/text
  -> TPC request evaluation
  -> MCP tool selection
  -> Local Tauri/SQLite operation
  -> Structured result / receipt
  -> TPC coherence and provenance review
  -> Assistant response or confirmation card
```

## Case Command tool families

- `pops.contacts.*`
- `pops.calls.*`
- `pops.communications.*`
- `pops.documents.*`
- `pops.evidence.*`
- `pops.timeline.*`
- `pops.calendar.*`
- `pops.orders.*`
- `pops.incidents.*`
- `pops.reports.*`
- `pops.case_profile.*`
- `pops.audit.*`

## Action contract

Every case command carries an authority state:

```text
READ -> DRAFT -> CONFIRM -> WRITE -> RECEIPT
```

- **READ:** returns local records only.
- **DRAFT:** generates a structured proposed action; no case data is changed.
- **CONFIRM:** binds the user to the exact proposed action.
- **WRITE:** executes only the confirmed action through the local substrate.
- **RECEIPT:** returns an immutable record of success/failure, affected record IDs, timestamps, and audit linkage.

## Non-negotiable constraints

- POPS is local-first. The case owner controls their own local case file.
- No model may claim a record was saved, updated, deleted, organized, linked, or exported unless a local command returns a receipt.
- Original evidence files are preserved. Organization changes indexes, links, tags, categories, summaries, and packet membership—not the original source content.
- The assistant may extract, sort, summarize, and propose. TPC and the local command layer determine allowed data access and durable actions.
- The assistant is not legal counsel and does not determine legal conclusions, violations, fault, or case outcomes.

## First production slice

The first complete proof path is not merely calendar access. It is:

1. Query contacts, calls, documents, timeline, and calendar as one scoped case view.
2. Let TPC assess source coherence and gaps.
3. Present a user-reviewable draft that links records.
4. Save confirmed links through the local database and ledger.
5. Return a receipt that the assistant can report exactly.
