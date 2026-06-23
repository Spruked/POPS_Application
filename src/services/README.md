# POPS Assistant Services

- `popsCaseCommandMcp.ts` — local Case Command MCP tool adapter.
- `popsAssistantRouting.ts` — deterministic selection of case command versus reasoning.
- `tpcClient.ts` — client for the local TPC pipeline service.
- `popsAssistantRuntime.ts` — runtime composition for the POPS assistant surface.

The language model is not the source of truth. It is a replaceable cognitive and articulation component after structured local retrieval and TPC processing.
