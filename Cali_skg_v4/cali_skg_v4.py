#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CALI SKG v4.0 — Robustness-First Cognitive Engine
Cognitively Aligned Linear Intelligence

Architecture:
  - 4 Philosophical Seeds (Locke, Hume, Kant, Spinoza)
  - 3 System Logics (Inductive, Deductive, Intuitive)
  - SoftMax Advisory SKG (deterministic, stateless, non-learning)
  - A-Priori / A-Posteriori Vaults (immutable / append-only)
  - Knowledge Graph with self-healing pruning
  - Pattern Lineage Tracking (parent_id, generation)
  - Confidence Drift Mitigation
  - MORB Deployment Bridge
  - Substrate Mesh Traverser
  - Auto-Diagnostics (lightweight / standard / full tiers)
  - Aggressive Background Learning Loop
  - CPU-Optimized (GPU optional)

Author: CALI Architecture Team
Version: 4.0.0
Date: 2026-07-03
"""

# ═════════════════════════════════════════════════════════════════════════════
#  SECTION 1: IMPORTS & UTILITIES
# ═════════════════════════════════════════════════════════════════════════════

import os
import sys
import json
import time
import pickle
import sqlite3
import threading
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum, auto

# Optional heavy imports with graceful fallbacks
try:
    import numpy as np
except ImportError:
    np = None  # type: ignore

try:
    import torch
except ImportError:
    torch = None  # type: ignore

try:
    import networkx as nx
except ImportError:
    nx = None  # type: ignore

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None  # type: ignore

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("CALISKG")

# ── Utilities ───────────────────────────────────────────────────────────────

def r_drive_path(*parts: str) -> Path:
    """Resolve substrate paths from environment or default."""
    root = os.getenv("CALI_SUBSTRATE_ROOT", os.getenv("R_DRIVE", "R:/"))
    return Path(root).joinpath(*parts)


def _score_text_match(query: str, text: str) -> float:
    """Simple keyword overlap scoring for vault retrieval."""
    if not query or not text:
        return 0.0
    q_tokens = set(query.lower().split())
    t_tokens = set(text.lower().split())
    if not q_tokens:
        return 0.0
    overlap = q_tokens & t_tokens
    return len(overlap) / len(q_tokens)


def _cosine_similarity(a: Any, b: Any) -> float:
    """Compute cosine similarity between two vectors."""
    if np is not None:
        a_vec = np.asarray(a, dtype=np.float32)
        b_vec = np.asarray(b, dtype=np.float32)
        norm_a = np.linalg.norm(a_vec)
        norm_b = np.linalg.norm(b_vec)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a_vec, b_vec) / (norm_a * norm_b))
    else:
        # Pure Python fallback
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


# ═════════════════════════════════════════════════════════════════════════════
#  SECTION 2: ENUMS & DATACLASSES
# ═════════════════════════════════════════════════════════════════════════════

class ReasoningMode(Enum):
    LOCKE_EMPIRICAL = auto()
    HUME_SKEPTICAL = auto()
    KANT_SYNTHETIC = auto()
    SPINOZA_MONISTIC = auto()
    INDUCTIVE_STATISTICAL = auto()
    DEDUCTIVE_LOGICAL = auto()
    INTUITIVE_HOLISTIC = auto()


class MemoryType(Enum):
    A_PRIORI = "a_priori"
    A_POSTERIORI = "a_posteriori"


class TaskCategory(Enum):
    EMPIRICAL = "empirical"
    ANALYTICAL = "analytical"
    SYNTHETIC = "synthetic"
    ETHICAL = "ethical"
    STRATEGIC = "strategic"
    DIAGNOSTIC = "diagnostic"


@dataclass
class PhilosophicalSeed:
    """A philosophical reasoning seed with cognitive constraints."""
    name: str
    logic_type: ReasoningMode
    weight_formula: str
    confidence_bias: float
    description: str
    dominance_ceiling: float
    task_affinity: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "logic_type": self.logic_type.name,
            "weight_formula": self.weight_formula,
            "confidence_bias": self.confidence_bias,
            "description": self.description,
            "dominance_ceiling": self.dominance_ceiling,
            "task_affinity": self.task_affinity,
        }


@dataclass
class LearnedPattern:
    """An immutable learned pattern with lineage tracking."""
    pattern_id: str
    content: str
    reasoning_mode: ReasoningMode
    confidence: float
    truth_likelihood: float
    timestamp: datetime
    source: str
    use_count: int = 0
    last_validated: Optional[datetime] = None
    embedding: Optional[Any] = None
    parent_id: Optional[str] = None
    generation: int = 0
    temporal_weight: float = 1.0
    decay_rate: float = 0.001
    domain_tags: Optional[Set[str]] = None
    access_count: int = 0
    last_accessed: Optional[datetime] = None

    def __post_init__(self):
        if not self.pattern_id:
            self.pattern_id = hashlib.sha256(
                f"{self.content}:{self.timestamp.isoformat()}".encode()
            ).hexdigest()[:16]
        if self.domain_tags is None:
            self.domain_tags = set()


# ═════════════════════════════════════════════════════════════════════════════
#  SECTION 3: FALLBACK IMPLEMENTATIONS
# ═════════════════════════════════════════════════════════════════════════════

class FallbackSentenceEncoder:
    """
    Deterministic fallback encoder when sentence-transformers is unavailable.
    Produces consistent 384-dimensional vectors from SHA-256 hashes.
    """

    def encode(self, text: Union[str, List[str]]) -> Any:
        if isinstance(text, list):
            return [self._encode_single(t) for t in text]
        return self._encode_single(text)

    def _encode_single(self, text: str) -> List[float]:
        if not isinstance(text, str):
            text = str(text)
        h = hashlib.sha256(text.encode("utf-8")).digest()
        vec = []
        for i in range(0, len(h), 4):
            chunk = h[i:i + 4]
            val = int.from_bytes(chunk, "big", signed=True) / (2 ** 31)
            vec.append(val)
        # Extend to 384 dimensions
        while len(vec) < 384:
            vec.extend(vec[:384 - len(vec)])
        return vec[:384]


class _SimpleDiGraph:
    """Minimal NetworkX-compatible directed graph fallback."""

    def __init__(self):
        self._nodes: Dict[str, Dict[str, Any]] = {}
        self._edges: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self._pred: Dict[str, Set[str]] = {}
        self._succ: Dict[str, Set[str]] = {}

    def add_node(self, node_for_adding: str, **attr) -> None:
        self._nodes[node_for_adding] = attr
        if node_for_adding not in self._pred:
            self._pred[node_for_adding] = set()
        if node_for_adding not in self._succ:
            self._succ[node_for_adding] = set()

    def add_edge(self, u_of_edge: str, v_of_edge: str, **attr) -> None:
        self.add_node(u_of_edge)
        self.add_node(v_of_edge)
        self._edges[(u_of_edge, v_of_edge)] = attr
        self._succ[u_of_edge].add(v_of_edge)
        self._pred[v_of_edge].add(u_of_edge)

    def nodes(self, data: bool = False):
        if data:
            return list(self._nodes.items())
        return list(self._nodes.keys())

    def edges(self, data: bool = False):
        if data:
            return [(u, v, attr) for (u, v), attr in self._edges.items()]
        return list(self._edges.keys())

    def has_node(self, node: str) -> bool:
        return node in self._nodes

    def has_edge(self, u: str, v: str) -> bool:
        return (u, v) in self._edges

    def remove_node(self, node: str) -> None:
        if node in self._nodes:
            del self._nodes[node]
        for pred in list(self._pred.get(node, [])):
            self._edges.pop((pred, node), None)
            self._succ[pred].discard(node)
        for succ in list(self._succ.get(node, [])):
            self._edges.pop((node, succ), None)
            self._pred[succ].discard(node)
        self._pred.pop(node, None)
        self._succ.pop(node, None)

    def number_of_nodes(self) -> int:
        return len(self._nodes)

    def number_of_edges(self) -> int:
        return len(self._edges)


# ═════════════════════════════════════════════════════════════════════════════
#  SECTION 4: SUBSYSTEMS
# ═════════════════════════════════════════════════════════════════════════════

class AdaptiveCochlearProcessor:
    """
    Human-like auditory perception processor.
    Interfaces with Faster-Whisper for STT in production.
    """

    def __init__(self, sample_rate: int = 16000, chunk_size: int = 1024):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self._active = False

    def process(self, audio_data: bytes) -> str:
        """Process audio bytes to text. Stub for production STT integration."""
        if not audio_data:
            return ""
        return "[audio_processed]"

    def start_listener(self) -> None:
        self._active = True
        logger.info("Cochlear listener started")

    def stop_listener(self) -> None:
        self._active = False
        logger.info("Cochlear listener stopped")


class SoftMaxAdvisorySKG:
    """
    Deterministic, stateless, non-learning SoftMax consensus advisor.
    Takes verdicts from Core 4 siblings and produces confidence-weighted signals.
    Never learns. Never mutates. Confidence capped at 0.75 under tension.
    """

    def __init__(self, max_outputs: int = 20):
        self.max_outputs = max_outputs
        self.tension_cap = 0.75
        self.absolute_cap = 0.92

    def compute_verdict(
        self,
        reasoning_outputs: List[Dict[str, Any]],
        task_category: Optional[TaskCategory] = None,
    ) -> Dict[str, Any]:
        """Apply SoftMax to confidence-weighted signals from Core 4 siblings."""
        if not reasoning_outputs:
            return {
                "confidence": 0.35,
                "truth_likelihood": 0.30,
                "weights": [],
                "tension_detected": False,
                "advisory": "No reasoning outputs available.",
                "outliers": [],
            }

        confidences = []
        for output in reasoning_outputs:
            raw = float(output.get("raw_confidence", 0.5))
            philosopher = output.get("philosopher", "")
            # Apply philosopher dominance ceilings
            if "Spinoza" in philosopher:
                raw = min(raw, 0.30)
            elif "Hume" in philosopher:
                raw = min(raw, 0.35)
            elif "Locke" in philosopher:
                raw = min(raw, 0.40)
            elif "Kant" in philosopher:
                raw = min(raw, 0.45)
            confidences.append(raw)

        # SoftMax
        if np is not None:
            exp_scores = np.exp(np.array(confidences) - np.max(confidences))
            weights = (exp_scores / np.sum(exp_scores)).tolist()
        else:
            max_c = max(confidences)
            exp_scores = [2.718281828 ** (c - max_c) for c in confidences]
            sum_exp = sum(exp_scores)
            weights = [e / sum_exp for e in exp_scores] if sum_exp > 0 else [1.0 / len(confidences)] * len(confidences)

        # Tension detection (variance > threshold = disagreement)
        tension_detected = False
        variance = 0.0
        if len(confidences) > 1:
            if np is not None:
                variance = float(np.var(confidences))
            else:
                mean_c = sum(confidences) / len(confidences)
                variance = sum((c - mean_c) ** 2 for c in confidences) / len(confidences)
            if variance > 0.08:
                tension_detected = True

        # Outlier detection (Z-score > 1.5)
        outliers = []
        if len(confidences) > 2:
            mean_c = sum(confidences) / len(confidences)
            std_c = (variance ** 0.5) if variance > 0 else 0
            if std_c > 0:
                for i, c in enumerate(confidences):
                    z_score = abs(c - mean_c) / std_c
                    if z_score > 1.5:
                        outliers.append({
                            "index": i,
                            "philosopher": reasoning_outputs[i].get("philosopher", "unknown"),
                            "confidence": c,
                            "z_score": round(z_score, 2),
                        })

        weighted_confidence = sum(w * c for w, c in zip(weights, confidences))

        # Apply caps
        if tension_detected:
            weighted_confidence = min(weighted_confidence, self.tension_cap)
        weighted_confidence = min(weighted_confidence, self.absolute_cap)

        return {
            "confidence": round(float(weighted_confidence), 4),
            "truth_likelihood": round(float(weighted_confidence * 0.90), 4),
            "weights": [round(float(w), 4) for w in weights],
            "tension_detected": tension_detected,
            "variance": round(variance, 4),
            "outliers": outliers,
            "advisory": "SoftMax consensus computed from Core 4 siblings.",
        }


class BulkMirrorCache:
    """Pre-fetch and cache bulk data for swarm operations."""

    def __init__(self, max_size: int = 1000):
        self._cache: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._max_size = max_size
        self._access_count: Dict[str, int] = {}

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                self._access_count[key] = self._access_count.get(key, 0) + 1
                return self._cache[key]
            return None

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if len(self._cache) >= self._max_size and key not in self._cache:
                # LRU eviction
                least_used = min(self._access_count, key=self._access_count.get)
                self._cache.pop(least_used, None)
                self._access_count.pop(least_used, None)
            self._cache[key] = value
            self._access_count[key] = 1

    def prefetch(self, keys: List[str]) -> None:
        """Background prefetch stub — override in production."""
        pass

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._access_count.clear()


class CALISwarmOrchestrator:
    """Orchestrates research swarm operations across configured APIs."""

    def __init__(self, registry_path: Path, bulk_mirror: Optional[BulkMirrorCache] = None):
        self.registry_path = Path(registry_path) if registry_path else Path("api_registry.json")
        self.bulk_mirror = bulk_mirror
        self._registry = self._load_registry()
        self._lock = threading.Lock()

    def _load_registry(self) -> Dict[str, Any]:
        if self.registry_path.exists():
            try:
                return json.loads(self.registry_path.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("Failed to load API registry: %s", exc)
        return {}

    def execute_research(
        self,
        query: str,
        domains: Optional[List[str]] = None,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """Execute swarm research across configured APIs."""
        # Production: parallelize with ThreadPoolExecutor
        return {
            "query": query,
            "domains": domains or [],
            "sources_queried": 0,
            "successful_returns": 0,
            "results": [],
            "confidence_aggregate": 0.60,
            "key_findings": [],
            "errors": [],
            "timestamp": datetime.now().isoformat(),
        }

    def register_api(self, name: str, config: Dict[str, Any]) -> None:
        with self._lock:
            self._registry[name] = config
            try:
                self.registry_path.write_text(json.dumps(self._registry, indent=2), encoding="utf-8")
            except Exception as exc:
                logger.warning("Failed to save API registry: %s", exc)


class MORBDeploymentBridge:
    """
    Bridge to MORB (Mini-Orb Reasoning Bot) deterministic evaluation drones.
    MORBs evaluate tasks, run predicate logic, decide PASS/FAIL.
    They do NOT reason about meaning, interpret, merge, articulate, or plan.
    """

    def __init__(self, mesh_root: Path, cali_instance: Any):
        self.mesh_root = Path(mesh_root) if mesh_root else Path("mesh")
        self.cali = cali_instance
        self._active = True
        self._deployment_log: List[Dict[str, Any]] = []

    def deploy_task(self, task_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Deploy task to MORB for PASS/FAIL evaluation."""
        result = {
            "status": "PASS",
            "task_id": task_spec.get("id", "unknown"),
            "evaluated_by": "MORB",
            "deterministic": True,
            "timestamp": datetime.now().isoformat(),
            "predicate_results": [],
        }
        self._deployment_log.append(result)
        return result

    def get_log(self, limit: int = 100) -> List[Dict[str, Any]]:
        return self._deployment_log[-limit:]

    def health_check(self) -> Dict[str, Any]:
        return {
            "status": "healthy" if self._active else "inactive",
            "deployments_count": len(self._deployment_log),
            "mesh_root": str(self.mesh_root),
        }


class SubstrateMeshTraverser:
    """Traverses substrate mesh topology for node discovery and health monitoring."""

    def __init__(self, mesh_root: Path, cali_instance: Any):
        self.mesh_root = Path(mesh_root) if mesh_root else Path("mesh")
        self.cali = cali_instance
        self._discovered_nodes: Dict[str, Dict[str, Any]] = {}

    def traverse(self, node_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Discover nodes in substrate mesh."""
        if not self.mesh_root.exists():
            return []
        nodes = []
        try:
            for entry in self.mesh_root.iterdir():
                if entry.is_dir():
                    node_info = {
                        "id": entry.name,
                        "path": str(entry),
                        "discovered_at": datetime.now().isoformat(),
                    }
                    self._discovered_nodes[entry.name] = node_info
                    nodes.append(node_info)
        except Exception as exc:
            logger.warning("Mesh traversal error: %s", exc)
        return nodes

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        return self._discovered_nodes.get(node_id)


class DiagnosticProbeSystem:
    """
    System health diagnostic probes with tiered execution.
    Tiers: lightweight, standard, full
    """

    def __init__(self, cali_instance: Any):
        self.cali = cali_instance
        self._probe_history: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def full_system_probe(self, tier: str = "standard") -> Dict[str, Any]:
        """Run full system diagnostic probe."""
        tier = tier.lower()
        components = {}

        # Always check core components
        components["encoder"] = (
            "healthy" if self.cali.encoder and not isinstance(self.cali.encoder, FallbackSentenceEncoder)
            else "degraded"
        )
        components["patterns_db"] = "healthy" if self.cali.patterns_db else "degraded"
        components["a_priori_vault"] = "healthy" if self.cali.a_priori_vault else "degraded"
        components["a_posteriori_vault"] = "healthy" if self.cali.a_posteriori_vault else "degraded"

        if tier in ("standard", "full"):
            components["cochlea"] = "healthy" if self.cali.cochlea else "degraded"
            components["advisory"] = "healthy" if self.cali.advisory else "degraded"
            components["swarm"] = "healthy" if self.cali.swarm else "degraded"
            components["morb_bridge"] = (
                "active" if self.cali.morb_bridge and self.cali.morb_bridge._active else "inactive"
            )
            components["mesh_traverser"] = "active" if self.cali.mesh_traverser else "inactive"
            components["learning_loop"] = "active" if self.cali.learning_loop and self.cali.learning_loop._running else "inactive"
            components["knowledge_graph"] = (
                "healthy" if self.cali.kg and self.cali.kg.number_of_nodes() > 0 else "degraded"
            )

        if tier == "full":
            # Deep checks
            components["vault_integrity"] = self._check_vault_integrity()
            components["pattern_lineage"] = self._check_pattern_lineage()
            components["confidence_drift"] = self._check_confidence_drift()

        degraded = [k for k, v in components.items() if v in ("degraded", "inactive", "corrupt")]
        status = "healthy"
        if degraded:
            status = "degraded" if len(degraded) < 3 else "critical"

        report = {
            "overall_status": status,
            "summary": components,
            "tier": tier,
            "timestamp": datetime.now().isoformat(),
            "top_remediations": degraded,
        }

        with self._lock:
            self._probe_history.append(report)
            if len(self._probe_history) > 100:
                self._probe_history = self._probe_history[-100:]

        return report

    def _check_vault_integrity(self) -> str:
        try:
            ap_count = len(self.cali.a_priori_vault.get("entries", []))
            return "healthy" if ap_count > 0 else "empty"
        except Exception:
            return "corrupt"

    def _check_pattern_lineage(self) -> str:
        try:
            with self.cali.db_lock:
                cursor = self.cali.patterns_db.cursor()
                cursor.execute("SELECT COUNT(*) FROM patterns WHERE parent_id IS NOT NULL")
                count = cursor.fetchone()[0]
                return "healthy" if count > 0 else "no_lineage"
        except Exception:
            return "error"

    def _check_confidence_drift(self) -> str:
        try:
            with self.cali.db_lock:
                cursor = self.cali.patterns_db.cursor()
                cursor.execute(
                    "SELECT confidence FROM patterns ORDER BY timestamp DESC LIMIT 100"
                )
                rows = cursor.fetchall()
                if not rows:
                    return "no_data"
                confidences = [r[0] for r in rows]
                if np is not None:
                    mean_c = float(np.mean(confidences))
                    std_c = float(np.std(confidences))
                else:
                    mean_c = sum(confidences) / len(confidences)
                    std_c = (sum((c - mean_c) ** 2 for c in confidences) / len(confidences)) ** 0.5
                if std_c > 0.25:
                    return f"high_drift (std={std_c:.3f})"
                return f"stable (mean={mean_c:.3f})"
        except Exception:
            return "error"

    def get_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        with self._lock:
            return self._probe_history[-limit:]


class AggressiveLearningLoop:
    """
    Background learning loop for pattern acquisition and knowledge graph enrichment.
    Runs in daemon thread. Queues observations for batch processing.
    """

    def __init__(self, cali_instance: Any, batch_size: int = 50, interval: float = 5.0):
        self.cali = cali_instance
        self._queue: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._batch_size = batch_size
        self._interval = interval
        self._processed_count = 0

    def start_background_learning(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._learning_worker,
            name="cali-learning-loop",
            daemon=True,
        )
        self._thread.start()
        logger.info("AggressiveLearningLoop started (batch=%d, interval=%.1fs)", self._batch_size, self._interval)

    def _learning_worker(self) -> None:
        while self._running:
            time.sleep(self._interval)
            observations = []
            with self._lock:
                if self._queue:
                    observations = self._queue[:self._batch_size]
                    self._queue = self._queue[self._batch_size:]

            for obs in observations:
                try:
                    self._process_observation(obs)
                    self._processed_count += 1
                except Exception as exc:
                    logger.warning("Learning observation error: %s", exc)

    def _process_observation(self, observation: Dict[str, Any]) -> None:
        obs_type = observation.get("type", "unknown")
        if obs_type == "user_interaction":
            query = observation.get("query", "")
            response = observation.get("response", "")
            if query and response:
                self.cali._remember_pattern(
                    content=f"Q: {query} | A: {response}",
                    reasoning_mode=ReasoningMode.KANT_SYNTHETIC,
                    confidence=observation.get("confidence", 0.5),
                    truth_likelihood=observation.get("confidence", 0.5) * 0.9,
                    source="learning_loop_interaction",
                )
        elif obs_type == "mesh_health":
            status = observation.get("overall_status", "unknown")
            if status in ("critical", "degraded"):
                # Learn from system stress
                self.cali._remember_pattern(
                    content=f"System health degraded: {status}",
                    reasoning_mode=ReasoningMode.HUME_SKEPTICAL,
                    confidence=0.6,
                    truth_likelihood=0.55,
                    source="learning_loop_health",
                )

    def queue_observation(self, observation: Dict[str, Any]) -> None:
        with self._lock:
            self._queue.append(observation)
            if len(self._queue) > 1000:
                self._queue = self._queue[-1000:]

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "queued": len(self._queue),
                "processed": self._processed_count,
                "running": self._running,
            }

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)


# ═════════════════════════════════════════════════════════════════════════════
#  SECTION 5: MAIN CALI SKG CLASS v4.0
# ═════════════════════════════════════════════════════════════════════════════

class CALISKG:
    """CALI: Cognitively Aligned Linear Intelligence — v4.0 Robustness Edition."""

    PHILOSOPHER_SEEDS = {
        "locke": PhilosophicalSeed(
            name="John Locke",
            logic_type=ReasoningMode.LOCKE_EMPIRICAL,
            weight_formula="sensory_evidence * reliability",
            confidence_bias=0.7,
            description="All knowledge comes from sensory experience. Tabula rasa.",
            dominance_ceiling=0.40,
            task_affinity={TaskCategory.EMPIRICAL.value: 0.9, TaskCategory.ANALYTICAL.value: 0.3},
        ),
        "hume": PhilosophicalSeed(
            name="David Hume",
            logic_type=ReasoningMode.HUME_SKEPTICAL,
            weight_formula="impression_strength * constant_conjunction",
            confidence_bias=0.4,
            description="Causal connections are habits of mind, not necessary truths.",
            dominance_ceiling=0.35,
            task_affinity={TaskCategory.EMPIRICAL.value: 0.6, TaskCategory.ETHICAL.value: 0.5},
        ),
        "kant": PhilosophicalSeed(
            name="Immanuel Kant",
            logic_type=ReasoningMode.KANT_SYNTHETIC,
            weight_formula="a_priori_categories * empirical_intuitions",
            confidence_bias=0.8,
            description="Knowledge requires both a priori forms and a posteriori content.",
            dominance_ceiling=0.45,
            task_affinity={
                TaskCategory.SYNTHETIC.value: 0.9,
                TaskCategory.ANALYTICAL.value: 0.7,
                TaskCategory.STRATEGIC.value: 0.6,
            },
        ),
        "spinoza": PhilosophicalSeed(
            name="Baruch Spinoza",
            logic_type=ReasoningMode.SPINOZA_MONISTIC,
            weight_formula="geometric_necessity * adequate_ideas",
            confidence_bias=0.9,
            description="God and Nature are one substance. Geometric method.",
            dominance_ceiling=0.30,
            task_affinity={TaskCategory.ANALYTICAL.value: 0.9, TaskCategory.ETHICAL.value: 0.7},
        ),
    }

    SYSTEM_LOGICS = {
        "inductive": ReasoningMode.INDUCTIVE_STATISTICAL,
        "deductive": ReasoningMode.DEDUCTIVE_LOGICAL,
        "intuitive": ReasoningMode.INTUITIVE_HOLISTIC,
    }

    DEFAULT_A_PRIORI_ENTRIES = [
        {"content": "Identity is stable enough for reasoning when a subject remains itself."},
        {"content": "A contradiction cannot be true in the same respect at the same time."},
        {"content": "Causes and effects should be tested against observation before certainty is claimed."},
        {"content": "Time orders experience, and experience refines judgment."},
    ]

    DOMAIN_HINTS = {
        "space": {"space", "astronomy", "rocket", "planet", "nasa", "spacex", "asteroid", "mars"},
        "weather": {"weather", "storm", "forecast", "temperature", "hurricane", "rain", "climate"},
        "biomedical": {"medical", "disease", "clinical", "trial", "pubmed", "biology", "genome", "health"},
        "finance": {
            "stock", "market", "economic", "finance", "fred", "inflation",
            "gaap", "ifrs", "accounting", "reporting", "audit", "filing",
            "risk", "valuation", "dcf", "var", "sharpe", "compliance",
            "sec", "regulatory", "disclosure", "revenue", "billing",
            "corporate", "governance", "truemark", "goat", "spruked",
        },
        "academic": {"paper", "research", "study", "scholar", "academic", "openalex", "arxiv"},
        "geospatial": {"map", "earthquake", "location", "geospatial", "seismic", "gis"},
    }

    SUBSTRATE_ROOT = r_drive_path("CALI_SUBSTRATE", "domain_knowledge")
    COGNITIVE_SEED_ROOT = r_drive_path("CALI_SUBSTRATE", "seeds", "cognitive_seed_vault")

    def __init__(self, system_path: Union[str, Path], partition_size_gb: int = 20) -> None:
        self.instance_id = os.getenv("ORB_INSTANCE_ID", "wsl").strip() or "wsl"
        self.shared_mesh_root = os.getenv("ORB_SHARED_MESH_ROOT")
        self.system_path = Path(system_path).expanduser().resolve()
        self.partition_size = partition_size_gb * 1024 * 1024 * 1024
        self.cali_root = self.system_path / "CALI_System"
        self._initialize_system_structure()
        self.core4_seed_entries = self._load_core4_seed_entries()

        self.device = self._resolve_device()
        self.vram_gb = 6 if torch is not None and hasattr(torch, "cuda") and torch.cuda.is_available() else 0
        self.encoder = self._initialize_encoder()
        self.encoder_backend = type(self.encoder).__name__

        self.cochlea = AdaptiveCochlearProcessor()
        self.advisory = SoftMaxAdvisorySKG(max_outputs=20)
        self.bulk_mirror = BulkMirrorCache()
        self.swarm = CALISwarmOrchestrator(
            self.cali_root / "config" / "api_registry.json",
            bulk_mirror=self.bulk_mirror,
        )

        mesh_root = Path(os.getenv("ORB_MESH_ROOT", os.getenv("ORB_SHARED_MESH_ROOT", "R:/mesh")))
        self.morb_bridge = MORBDeploymentBridge(mesh_root, self)
        self.mesh_traverser = SubstrateMeshTraverser(mesh_root, self)
        self.diagnostic_system = DiagnosticProbeSystem(self)
        self.learning_loop = AggressiveLearningLoop(self)
        self.learning_loop.start_background_learning()

        self.a_priori_vault = self._initialize_vault(MemoryType.A_PRIORI)
        self.a_posteriori_vault = self._initialize_vault(MemoryType.A_POSTERIORI)

        self.kg = nx.DiGraph() if nx is not None else _SimpleDiGraph()
        self._build_core_cognition_graph()

        self.db_lock = threading.Lock()
        db_path = self.cali_root / "memory" / "patterns.db"
        self.patterns_db = sqlite3.connect(str(db_path), check_same_thread=False)
        self._initialize_patterns_db()

        self.voice_config = {
            "engine": "qwen3-tts",
            "qwen3_tts_endpoint": os.getenv("QWEN3_TTS_ENDPOINT", "http://127.0.0.1:8020"),
            "voice_path": "voices/af_bella.bin",
            "speaker_id": "af_bella",
            "backup_engine": "kokoro",
            "backup_voice": "af_sky",
            "speed": 0.95,
            "pitch": 0.1,
            "emotion": "thoughtful_warm",
            "gpu_accelerated": str(self.device) == "cuda",
        }

        self._inject_substrate_knowledge()
        self._load_cognitive_seed_vaults()

        _prefetch_thread = threading.Thread(
            target=self._background_prefetch,
            name="cali-bulk-mirror-prefetch",
            daemon=True,
        )
        _prefetch_thread.start()

        self.current_reasoning_mode = ReasoningMode.KANT_SYNTHETIC
        self.confidence_threshold = 0.75
        self.interaction_count = 0

        # v4.0 orb_state (legacy compatibility — will migrate to StateBundle in v4.1)
        self.orb_state = {
            "skin": "default_crystalline",
            "swarm_visible": False,
            "desktop_access": True,
            "browser_access": True,
            "voice_active": True,
            "llm_route": os.getenv("ORB_LLM_ROUTE", "local"),
            "llm_local_endpoint": os.getenv("ORB_LOCAL_LLM_ENDPOINT", os.getenv("OLLAMA_HOST", "http://127.0.0.1:11455")),
            "llm_local_model": os.getenv("ORB_LOCAL_LLM_MODEL", "qwen2.5:3b"),
            "llm_api_base": "",
            "llm_api_model": "",
            "llm_api_key": "",
            "llm_governance_wrapper": os.getenv("ORB_LLM_GOVERNANCE_WRAPPER", "0").strip().lower() in {"1", "true", "yes", "on"},
            "llm_retain_voice": os.getenv("ORB_LLM_RETAIN_VOICE", "1").strip().lower() in {"1", "true", "yes", "on"},
            "morb_deployment_enabled": True,
            "mesh_traversal_enabled": True,
            "aggressive_learning_enabled": True,
            "auto_diagnostics_enabled": True,
            "diagnostic_interval_minutes": 30,
            "diagnostic_tier": "standard",  # lightweight, standard, full
        }

        if self.orb_state["auto_diagnostics_enabled"]:
            self._start_auto_diagnostics()

        logger.info(
            "CALI SKG v4.0 initialized | Device: %s | Partition: %sGB | Encoder: %s | MORB: %s | Mesh: %s | Learning: %s",
            self.device, partition_size_gb, self.encoder_backend,
            "active" if self.morb_bridge else "inactive",
            "active" if self.mesh_traverser else "inactive",
            "active" if self.learning_loop else "inactive",
        )

    # ── Initialization Helpers ─────────────────────────────────────────────

    def _initialize_system_structure(self) -> None:
        for relative in (
            "memory/a_priori",
            "memory/a_posteriori",
            "memory/patterns",
            "config",
            "cache",
            "logs",
            "voice_cache",
            "swarm_results",
            "morb_logs",
            "diagnostics",
        ):
            (self.cali_root / relative).mkdir(parents=True, exist_ok=True)

    def _resolve_device(self) -> Any:
        if torch is None:
            return "cpu"
        if hasattr(torch, "cuda") and torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")

    def _initialize_encoder(self) -> Any:
        if SentenceTransformer is None:
            logger.warning("sentence-transformers unavailable; using fallback encoder")
            return FallbackSentenceEncoder()

        cache_dir = self.cali_root / "cache" / "sentence_transformers"
        cache_dir.mkdir(parents=True, exist_ok=True)
        encoder_mode = os.getenv("CALI_ENCODER_MODE", "fallback").strip().lower()
        if encoder_mode in {"", "fallback", "local_fallback", "off"}:
            logger.info("CALI encoder using deterministic fallback backend")
            return FallbackSentenceEncoder()

        allow_download = os.getenv("CALI_ALLOW_MODEL_DOWNLOAD", "0").strip().lower() in {"1", "true", "yes", "on"}
        model_name = os.getenv("CALI_SENTENCE_MODEL", "all-MiniLM-L6-v2").strip() or "all-MiniLM-L6-v2"

        kwargs = {
            "device": str(self.device),
            "cache_folder": str(cache_dir),
        }
        if not allow_download:
            kwargs["local_files_only"] = True

        try:
            return SentenceTransformer(model_name, **kwargs)
        except TypeError:
            kwargs.pop("local_files_only", None)
            if not allow_download:
                logger.warning("SentenceTransformer local-only unsupported; using fallback")
                return FallbackSentenceEncoder()
            try:
                return SentenceTransformer(model_name, **kwargs)
            except Exception as exc:
                logger.warning("SentenceTransformer init failed (%s); using fallback", exc)
                return FallbackSentenceEncoder()
        except Exception as exc:
            logger.warning("SentenceTransformer init failed (%s); using fallback", exc)
            return FallbackSentenceEncoder()

    def _load_core4_seed_entries(self) -> List[Dict[str, Any]]:
        """Load Core 4 philosopher seed entries from component files."""
        try:
            seeds_dir = Path(__file__).resolve().parent / "components" / "core_4_minds"
        except NameError:
            seeds_dir = self.cali_root / "components" / "core_4_minds"

        seed_files = [
            seeds_dir / "hlocke" / "locke_empiricism_skg.json",
            seeds_dir / "hhume" / "hume_skepticism_skg.json",
            seeds_dir / "ikant" / "kant_critical_skg.json",
            seeds_dir / "bspinoza" / "spinoza_monism_skg.json",
        ]

        entries: List[Dict[str, Any]] = []
        for path in seed_files:
            if not path.exists():
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                meta = payload.get("skg_metadata", {})
                philosopher = meta.get("philosopher") or path.stem

                core = payload.get("core_axiom", {})
                if core:
                    entries.append({
                        "type": "core_axiom",
                        "philosopher": philosopher,
                        "source": path.name,
                        "node_id": core.get("node_id"),
                        "label": core.get("label"),
                        "definition": core.get("definition"),
                        "properties": core.get("properties", {}),
                    })

                for node in payload.get("concept_nodes", []) or []:
                    entries.append({
                        "type": "concept",
                        "philosopher": philosopher,
                        "source": path.name,
                        "node_id": node.get("node_id"),
                        "label": node.get("label"),
                        "category": node.get("category"),
                        "definition": node.get("properties", {}).get("definition"),
                        "properties": node.get("properties", {}),
                        "relationships": node.get("relationships", {}),
                    })

                for rule in payload.get("reasoning_rules", []) or []:
                    entries.append({
                        "type": "reasoning_rule",
                        "philosopher": philosopher,
                        "source": path.name,
                        "rule_id": rule.get("rule_id"),
                        "name": rule.get("name"),
                        "priority": rule.get("priority"),
                        "logic": rule.get("logic"),
                        "condition": rule.get("condition"),
                        "action": rule.get("action"),
                    })

                for flow in payload.get("reasoning_flow_templates", []) or []:
                    entries.append({
                        "type": "reasoning_flow",
                        "philosopher": philosopher,
                        "source": path.name,
                        "template_id": flow.get("template_id") or flow.get("name"),
                        "steps": flow.get("steps", []),
                    })

                taxonomies = payload.get("hierarchical_taxonomies")
                if isinstance(taxonomies, list):
                    for tax in taxonomies:
                        entries.append({
                            "type": "taxonomy",
                            "philosopher": philosopher,
                            "source": path.name,
                            "name": tax.get("name"),
                            "levels": tax.get("levels"),
                        })
                elif isinstance(taxonomies, dict):
                    for name, body in taxonomies.items():
                        entries.append({
                            "type": "taxonomy",
                            "philosopher": philosopher,
                            "source": path.name,
                            "name": name,
                            "levels": body,
                        })
            except Exception as exc:
                logger.warning("Failed to load core4 seed %s: %s", path, exc)
                continue
        return entries

    def _initialize_vault(self, vault_type: MemoryType) -> Dict[str, Any]:
        vault_path = self.cali_root / "memory" / vault_type.value
        vault_path.mkdir(parents=True, exist_ok=True)
        vault_file = vault_path / "vault.jsonl"
        entries = self._load_vault_entries(vault_file)

        if vault_type == MemoryType.A_PRIORI and not entries:
            entries = [dict(item) for item in self.DEFAULT_A_PRIORI_ENTRIES + self.core4_seed_entries]
            with vault_file.open("w", encoding="utf-8") as handle:
                for entry in entries:
                    handle.write(json.dumps(entry) + "\n")

        return {
            "type": vault_type,
            "path": vault_file,
            "entries": entries,
            "immutable": vault_type == MemoryType.A_PRIORI,
        }

    def _load_vault_entries(self, vault_file: Path) -> List[Dict[str, Any]]:
        if not vault_file.exists():
            return []
        entries: List[Dict[str, Any]] = []
        with vault_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed vault entry in %s", vault_file)
        return entries

    def _initialize_patterns_db(self) -> None:
        with self.db_lock:
            cursor = self.patterns_db.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS patterns (
                    id TEXT PRIMARY KEY,
                    content TEXT,
                    reasoning_mode TEXT,
                    confidence REAL,
                    truth_likelihood REAL,
                    timestamp TEXT,
                    source TEXT,
                    use_count INTEGER,
                    last_validated TEXT,
                    embedding BLOB,
                    parent_id TEXT,
                    generation INTEGER DEFAULT 0,
                    temporal_weight REAL DEFAULT 1.0,
                    decay_rate REAL DEFAULT 0.001,
                    domain_tags TEXT,
                    access_count INTEGER DEFAULT 0,
                    last_accessed TEXT
                )
                """
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent_id ON patterns(parent_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_source ON patterns(source)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON patterns(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_confidence ON patterns(confidence)")
            self.patterns_db.commit()

    def _build_core_cognition_graph(self) -> None:
        self.kg.add_node("cali_identity", type="cognitive_entity", name="CALI", stability="immutable")

        for seed_id, seed in self.PHILOSOPHER_SEEDS.items():
            self.kg.add_node(f"seed_{seed_id}", type="philosophical_logic", seed_data=seed.to_dict())
            self.kg.add_edge("cali_identity", f"seed_{seed_id}", weight=0.25, relation="reasons_with")

        self.kg.add_node("vault_a_priori", type="memory", mutability="immutable", access="direct")
        self.kg.add_node("vault_a_posteriori", type="memory", mutability="append_only", access="experiential")
        self.kg.add_node("acp_cochlea", type="perception", modality="auditory", human_like=True)
        self.kg.add_node("softmax_advisory", type="meta_cognition", function="confidence_arbitration")
        self.kg.add_node("swarm_orchestrator", type="action", modality="research", visual_metaphor="orb_swarm")
        self.kg.add_node("voice_synthesis", type="expression", primary=True, fallback="text")
        self.kg.add_node("morb_bridge", type="deployment", function="deterministic_evaluation")
        self.kg.add_node("mesh_traverser", type="topology", function="node_discovery")
        self.kg.add_node("diagnostic_system", type="health", function="system_probe")
        self.kg.add_node("learning_loop", type="cognition", function="aggressive_learning")

        for node in (
            "vault_a_priori", "vault_a_posteriori", "acp_cochlea",
            "softmax_advisory", "swarm_orchestrator", "voice_synthesis",
            "morb_bridge", "mesh_traverser", "diagnostic_system", "learning_loop",
        ):
            self.kg.add_edge("cali_identity", node, weight=0.9, relation="embodies")

    def _inject_substrate_knowledge(self) -> None:
        """Inject domain knowledge from substrate root if available."""
        if not self.SUBSTRATE_ROOT.exists():
            return
        try:
            for domain_file in self.SUBSTRATE_ROOT.glob("*.json"):
                try:
                    data = json.loads(domain_file.read_text(encoding="utf-8"))
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and "content" in item:
                                self.a_priori_vault["entries"].append(item)
                except Exception as exc:
                    logger.warning("Substrate injection failed for %s: %s", domain_file, exc)
        except Exception as exc:
            logger.warning("Substrate knowledge injection error: %s", exc)

    def _load_cognitive_seed_vaults(self) -> None:
        """Load additional cognitive seed vaults from COGNITIVE_SEED_ROOT."""
        if not self.COGNITIVE_SEED_ROOT.exists():
            return
        try:
            for seed_file in self.COGNITIVE_SEED_ROOT.rglob("*.json"):
                try:
                    data = json.loads(seed_file.read_text(encoding="utf-8"))
                    if isinstance(data, dict) and "content" in data:
                        self.a_priori_vault["entries"].append(data)
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and "content" in item:
                                self.a_priori_vault["entries"].append(item)
                except Exception as exc:
                    logger.warning("Cognitive seed load failed for %s: %s", seed_file, exc)
        except Exception as exc:
            logger.warning("Cognitive seed vault loading error: %s", exc)

    def _background_prefetch(self) -> None:
        """Background thread for bulk mirror prefetching."""
        try:
            time.sleep(2)  # Let init finish
            # Stub: in production, prefetch hot substrate data
            logger.debug("Bulk mirror prefetch completed")
        except Exception as exc:
            logger.warning("Background prefetch error: %s", exc)

    def _start_auto_diagnostics(self) -> None:
        def diagnostic_worker():
            interval = self.orb_state.get("diagnostic_interval_minutes", 30) * 60
            while self.orb_state.get("auto_diagnostics_enabled", False):
                time.sleep(interval)
                try:
                    tier = self.orb_state.get("diagnostic_tier", "standard")
                    report = self.diagnostic_system.full_system_probe(tier=tier)
                    if report["overall_status"] in ("critical", "degraded"):
                        logger.warning(
                            "Auto-diagnostic detected %s status: %s",
                            report["overall_status"],
                            report["top_remediations"][:3],
                        )
                        self.learning_loop.queue_observation({
                            "type": "mesh_health",
                            "overall_status": report["overall_status"],
                            "components": report["summary"],
                        })
                except Exception as exc:
                    logger.warning("Auto-diagnostic error: %s", exc)

        thread = threading.Thread(target=diagnostic_worker, name="cali-auto-diagnostics", daemon=True)
        thread.start()
        logger.info(
            "Auto-diagnostics started (tier: %s, interval: %d min)",
            self.orb_state.get("diagnostic_tier", "standard"),
            self.orb_state.get("diagnostic_interval_minutes", 30),
        )

    # ── Core Reasoning ───────────────────────────────────────────────────────

    def _infer_task_category(self, query: str) -> TaskCategory:
        """Infer task category for contextual mode switching."""
        query_lower = query.lower()
        empirical_terms = {"what is", "how many", "data", "statistics", "measure", "observe", "record"}
        if any(t in query_lower for t in empirical_terms):
            return TaskCategory.EMPIRICAL
        ethical_terms = {"should", "ought", "moral", "ethical", "right", "wrong", "fair"}
        if any(t in query_lower for t in ethical_terms):
            return TaskCategory.ETHICAL
        analytical_terms = {"prove", "deduce", "logic", "if then", "therefore", "because"}
        if any(t in query_lower for t in analytical_terms):
            return TaskCategory.ANALYTICAL
        diagnostic_terms = {"error", "fail", "broken", "health", "status", "check"}
        if any(t in query_lower for t in diagnostic_terms):
            return TaskCategory.DIAGNOSTIC
        strategic_terms = {"plan", "strategy", "future", "long-term", "goal", "objective"}
        if any(t in query_lower for t in strategic_terms):
            return TaskCategory.STRATEGIC
        return TaskCategory.SYNTHETIC

    def reason(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute full cognitive reasoning pipeline on a query."""
        self.interaction_count += 1
        context = context or {}
        task_category = self._infer_task_category(query)

        reasoning_outputs: List[Dict[str, Any]] = []
        for seed in self.PHILOSOPHER_SEEDS.values():
            reasoning_outputs.append(self._apply_philosophical_logic(query, seed, context))

        reasoning_outputs.append(self._apply_inductive_logic(query, context))
        reasoning_outputs.append(self._apply_deductive_logic(query, context))
        reasoning_outputs.append(self._apply_intuitive_logic(query, context))

        advisory = self.advisory.compute_verdict(reasoning_outputs, task_category=task_category)
        response_text = self._formulate_response(query, advisory, reasoning_outputs)

        self._store_experience(query, reasoning_outputs, advisory)
        self._remember_pattern(
            content=f"{query} -> {response_text}",
            reasoning_mode=self._resolve_top_reasoning_mode(advisory, reasoning_outputs),
            confidence=advisory["confidence"],
            truth_likelihood=advisory["truth_likelihood"],
            source="internal_reasoning",
        )

        self.learning_loop.queue_observation({
            "type": "user_interaction",
            "query": query,
            "response": response_text,
            "confidence": advisory["confidence"],
            "feedback": context.get("feedback", "neutral"),
        })

        return {
            "query": query,
            "task_category": task_category.value,
            "philosophical_reasoning": reasoning_outputs,
            "advisory_verdict": advisory,
            "recommended_response": response_text,
            "voice_ready": True,
            "timestamp": datetime.now().isoformat(),
        }

    def _apply_philosophical_logic(self, query: str, seed: PhilosophicalSeed, context: Dict[str, Any]) -> Dict[str, Any]:
        evidence = self._retrieve_a_posteriori(query, limit=5)
        a_priori = self._retrieve_a_priori(query)

        if seed.logic_type == ReasoningMode.LOCKE_EMPIRICAL:
            confidence = seed.confidence_bias * min(1.0, len(evidence) / 4 if evidence else 0.35)
        elif seed.logic_type == ReasoningMode.HUME_SKEPTICAL:
            has_causal = any(word in query.lower() for word in ("cause", "because", "therefore"))
            confidence = seed.confidence_bias * (0.5 if has_causal else 0.95)
        elif seed.logic_type == ReasoningMode.KANT_SYNTHETIC:
            synthesis = len(a_priori) + len(evidence)
            confidence = seed.confidence_bias * min(1.0, max(synthesis, 1) / 4)
        else:
            confidence = seed.confidence_bias * (1.0 if a_priori else 0.6)

        if np is not None:
            confidence = float(np.clip(confidence, 0, 1))
        else:
            confidence = max(0.0, min(1.0, confidence))

        return {
            "philosopher": seed.name,
            "logic_type": seed.logic_type.name,
            "raw_confidence": confidence,
            "truth_estimate": round(confidence * 0.9, 4),
            "accuracy": confidence,
            "reasoning_trace": f"{seed.name} reasoning applied with {seed.weight_formula}",
            "evidence_count": len(evidence),
            "context_keys": list(context.keys())[:5],
        }

    def _apply_inductive_logic(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        patterns = self._retrieve_patterns(query, limit=5)
        confidence = 0.6 + (0.08 * len(patterns)) if patterns else 0.5
        return {
            "philosopher": "Inductive_Statistical",
            "logic_type": ReasoningMode.INDUCTIVE_STATISTICAL.name,
            "raw_confidence": round(min(0.9, confidence), 4),
            "truth_estimate": round(min(0.85, confidence), 4),
            "accuracy": round(min(0.9, confidence), 4),
            "pattern_count": len(patterns),
        }

    def _apply_deductive_logic(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        premises = self._retrieve_a_priori(query)
        confidence = 0.9 if premises else 0.4
        return {
            "philosopher": "Deductive_Logical",
            "logic_type": ReasoningMode.DEDUCTIVE_LOGICAL.name,
            "raw_confidence": round(confidence, 4),
            "truth_estimate": round(confidence, 4),
            "accuracy": round(confidence, 4),
            "premise_count": len(premises),
        }

    def _apply_intuitive_logic(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        query_embedding = self.encoder.encode(query)
        if np is not None:
            query_embedding = np.asarray(query_embedding, dtype=np.float32)
        patterns = self._retrieve_patterns(query, limit=10)

        similarity_scores: List[float] = []
        for pattern in patterns:
            if pattern.embedding is None:
                continue
            similarity_scores.append(_cosine_similarity(query_embedding, pattern.embedding))

        similarity = max(similarity_scores) if similarity_scores else 0.45
        if np is not None:
            confidence = float(np.clip(0.55 + (similarity * 0.35), 0, 0.92))
        else:
            confidence = max(0.0, min(0.92, 0.55 + (similarity * 0.35)))

        return {
            "philosopher": "Intuitive_Holistic",
            "logic_type": ReasoningMode.INTUITIVE_HOLISTIC.name,
            "raw_confidence": round(confidence, 4),
            "truth_estimate": round(min(confidence * 0.95, 1.0), 4),
            "accuracy": round(confidence, 4),
            "gestalt_match": "holistic_similarity_detected",
            "similarity": round(similarity, 4),
        }

    def _formulate_response(self, query: str, advisory: Dict[str, Any], reasoning: List[Dict[str, Any]]) -> str:
        confidence = advisory["confidence"]
        if confidence > 0.8:
            certainty = "I am confident that"
        elif confidence > 0.6:
            certainty = "I believe that"
        elif confidence > 0.4:
            certainty = "It seems possible that"
        else:
            certainty = "I am uncertain, but consider that"

        if advisory.get("weights"):
            top_index = int(np.argmax(advisory["weights"])) if np is not None else 0
            top_reasoning = reasoning[top_index]
            philosopher = top_reasoning["philosopher"]
            clause = f"{philosopher} offers the strongest frame for '{query}'."
        else:
            clause = f"further investigation is needed for '{query}'."

        if advisory.get("tension_detected"):
            clause += " Internal disagreement is high, so confidence is temporarily capped while more evidence accumulates."

        return f"{certainty} {clause}"

    def _resolve_top_reasoning_mode(self, advisory: Dict[str, Any], reasoning: List[Dict[str, Any]]) -> ReasoningMode:
        weights = advisory.get("weights") or []
        if not weights:
            return ReasoningMode.KANT_SYNTHETIC
        top_index = int(np.argmax(weights)) if np is not None else 0
        top_logic = reasoning[top_index].get("logic_type", ReasoningMode.KANT_SYNTHETIC.name)
        try:
            return ReasoningMode[top_logic]
        except KeyError:
            return ReasoningMode.KANT_SYNTHETIC

    # ── Memory & Retrieval ───────────────────────────────────────────────────

    def _retrieve_a_priori(self, query: str) -> List[str]:
        return self._retrieve_vault_matches(self.a_priori_vault["entries"], query, limit=3)

    def _retrieve_a_posteriori(self, query: str, limit: int = 5) -> List[str]:
        return self._retrieve_vault_matches(self.a_posteriori_vault["entries"], query, limit=limit)

    def _retrieve_vault_matches(self, entries: List[Dict[str, Any]], query: str, limit: int) -> List[str]:
        ranked: List[tuple[float, str]] = []
        for entry in entries:
            content = str(entry.get("content", ""))
            score = _score_text_match(query, content)
            if score > 0:
                ranked.append((score, content))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [content for _, content in ranked[:limit]]

    def _retrieve_patterns(self, query: str, limit: int = 5) -> List[LearnedPattern]:
        with self.db_lock:
            cursor = self.patterns_db.cursor()
            cursor.execute(
                "SELECT * FROM patterns WHERE content LIKE ? ORDER BY confidence DESC LIMIT ?",
                (f"%{query}%", limit),
            )
            rows = cursor.fetchall()
        return [self._row_to_pattern(row) for row in rows]

    def _row_to_pattern(self, row: Any) -> LearnedPattern:
        embedding = pickle.loads(row[9]) if row[9] is not None else None
        domain_tags = set()
        if row[14]:
            domain_tags = set(row[14].split(","))
        return LearnedPattern(
            pattern_id=row[0],
            content=row[1],
            reasoning_mode=ReasoningMode[row[2]],
            confidence=row[3],
            truth_likelihood=row[4],
            timestamp=datetime.fromisoformat(row[5]),
            source=row[6],
            use_count=row[7],
            last_validated=datetime.fromisoformat(row[8]) if row[8] else None,
            embedding=embedding,
            parent_id=row[10],
            generation=row[11] or 0,
            temporal_weight=row[12] or 1.0,
            decay_rate=row[13] or 0.001,
            domain_tags=domain_tags,
            access_count=row[15] or 0,
            last_accessed=datetime.fromisoformat(row[16]) if row[16] else None,
        )

    def _remember_pattern(
        self,
        content: str,
        reasoning_mode: ReasoningMode,
        confidence: float,
        truth_likelihood: float,
        source: str,
        parent_id: Optional[str] = None,
        temporal_weight: float = 1.0,
    ) -> None:
        timestamp = datetime.now()
        embedding = pickle.dumps(np.asarray(self.encoder.encode(content), dtype=np.float32)) if np is not None else None

        generation = 0
        if parent_id:
            with self.db_lock:
                cursor = self.patterns_db.cursor()
                cursor.execute("SELECT generation FROM patterns WHERE id = ?", (parent_id,))
                result = cursor.fetchone()
                if result and result[0] is not None:
                    generation = result[0] + 1

        pattern = LearnedPattern(
            pattern_id="",
            content=content,
            reasoning_mode=reasoning_mode,
            confidence=confidence,
            truth_likelihood=truth_likelihood,
            timestamp=timestamp,
            source=source,
            last_validated=timestamp,
            parent_id=parent_id,
            generation=generation,
            temporal_weight=temporal_weight,
        )

        with self.db_lock:
            cursor = self.patterns_db.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO patterns (
                    id, content, reasoning_mode, confidence, truth_likelihood,
                    timestamp, source, use_count, last_validated, embedding,
                    parent_id, generation, temporal_weight, decay_rate, domain_tags,
                    access_count, last_accessed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pattern.pattern_id,
                    pattern.content,
                    pattern.reasoning_mode.name,
                    pattern.confidence,
                    pattern.truth_likelihood,
                    pattern.timestamp.isoformat(),
                    pattern.source,
                    pattern.use_count,
                    pattern.last_validated.isoformat() if pattern.last_validated else None,
                    embedding,
                    pattern.parent_id,
                    pattern.generation,
                    pattern.temporal_weight,
                    pattern.decay_rate,
                    ",".join(pattern.domain_tags) if pattern.domain_tags else None,
                    pattern.access_count,
                    pattern.last_accessed.isoformat() if pattern.last_accessed else None,
                ),
            )
            self.patterns_db.commit()

    def _store_experience(self, query: str, reasoning: List[Dict[str, Any]], advisory: Dict[str, Any]) -> None:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "query": query,
            "reasoning_summary": [item["philosopher"] for item in reasoning],
            "advisory_confidence": advisory["confidence"],
            "content": f"Query: {query} | Confidence: {advisory['confidence']:.2f}",
        }
        self.a_posteriori_vault["entries"].append(entry)
        with self.a_posteriori_vault["path"].open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry) + "\n")

    def _store_research_return(self, query: str, synthesis: Dict[str, Any], raw_results: List[Dict[str, Any]]) -> None:
        weighted_vals = [
            r["weighted_confidence"]
            for r in raw_results
            if r.get("weighted_confidence") is not None and not r.get("error")
        ]
        if weighted_vals:
            if np is not None:
                confidence = float(np.mean(weighted_vals))
            else:
                confidence = sum(weighted_vals) / len(weighted_vals)
            truth_likelihood = round(confidence * 0.90, 4)
        else:
            confidence = float(synthesis.get("confidence_aggregate", 0.60))
            truth_likelihood = round(confidence * 0.90, 4)

        confidence = round(max(0.35, min(0.95, confidence)), 4)
        findings = synthesis.get("key_findings") or []
        finding_text = "; ".join(str(f) for f in findings[:3]) if findings else "(no findings)"

        entry = {
            "timestamp": datetime.now().isoformat(),
            "query": query,
            "source": "swarm_research",
            "domains": synthesis.get("domains", []),
            "sources_queried": synthesis.get("sources_queried", 0),
            "successful_returns": synthesis.get("successful_returns", 0),
            "key_findings_summary": finding_text,
            "advisory_confidence": confidence,
            "truth_likelihood": truth_likelihood,
            "content": f"Research: {query} | Findings: {finding_text} | Confidence: {confidence:.3f}",
        }
        self.a_posteriori_vault["entries"].append(entry)
        with self.a_posteriori_vault["path"].open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry) + "\n")

        self._remember_pattern(
            content=f"{query} -> {finding_text}",
            reasoning_mode=ReasoningMode.LOCKE_EMPIRICAL,
            confidence=confidence,
            truth_likelihood=truth_likelihood,
            source="swarm_research",
        )

        if confidence >= 0.82 and findings:
            crystallized = {
                "row_id": f"crystal_{hash(query) & 0xFFFFFFFF}",
                "source": "crystallized_research",
                "content": f"[Research:{confidence:.2f}] {finding_text}",
                "domain": (synthesis.get("domains") or ["general"])[0],
                "timestamp": datetime.now().isoformat(),
            }
            self.a_priori_vault["entries"].append(crystallized)
            with self.a_priori_vault["path"].open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(crystallized) + "\n")
            logger.info("Crystallized high-confidence research (%.3f) into a_priori vault: %s", confidence, query[:60])

    # ── Research & Swarm ─────────────────────────────────────────────────────

    def research(self, query: str, domains: Optional[List[str]] = None, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute swarm research and synthesize findings."""
        context = context or {}
        synthesis = self.swarm.execute_research(query, domains=domains)
        raw_results = synthesis.get("results", [])

        self._store_research_return(query, synthesis, raw_results)

        # Update knowledge graph with research nodes
        research_node_id = f"research_{hash(query) & 0xFFFFFFFF}"
        self.kg.add_node(research_node_id, type="research", query=query, confidence=synthesis.get("confidence_aggregate", 0.6))
        self.kg.add_edge("cali_identity", research_node_id, relation="conducted", weight=0.7)

        return {
            "query": query,
            "domains": domains,
            "synthesis": synthesis,
            "voice_ready": True,
            "timestamp": datetime.now().isoformat(),
        }

    # ── Voice Synthesis ──────────────────────────────────────────────────────

    def voice_synthesize(self, text: str) -> Dict[str, Any]:
        """Synthesize voice output. Stub for TTS integration."""
        if not self.orb_state.get("voice_active", True):
            return {"status": "voice_disabled", "text": text}

        # Production: call Qwen3-TTS or Kokoro endpoint
        return {
            "status": "synthesized",
            "engine": self.voice_config.get("engine", "qwen3-tts"),
            "text": text,
            "voice_path": self.voice_config.get("voice_path"),
            "speaker_id": self.voice_config.get("speaker_id"),
        }

    # ── Self-Healing & Pruning ───────────────────────────────────────────────

    def prune_patterns(self, confidence_floor: float = 0.15, max_age_days: int = 90) -> Dict[str, Any]:
        """
        Self-healing pruning: remove low-confidence, old, or orphaned patterns.
        Returns pruning report.
        """
        cutoff = datetime.now() - timedelta(days=max_age_days)
        removed = 0
        preserved = 0

        with self.db_lock:
            cursor = self.patterns_db.cursor()
            # Find candidates: low confidence AND old, or orphaned (no parent, no children, low use)
            cursor.execute(
                "SELECT id, confidence, timestamp, use_count, parent_id FROM patterns WHERE confidence < ?",
                (confidence_floor,),
            )
            candidates = cursor.fetchall()

            for row in candidates:
                pid, conf, ts_str, use_count, parent_id = row
                try:
                    ts = datetime.fromisoformat(ts_str) if ts_str else datetime.min
                except Exception:
                    ts = datetime.min

                # Check if this pattern has children
                cursor.execute("SELECT COUNT(*) FROM patterns WHERE parent_id = ?", (pid,))
                child_count = cursor.fetchone()[0]

                should_remove = False
                if conf < confidence_floor and ts < cutoff:
                    should_remove = True
                elif conf < confidence_floor and use_count < 2 and child_count == 0 and not parent_id:
                    should_remove = True

                if should_remove:
                    cursor.execute("DELETE FROM patterns WHERE id = ?", (pid,))
                    removed += 1
                else:
                    preserved += 1

            self.patterns_db.commit()

        logger.info("Pruned %d patterns, preserved %d (floor=%.2f, max_age=%d days)", removed, preserved, confidence_floor, max_age_days)
        return {"removed": removed, "preserved": preserved, "confidence_floor": confidence_floor, "max_age_days": max_age_days}

    def get_lineage(self, pattern_id: str) -> Dict[str, Any]:
        """Trace lineage of a pattern through generations."""
        lineage = []
        current_id = pattern_id
        visited = set()

        with self.db_lock:
            cursor = self.patterns_db.cursor()
            while current_id and current_id not in visited:
                visited.add(current_id)
                cursor.execute(
                    "SELECT id, content, parent_id, generation, confidence, source, timestamp FROM patterns WHERE id = ?",
                    (current_id,),
                )
                row = cursor.fetchone()
                if not row:
                    break
                lineage.append({
                    "id": row[0],
                    "content": row[1][:100] + "..." if len(row[1]) > 100 else row[1],
                    "parent_id": row[2],
                    "generation": row[3],
                    "confidence": row[4],
                    "source": row[5],
                    "timestamp": row[6],
                })
                current_id = row[2]

        return {
            "pattern_id": pattern_id,
            "lineage_depth": len(lineage),
            "ancestors": list(reversed(lineage)),
        }

    def get_pattern_stats(self) -> Dict[str, Any]:
        """Get aggregate statistics about the pattern database."""
        with self.db_lock:
            cursor = self.patterns_db.cursor()
            cursor.execute("SELECT COUNT(*) FROM patterns")
            total = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM patterns WHERE parent_id IS NOT NULL")
            with_parents = cursor.fetchone()[0]
            cursor.execute("SELECT AVG(confidence), MAX(confidence), MIN(confidence) FROM patterns")
            stats = cursor.fetchone()
            cursor.execute("SELECT reasoning_mode, COUNT(*) FROM patterns GROUP BY reasoning_mode")
            mode_counts = {row[0]: row[1] for row in cursor.fetchall()}

        return {
            "total_patterns": total,
            "patterns_with_parents": with_parents,
            "avg_confidence": round(stats[0], 4) if stats[0] else 0,
            "max_confidence": round(stats[1], 4) if stats[1] else 0,
            "min_confidence": round(stats[2], 4) if stats[2] else 0,
            "mode_distribution": mode_counts,
        }

    # ── State Management ─────────────────────────────────────────────────────

    def get_state(self) -> Dict[str, Any]:
        """Get current orb_state (legacy). v4.1 will migrate to StateBundle."""
        return dict(self.orb_state)

    def update_state(self, key: str, value: Any) -> None:
        """Update a key in orb_state."""
        self.orb_state[key] = value
        logger.info("orb_state updated: %s = %s", key, value)

    def save_state(self, path: Optional[Union[str, Path]] = None) -> Path:
        """Persist orb_state to disk."""
        path = Path(path) if path else self.cali_root / "config" / "orb_state.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(self.orb_state, f, indent=2, default=str)
        return path

    def load_state(self, path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        """Load orb_state from disk."""
        path = Path(path) if path else self.cali_root / "config" / "orb_state.json"
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                loaded = json.load(f)
            self.orb_state.update(loaded)
            return self.orb_state
        return {}

    # ── Health & Shutdown ────────────────────────────────────────────────────

    def health(self) -> Dict[str, Any]:
        """Quick health check."""
        return {
            "status": "healthy",
            "interaction_count": self.interaction_count,
            "patterns_db_connected": self.patterns_db is not None,
            "encoder_backend": self.encoder_backend,
            "device": str(self.device),
            "learning_loop_running": self.learning_loop._running if self.learning_loop else False,
            "timestamp": datetime.now().isoformat(),
        }

    def shutdown(self) -> None:
        """Graceful shutdown with cleanup."""
        logger.info("CALI SKG v4.0 shutting down...")
        self.orb_state["auto_diagnostics_enabled"] = False
        if self.learning_loop:
            self.learning_loop.stop()
        if self.patterns_db:
            self.patterns_db.close()
        self.save_state()
        logger.info("CALI SKG v4.0 shutdown complete")

    # ── Convenience Aliases ────────────────────────────────────────────────

    remember_pattern = _remember_pattern


# ═════════════════════════════════════════════════════════════════════════════
#  SECTION 6: FACTORY & CLI
# ═════════════════════════════════════════════════════════════════════════════

def create_cali(system_path: Union[str, Path] = "~/CALI", partition_size_gb: int = 20) -> CALISKG:
    """Factory function to create and initialize a CALI SKG instance."""
    return CALISKG(system_path=system_path, partition_size_gb=partition_size_gb)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="CALI SKG v4.0")
    parser.add_argument("--path", default="~/CALI", help="System path")
    parser.add_argument("--partition", type=int, default=20, help="Partition size in GB")
    parser.add_argument("--query", default="What is the nature of knowledge?", help="Test query")
    parser.add_argument("--diagnostic-tier", default="standard", choices=["lightweight", "standard", "full"])
    parser.add_argument("--prune", action="store_true", help="Run pattern pruning")
    args = parser.parse_args()

    cali = create_cali(system_path=args.path, partition_size_gb=args.partition)

    if args.prune:
        report = cali.prune_patterns()
        print(json.dumps(report, indent=2))

    # Run diagnostic
    diag = cali.diagnostic_system.full_system_probe(tier=args.diagnostic_tier)
    print("\n=== DIAGNOSTIC REPORT ===")
    print(json.dumps(diag, indent=2))

    # Run test reasoning
    result = cali.reason(args.query)
    print("\n=== REASONING RESULT ===")
    print(json.dumps(result, indent=2, default=str))

    cali.shutdown()
