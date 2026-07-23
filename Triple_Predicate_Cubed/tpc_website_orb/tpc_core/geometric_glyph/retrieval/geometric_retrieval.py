"""
Geometric Glyph Retrieval
Retrieval spectrum:
- Known signature → exact vault retrieval
- Near signature → weighted partial retrieval + confidence score
- Distant signature → novel input, triggers philosopher recursion
- Orthogonal → genuinely unknown, ECM escalation
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import time

from tpc_core.geometric_glyph.signatures.glyph_signatures import GlyphSignature, get_glyph_engine


class RetrievalResult(Enum):
    EXACT = "exact"
    PARTIAL = "partial"
    NOVEL = "novel"
    UNKNOWN = "unknown"


@dataclass
class RetrievalOutput:
    result: RetrievalResult
    confidence: float
    matched_entries: List[Dict]
    distance: float
    recommendation: str
    timestamp: float


class GeometricRetrieval:
    """
    Geometric retrieval engine.
    Distance in geometric space IS the confidence score.
    """

    def __init__(self, vault_interface=None, dimensions: int = 18):
        self.glyph_engine = get_glyph_engine(dimensions)
        self.vault = vault_interface or self._default_vault_interface()
        self.retrieval_history: List[Dict] = []
        self.thresholds = {
            'exact': 0.05,
            'near': 0.3,
            'distant': 0.7
        }

    def _default_vault_interface(self) -> Dict[str, Any]:
        from tpc_core.axis3_resolution_trinity.a_priori_vault.a_priori_vault import get_a_priori_vault
        from tpc_core.axis3_resolution_trinity.a_posteriori_vault.a_posteriori_vault import get_a_posteriori_vault

        return {
            "a_priori": get_a_priori_vault(),
            "a_posteriori": get_a_posteriori_vault(),
        }

    def retrieve(self, query_vector: np.ndarray, 
                 certainty: float = 0.5) -> RetrievalOutput:
        """
        Perform geometric retrieval on query vector.

        Returns classification and recommended action.
        """
        # Generate query signature
        query_sig = self.glyph_engine.generate(
            query_vector, certainty=certainty, source="retrieval_query"
        )

        # If vault available, search for matches
        if self.vault:
            matches = self._vault_search(query_sig)
        else:
            matches = []

        # Determine classification
        if matches:
            best_distance = matches[0]['distance']
            classification = self.glyph_engine.classify_retrieval(best_distance)

            if classification == "exact":
                result = RetrievalResult.EXACT
                confidence = 1.0 - best_distance
                recommendation = "Return vault entry directly"
            elif classification == "near":
                result = RetrievalResult.PARTIAL
                confidence = 1.0 - best_distance
                recommendation = "Weighted partial retrieval + philosopher verification"
            else:
                result = RetrievalResult.NOVEL
                confidence = 0.3
                recommendation = "Trigger philosopher recursion"
        else:
            result = RetrievalResult.UNKNOWN
            confidence = 0.1
            recommendation = "ECM escalation — genuinely unknown input"
            best_distance = 1.0

        output = RetrievalOutput(
            result=result,
            confidence=confidence,
            matched_entries=matches,
            distance=best_distance,
            recommendation=recommendation,
            timestamp=time.time()
        )

        self.retrieval_history.append({
            'result': result.value,
            'confidence': confidence,
            'distance': best_distance,
            'timestamp': time.time()
        })

        return output

    def _vault_search(self, query_sig: GlyphSignature) -> List[Dict]:
        """Search vault for geometrically similar signatures."""
        matches: List[Dict] = []
        a_priori = self._get_vault("a_priori")
        a_posteriori = self._get_vault("a_posteriori")

        if a_priori:
            for entry in a_priori.get_all_entries():
                entry_sig = self.glyph_engine.generate(
                    np.array(entry["signature"], dtype=float),
                    certainty=float(entry.get("certainty", 0.95)),
                    source=f"a_priori:{entry['id']}",
                )
                matches.append(self._match_record(query_sig, entry_sig, entry, "a_priori"))

        if a_posteriori:
            for entry in a_posteriori.get_all_entries():
                entry_sig = self.glyph_engine.generate(
                    np.array(entry["input_signature"], dtype=float),
                    certainty=float(entry.get("certainty", 0.7)),
                    source=f"a_posteriori:{entry['id']}",
                )
                matches.append(self._match_record(query_sig, entry_sig, entry, "a_posteriori"))

        matches.sort(key=lambda item: item["distance"])
        return matches[:5]

    def _get_vault(self, name: str):
        if isinstance(self.vault, dict):
            return self.vault.get(name)
        return getattr(self.vault, name, None)

    def _match_record(self, query_sig: GlyphSignature, entry_sig: GlyphSignature,
                      entry: Dict, source: str) -> Dict:
        distance = float(self.glyph_engine.compare(query_sig, entry_sig))
        certainty = float(entry.get("certainty", 0.5))
        return {
            "id": entry["id"],
            "source": source,
            "content": entry.get("content", ""),
            "certainty": certainty,
            "distance": distance,
            "confidence": max(0.0, 1.0 - distance) * certainty,
        }

    def batch_retrieve(self, query_vectors: List[np.ndarray],
                       certainties: List[float] = None) -> List[RetrievalOutput]:
        """Batch retrieval for efficiency."""
        certainties = certainties or [0.5] * len(query_vectors)
        return [self.retrieve(v, c) for v, c in zip(query_vectors, certainties)]

    def get_stats(self) -> Dict:
        if not self.retrieval_history:
            return {'total_queries': 0}

        results = [r['result'] for r in self.retrieval_history]
        return {
            'total_queries': len(self.retrieval_history),
            'exact_rate': results.count('exact') / len(results),
            'partial_rate': results.count('partial') / len(results),
            'novel_rate': results.count('novel') / len(results),
            'unknown_rate': results.count('unknown') / len(results),
            'avg_confidence': np.mean([r['confidence'] for r in self.retrieval_history]),
            'thresholds': self.thresholds
        }


# Singleton
_retrieval_engine = None

def get_geometric_retrieval(vault_interface=None, dimensions: int = 18) -> GeometricRetrieval:
    global _retrieval_engine
    if _retrieval_engine is None:
        _retrieval_engine = GeometricRetrieval(vault_interface, dimensions)
    elif vault_interface is not None:
        _retrieval_engine.vault = vault_interface
    return _retrieval_engine
