# CALI SKG v4.0 — Robustness-First Cognitive Engine

## Overview

**CALI** (Cognitively Aligned Linear Intelligence) v4.0 is a robustness-first cognitive engine implementing a 4-philosopher + 3-system-logic reasoning architecture with deterministic SoftMax arbitration, immutable memory vaults, self-healing knowledge graphs, and deterministic MORB evaluation bridges.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DOCKSTATION / USER                        │
│                         │                                     │
│                         ▼                                     │
│              ┌─────────────────────┐                          │
│              │   StateBundle v4    │  ← Desired/Runtime/       │
│              │  (cali_state_v4.py) │    Effective/Activity      │
│              └─────────────────────┘                          │
│                         │                                     │
│                         ▼                                     │
│  ┌───────────────────────────────────────────────────────┐   │
│  │              CALI SKG v4.0 CORE                        │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │  Locke  │ │  Hume   │ │  Kant   │ │ Spinoza │   │   │
│  │  │ 0.40cap │ │ 0.35cap │ │ 0.45cap │ │ 0.30cap │   │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │   │
│  │       └─────────────┴───────────┴──────────┘        │   │
│  │                     │                                 │   │
│  │              ┌──────────────┐                         │   │
│  │              │ SoftMax      │  ← Deterministic,       │   │
│  │              │ Advisory SKG │    Stateless, 0.75cap   │   │
│  │              └──────┬───────┘                         │   │
│  │                     │                                 │   │
│  │  ┌──────────────────┼──────────────────┐              │   │
│  │  │  A-Priori Vault  │  A-Posteriori    │              │   │
│  │  │  (Immutable)     │  (Append-Only)   │              │   │
│  │  └──────────────────┴──────────────────┘              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │  Cochlea │ │  Swarm   │ │  MORB    │            │   │
│  │  │  (STT)   │ │(Research)│ │(PASS/FAIL│            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │  Mesh    │ │ Diagnostic│ │ Learning │            │   │
│  │  │ Traverser│ │  Probe   │ │  Loop    │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  └───────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│              ┌─────────────────────┐                         │
│              │   Command Bridge    │  ← Runtime/Renderer      │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `cali_skg_v4.py` | Main CALI SKG engine (77978 chars) — complete reasoning, memory, swarm, diagnostics |
| `cali_state_v4.py` | State architecture module — Desired/Runtime/Effective/Activity layers + Command Bridge |
| `README.md` | This file |
| `requirements.txt` | Python dependencies |

## Key Features

### Robustness
- **Confidence Drift Mitigation**: Variance-based tension detection with 0.75 cap under disagreement
- **Pattern Lineage Tracking**: Every pattern stores `parent_id` and `generation` for full ancestry tracing
- **Self-Healing Pruning**: Automatic removal of low-confidence, orphaned, or stale patterns
- **Graceful Degradation**: Full CPU-only operation with deterministic fallback encoders
- **Tiered Diagnostics**: lightweight / standard / full probe levels

### Philosophy Engine
- **4 Philosophical Seeds**: Locke (empirical), Hume (skeptical), Kant (synthetic), Spinoza (monistic)
- **Dominance Ceilings**: Hard caps prevent any single philosopher from overriding (0.30–0.45)
- **Task Affinity**: Contextual mode switching based on query category (empirical, ethical, strategic, etc.)
- **3 System Logics**: Inductive statistical, deductive logical, intuitive holistic

### Memory System
- **A-Priori Vault**: Immutable — only crystallized high-confidence research gets appended
- **A-Posteriori Vault**: Append-only experience log
- **Pattern DB**: SQLite with lineage indices, temporal decay, domain tags, access tracking
- **Knowledge Graph**: NetworkX DiGraph with self-healing node/edge management

### Subsystems
- **SoftMax Advisory SKG**: Deterministic, stateless, non-learning. Confidence capped at 0.75 under tension
- **MORB Deployment Bridge**: Deterministic PASS/FAIL evaluation drones (no reasoning, no interpretation)
- **Substrate Mesh Traverser**: Node discovery and health monitoring
- **Aggressive Learning Loop**: Background pattern acquisition with queue pruning
- **Auto-Diagnostics**: Configurable interval with tiered execution

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Basic Reasoning
```python
from cali_skg_v4 import create_cali

cali = create_cali(system_path="~/CALI", partition_size_gb=20)
result = cali.reason("What is the nature of causal knowledge?")
print(result["recommended_response"])
```

### State Architecture (v4.1 Preview)
```python
from cali_state_v4 import StateBundle, CommandBridge, migrate_orb_state

# New projects: use StateBundle directly
bundle = StateBundle(persist_path=Path("./state.json"))
bundle.set("movement_enabled", True, layer=StateLayer.DESIRED, source="dockstation")

# Legacy migration
from cali_skg_v4 import create_cali
cali = create_cali()
bundle = migrate_orb_state(cali.orb_state, persist_path=Path("./state.json"))

# Command Bridge
bridge = CommandBridge(bundle, cali_instance=cali)
bridge.start()
bridge.send_command({"action": "set_desired", "target": "voice_active", "value": True})
```

### CLI
```bash
python cali_skg_v4.py --query "What is consciousness?" --diagnostic-tier full --prune
```

### Diagnostics
```python
report = cali.diagnostic_system.full_system_probe(tier="full")
print(report["overall_status"])  # healthy | degraded | critical
```

### Pruning
```python
report = cali.prune_patterns(confidence_floor=0.15, max_age_days=90)
print(f"Removed {report['removed']} patterns")
```

### Lineage Tracing
```python
lineage = cali.get_lineage("pattern_id_here")
print(f"Depth: {lineage['lineage_depth']}")
for ancestor in lineage["ancestors"]:
    print(f"Gen {ancestor['generation']}: {ancestor['content'][:50]}")
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORB_INSTANCE_ID` | `wsl` | Instance identifier |
| `ORB_MESH_ROOT` | `R:/mesh` | Substrate mesh root |
| `CALI_ENCODER_MODE` | `fallback` | `fallback` or `transformer` |
| `CALI_ALLOW_MODEL_DOWNLOAD` | `0` | Allow downloading sentence-transformer models |
| `CALI_SENTENCE_MODEL` | `all-MiniLM-L6-v2` | Encoder model name |
| `QWEN3_TTS_ENDPOINT` | `http://127.0.0.1:8020` | TTS service endpoint |
| `ORB_LLM_ROUTE` | `local` | LLM routing mode |
| `ORB_LOCAL_LLM_ENDPOINT` | `http://127.0.0.1:11455` | Local LLM endpoint |
| `ORB_LOCAL_LLM_MODEL` | `qwen2.5:3b` | Local LLM model |
| `ORB_LLM_GOVERNANCE_WRAPPER` | `0` | Enable TPC governance wrapper |
| `ORB_LLM_RETAIN_VOICE` | `1` | Retain voice output |

## System Requirements

- Python 3.9+
- Optional: `numpy`, `torch`, `networkx`, `sentence-transformers`
- Runs fully on CPU without optional dependencies
- SQLite (built-in)

## Version History

- **v4.0** (2026-07-03) — Robustness overhaul: lineage tracking, confidence drift mitigation, self-healing pruning, tiered diagnostics, SoftMax outlier detection, StateBundle architecture
- **v3.5** — Previous stable with basic reasoning and memory

## License

Proprietary — Spruked / GOAT Platform
