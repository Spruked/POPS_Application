#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CALI State Architecture v4.0 — Desired / Runtime / Effective / Activity

Replaces the monolithic orb_state dict with a clean four-layer state model:

  DESIRED   → What Bryan / DockStation asks for
  RUNTIME   → What the Bridge / Runtime reports back
  EFFECTIVE → What CALI authorizes (intersection of Desired + Runtime constraints)
  ACTIVITY  → What's actively happening right now (transient, high-frequency)

This module is designed to be imported by CALISKG v4.0 and wired into the
command bridge: DockStation → CALI → Bridge → Runtime → Renderer.

Author: CALI Architecture Team
Version: 4.0.0
"""

import os
import json
import time
import threading
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum


class StateLayer(Enum):
    DESIRED = "desired"      # What the user / DockStation wants
    RUNTIME = "runtime"      # What the bridge / runtime reports
    EFFECTIVE = "effective"  # What CALI authorizes (governed intersection)
    ACTIVITY = "activity"    # Transient real-time state


@dataclass
class StateEntry:
    """A single state variable with provenance and timestamp."""
    key: str
    value: Any
    layer: StateLayer
    timestamp: str
    source: str                    # Who set this (e.g., "dockstation", "bridge", "cali", "runtime")
    expiry: Optional[str] = None  # ISO timestamp after which this entry is stale
    locked: bool = False           # If True, only CALI can modify
    override_chain: List[str] = field(default_factory=list)


class StateBundle:
    """
    Four-layer state container with merge logic and governance.
    Replaces the old orb_state dict.
    """

    def __init__(self, persist_path: Optional[Path] = None):
        self._state: Dict[str, StateEntry] = {}
        self._lock = threading.RLock()
        self._listeners: List[Callable[[str, StateEntry], None]] = []
        self._persist_path = persist_path
        self._last_persist = datetime.min.isoformat()

        # Default desired states
        self._defaults = {
            "skin": "default_crystalline",
            "swarm_visible": False,
            "desktop_access": True,
            "browser_access": True,
            "voice_active": True,
            "llm_route": "local",
            "llm_local_endpoint": "http://127.0.0.1:11455",
            "llm_local_model": "qwen2.5:3b",
            "llm_governance_wrapper": False,
            "llm_retain_voice": True,
            "morb_deployment_enabled": True,
            "mesh_traversal_enabled": True,
            "aggressive_learning_enabled": True,
            "auto_diagnostics_enabled": True,
            "diagnostic_interval_minutes": 30,
            "diagnostic_tier": "standard",
            "movement_enabled": True,
            "listener_active": False,
            "render_quality": "high",
            "frame_target": 60,
        }

        for key, value in self._defaults.items():
            self.set(key, value, layer=StateLayer.DESIRED, source="init")

    # ── Core Operations ──────────────────────────────────────────────────────

    def set(
        self,
        key: str,
        value: Any,
        layer: StateLayer = StateLayer.DESIRED,
        source: str = "unknown",
        expiry: Optional[str] = None,
        locked: bool = False,
    ) -> None:
        """Set a state entry in a specific layer."""
        with self._lock:
            # Check lock
            existing = self._state.get(key)
            if existing and existing.locked and source != "cali":
                raise PermissionError(f"State key '{key}' is locked by CALI")

            entry = StateEntry(
                key=key,
                value=value,
                layer=layer,
                timestamp=datetime.now().isoformat(),
                source=source,
                expiry=expiry,
                locked=locked,
                override_chain=(existing.override_chain + [source]) if existing else [source],
            )
            self._state[key] = entry
            self._notify(key, entry)

    def get(self, key: str, layer: Optional[StateLayer] = None) -> Any:
        """Get a value. If layer specified, only search that layer."""
        with self._lock:
            entry = self._state.get(key)
            if not entry:
                return self._defaults.get(key)
            if layer and entry.layer != layer:
                return None
            # Check expiry
            if entry.expiry and datetime.now().isoformat() > entry.expiry:
                return None
            return entry.value

    def get_entry(self, key: str) -> Optional[StateEntry]:
        """Get the full StateEntry including metadata."""
        with self._lock:
            return self._state.get(key)

    def get_layer(self, layer: StateLayer) -> Dict[str, Any]:
        """Get all values for a specific layer."""
        with self._lock:
            return {
                k: v.value
                for k, v in self._state.items()
                if v.layer == layer
            }

    def delete(self, key: str, source: str = "unknown") -> bool:
        """Delete a state entry."""
        with self._lock:
            existing = self._state.get(key)
            if existing and existing.locked and source != "cali":
                raise PermissionError(f"State key '{key}' is locked by CALI")
            return self._state.pop(key, None) is not None

    # ── Effective State Computation ──────────────────────────────────────────

    def compute_effective(self, key: str) -> Any:
        """
        Compute the effective state for a key.
        Effective = intersection of DESIRED and RUNTIME, governed by CALI policy.
        """
        with self._lock:
            desired = self._state.get(f"{key}#desired")
            runtime = self._state.get(f"{key}#runtime")

            # If no runtime report, desired wins
            if not runtime:
                return desired.value if desired else self._defaults.get(key)

            # If no desired, runtime wins (autonomous mode)
            if not desired:
                return runtime.value

            # Conflict resolution: CALI governance
            # If runtime contradicts desired, effective = desired (user authority)
            # Unless runtime reports a safety constraint (e.g., overheating)
            if isinstance(desired.value, bool) and isinstance(runtime.value, bool):
                # Safety: if runtime says OFF for safety, override desired ON
                if runtime.source in ("bridge", "runtime", "safety") and not runtime.value:
                    return False
                return desired.value

            # For numeric values, take the more conservative (lower) if conflict
            if isinstance(desired.value, (int, float)) and isinstance(runtime.value, (int, float)):
                if runtime.source in ("bridge", "runtime", "safety"):
                    return min(desired.value, runtime.value)
                return desired.value

            # Default: desired wins
            return desired.value

    def recompute_all_effective(self) -> Dict[str, Any]:
        """Recompute effective state for all known keys."""
        with self._lock:
            keys = {k.split("#")[0] for k in self._state.keys() if "#" in k}
            keys.update(self._defaults.keys())
            effective = {}
            for key in keys:
                val = self.compute_effective(key)
                effective[key] = val
                self.set(key, val, layer=StateLayer.EFFECTIVE, source="cali")
            return effective

    # ── Activity State (Transient) ─────────────────────────────────────────

    def pulse_activity(self, key: str, value: Any, ttl_seconds: float = 5.0) -> None:
        """
        Set a transient activity state with TTL.
        Used for high-frequency updates: cursor position, frame rate, audio level, etc.
        """
        expiry = (datetime.now().isoformat())  # Simplified; production uses proper timedelta
        self.set(key, value, layer=StateLayer.ACTIVITY, source="runtime", expiry=expiry)

    def get_active(self, key: str) -> Any:
        """Get an activity value if not expired."""
        return self.get(key, layer=StateLayer.ACTIVITY)

    def sweep_activity(self) -> int:
        """Remove expired activity entries. Returns count removed."""
        now = datetime.now().isoformat()
        removed = 0
        with self._lock:
            to_remove = [
                k for k, v in self._state.items()
                if v.layer == StateLayer.ACTIVITY and v.expiry and now > v.expiry
            ]
            for k in to_remove:
                self._state.pop(k, None)
                removed += 1
        return removed

    # ── Listeners ────────────────────────────────────────────────────────────

    def add_listener(self, callback: Callable[[str, StateEntry], None]) -> None:
        self._listeners.append(callback)

    def remove_listener(self, callback: Callable[[str, StateEntry], None]) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    def _notify(self, key: str, entry: StateEntry) -> None:
        for listener in self._listeners:
            try:
                listener(key, entry)
            except Exception as exc:
                pass  # Listeners must not crash the state system

    # ── Persistence ──────────────────────────────────────────────────────────

    def persist(self) -> None:
        """Save all non-transient state to disk."""
        if not self._persist_path:
            return
        with self._lock:
            snapshot = {
                k: {
                    "value": v.value,
                    "layer": v.layer.value,
                    "timestamp": v.timestamp,
                    "source": v.source,
                    "locked": v.locked,
                }
                for k, v in self._state.items()
                if v.layer != StateLayer.ACTIVITY  # Don't persist transient activity
            }
        self._persist_path.parent.mkdir(parents=True, exist_ok=True)
        with self._persist_path.open("w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2, default=str)
        self._last_persist = datetime.now().isoformat()

    def load(self) -> None:
        """Load state from disk."""
        if not self._persist_path or not self._persist_path.exists():
            return
        with self._persist_path.open("r", encoding="utf-8") as f:
            snapshot = json.load(f)
        for key, data in snapshot.items():
            layer = StateLayer(data.get("layer", "desired"))
            self.set(
                key=key,
                value=data["value"],
                layer=layer,
                source=data.get("source", "persist"),
                locked=data.get("locked", False),
            )

    # ── Convenience ────────────────────────────────────────────────────────────

    def to_dict(self) -> Dict[str, Any]:
        """Export all layers as nested dict."""
        return {
            "desired": self.get_layer(StateLayer.DESIRED),
            "runtime": self.get_layer(StateLayer.RUNTIME),
            "effective": self.get_layer(StateLayer.EFFECTIVE),
            "activity": self.get_layer(StateLayer.ACTIVITY),
        }

    def __repr__(self) -> str:
        return f"StateBundle(keys={len(self._state)}, persisted={self._persist_path})"


class CommandBridge:
    """
    Command bridge: DockStation → CALI → Bridge → Runtime → Renderer
    Uses StateBundle for all state flow.
    """

    def __init__(self, state_bundle: StateBundle, cali_instance: Any = None):
        self.state = state_bundle
        self.cali = cali_instance
        self._command_queue: List[Dict[str, Any]] = []
        self._feedback_queue: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        """Start the command bridge loop."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._bridge_worker, daemon=True, name="cali-command-bridge")
        self._thread.start()
        print("[CommandBridge] Started")

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)

    def _bridge_worker(self) -> None:
        while self._running:
            time.sleep(0.1)
            self._process_commands()
            self._process_feedback()
            self.state.sweep_activity()

    def _process_commands(self) -> None:
        with self._lock:
            commands = self._command_queue[:10]
            self._command_queue = self._command_queue[10:]

        for cmd in commands:
            try:
                self._execute_command(cmd)
            except Exception as exc:
                self._feedback_queue.append({
                    "type": "error",
                    "command": cmd,
                    "error": str(exc),
                    "timestamp": datetime.now().isoformat(),
                })

    def _execute_command(self, cmd: Dict[str, Any]) -> None:
        action = cmd.get("action")
        target = cmd.get("target")
        value = cmd.get("value")
        source = cmd.get("source", "dockstation")

        if action == "set_desired":
            self.state.set(target, value, layer=StateLayer.DESIRED, source=source)
            # Trigger effective recompute
            effective = self.state.compute_effective(target)
            self.state.set(target, effective, layer=StateLayer.EFFECTIVE, source="cali")
            self._feedback_queue.append({
                "type": "ack",
                "action": action,
                "target": target,
                "effective": effective,
            })

        elif action == "set_runtime":
            self.state.set(target, value, layer=StateLayer.RUNTIME, source=source)
            effective = self.state.compute_effective(target)
            self.state.set(target, effective, layer=StateLayer.EFFECTIVE, source="cali")

        elif action == "lock":
            self.state.set(target, value, layer=StateLayer.EFFECTIVE, source="cali", locked=True)

        elif action == "unlock":
            entry = self.state.get_entry(target)
            if entry:
                entry.locked = False

        elif action == "get_state":
            self._feedback_queue.append({
                "type": "state_snapshot",
                "data": self.state.to_dict(),
            })

        elif action == "pulse":
            ttl = cmd.get("ttl_seconds", 5.0)
            self.state.pulse_activity(target, value, ttl_seconds=ttl)

    def _process_feedback(self) -> None:
        with self._lock:
            feedback = self._feedback_queue[:10]
            self._feedback_queue = self._feedback_queue[10:]

        for fb in feedback:
            # In production: send back to DockStation via websocket/IPC
            pass

    def send_command(self, cmd: Dict[str, Any]) -> None:
        with self._lock:
            self._command_queue.append(cmd)

    def get_feedback(self, limit: int = 10) -> List[Dict[str, Any]]:
        with self._lock:
            return self._feedback_queue[:limit]


# ═════════════════════════════════════════════════════════════════════════════
#  MIGRATION HELPER: orb_state → StateBundle
# ═════════════════════════════════════════════════════════════════════════════

def migrate_orb_state(orb_state_dict: Dict[str, Any], persist_path: Optional[Path] = None) -> StateBundle:
    """Migrate a legacy orb_state dict into a new StateBundle."""
    bundle = StateBundle(persist_path=persist_path)
    for key, value in orb_state_dict.items():
        bundle.set(key, value, layer=StateLayer.DESIRED, source="migration")
    bundle.recompute_all_effective()
    return bundle


if __name__ == "__main__":
    # Demo
    bundle = StateBundle(persist_path=Path("./cali_state.json"))
    bundle.set("movement_enabled", True, layer=StateLayer.DESIRED, source="dockstation")
    bundle.set("movement_enabled", False, layer=StateLayer.RUNTIME, source="runtime")  # Safety stop
    print("Effective movement_enabled:", bundle.compute_effective("movement_enabled"))
    print(bundle.to_dict())
