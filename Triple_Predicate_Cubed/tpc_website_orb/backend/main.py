"""
TPC Website ORB - FastAPI Backend
Main application entry point.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pathlib import Path
import sys
import uvicorn
import asyncio
import json
import time
import os
import urllib.error
import urllib.request

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from tpc_core.pipeline.tpc_pipeline import get_tpc_pipeline, PipelineResult
from engines.phonatory_output_bridge.phonatory_bridge import get_phonatory_bridge


# Global state
pipeline = None
phonatory = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global pipeline, phonatory
    print("[TPC Website ORB] Initializing...")
    pipeline = get_tpc_pipeline()
    phonatory = get_phonatory_bridge()
    print("[TPC Website ORB] Ready")
    yield
    print("[TPC Website ORB] Shutting down...")


app = FastAPI(
    title="TPC Website ORB",
    description="Triple Predicate Cubed - Website ORB Assistant Backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:18020",
        "http://localhost:18020",
        "http://localhost:1420",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# REST ENDPOINTS
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "TPC Website ORB",
        "version": "1.0.0",
        "status": "active",
        "pipeline_ready": pipeline is not None
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "pipeline_stats": pipeline.get_stats() if pipeline else {},
        "phonatory_stats": phonatory.get_stats() if phonatory else {}
    }


@app.post("/api/v1/reason")
async def reason(request: dict):
    """
    Run TPC reasoning on input.

    Request body:
    {
        "input": "text or audio path",
        "input_type": "text" | "audio",
        "session_id": "optional"
    }
    """
    if not pipeline:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")

    input_data = request.get("input", "")
    input_type = request.get("input_type", "text")
    session_id = request.get("session_id")

    if not input_data:
        raise HTTPException(status_code=400, detail="Input required")

    result = await pipeline.process(input_data, input_type, session_id)

    return {
        "status": result.status.value,
        "output": result.output_text,
        "confidence": result.confidence,
        "philosopher_verdicts": result.philosopher_verdicts,
        "coherence": result.coherence_reading,
        "vault_retrieval": result.vault_retrieval,
        "ecm": result.ecm_output,
        "drift": result.drift_report,
        "processing_time_ms": result.processing_time_ms,
        "glyph_signature": result.glyph_signature,
        "depth_trace": result.depth_trace
    }


def _looks_case_specific(text: str) -> bool:
    request = text.lower()
    return any(term in request for term in [
        "my case",
        "my record",
        "my evidence",
        "my order",
        "my child",
        "my payment",
        "summarize",
        "what happened",
        "how many",
        "missed",
        "denied",
        "arrears",
        "custody",
        "visitation",
        "contact",
    ])


def _extract_ids(vault_context: str, marker: str) -> list[str]:
    ids = []
    for line in vault_context.splitlines():
        for part in line.split("|"):
            clean = part.strip()
            if clean.startswith(marker):
                value = clean.split("=", 1)[1].strip()
                if value and value not in ids:
                    ids.append(value)
    return ids


def _call_llamacpp(endpoint: str, model: str, system_prompt: str, user_prompt: str) -> str:
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "temperature": 0.3,
    }).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        body = json.loads(response.read().decode("utf-8"))
    choices = body.get("choices") or []
    if not choices:
        return ""
    first = choices[0]
    message = first.get("message") or {}
    return (message.get("content") or first.get("text") or "").strip()


@app.post("/api/v1/pops/chat")
async def pops_chat(request: dict):
    """
    POPS Chat Assistant orchestration endpoint.

    Expected request:
    {
        "prompt": "...",
        "active_page": "...",
        "site_context": "...",
        "vault_context": "...",
        "vault_record_count": 0,
        "glyph_record_count": 0
    }
    """
    if not pipeline:
        return {
            "available": False,
            "reason": "TPC service unavailable",
            "response": "",
        }

    prompt = str(request.get("prompt", "")).strip()
    active_page = str(request.get("active_page", "")).strip()
    site_context = str(request.get("site_context", "")).strip()
    vault_context = str(request.get("vault_context", "")).strip()
    vault_record_count = int(request.get("vault_record_count") or 0)
    glyph_record_count = int(request.get("glyph_record_count") or 0)

    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt required")

    used_record_ids = _extract_ids(vault_context, "record_id")
    used_glyph_trace_ids = _extract_ids(vault_context, "glyph")

    preflight_input = (
        f"Stage: POPS assistant input preflight\n"
        f"Active page: {active_page}\n\n"
        f"Site context:\n{site_context}\n\n"
        f"Vault/Glyph Trace context:\n{vault_context or 'No Vault/Glyph Trace records supplied.'}\n\n"
        f"User prompt:\n{prompt}"
    )
    preflight = await pipeline.process(preflight_input, "text", f"pops_pre_{int(time.time() * 1000)}")

    if vault_record_count == 0 and _looks_case_specific(prompt):
        return {
            "available": True,
            "reason": "vault_context_absent",
            "response": "TPC is available, but no Vault/Glyph Trace records were available for this case-specific request. I can help navigate or create records, but I will not invent case facts without authoritative Vault context.",
            "model": "",
            "endpoint": "",
            "tpc_status": preflight.status.value,
            "tpc_glyph_signature": preflight.glyph_signature,
            "used_record_ids": used_record_ids,
            "used_glyph_trace_ids": used_glyph_trace_ids,
            "vault_record_count": vault_record_count,
            "glyph_record_count": glyph_record_count,
        }

    llama_base = os.environ.get("POPS_LLAMACPP_URL", "http://127.0.0.1:40343").rstrip("/")
    llama_endpoint = f"{llama_base}/v1/chat/completions"
    model = os.environ.get("POPS_LLAMACPP_MODEL", "local-qwen")

    system_prompt = (
        "You are the POPS Chat Assistant operating under TPC control. "
        "Use only supplied Vault/Glyph Trace context for case facts. "
        "If the context is absent or incomplete, say what is missing and do not invent facts. "
        "Keep legal material factual, concise, and review-safe.\n\n"
        f"TPC preflight status: {preflight.status.value}\n"
        f"TPC preflight output:\n{preflight.output_text}\n\n"
        f"Active page: {active_page}\n\n"
        f"Site context:\n{site_context}\n\n"
        f"Vault/Glyph Trace context:\n{vault_context or 'No Vault/Glyph Trace records supplied.'}"
    )

    try:
        model_response = _call_llamacpp(llama_endpoint, model, system_prompt, prompt)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return {
            "available": False,
            "reason": f"llama.cpp unavailable: {exc}",
            "response": "",
            "model": model,
            "endpoint": llama_endpoint,
            "tpc_status": preflight.status.value,
            "tpc_glyph_signature": preflight.glyph_signature,
            "used_record_ids": used_record_ids,
            "used_glyph_trace_ids": used_glyph_trace_ids,
            "vault_record_count": vault_record_count,
            "glyph_record_count": glyph_record_count,
        }

    if not model_response:
        return {
            "available": False,
            "reason": "llama.cpp returned an empty response",
            "response": "",
            "model": model,
            "endpoint": llama_endpoint,
            "tpc_status": preflight.status.value,
            "tpc_glyph_signature": preflight.glyph_signature,
            "used_record_ids": used_record_ids,
            "used_glyph_trace_ids": used_glyph_trace_ids,
            "vault_record_count": vault_record_count,
            "glyph_record_count": glyph_record_count,
        }

    postflight = await pipeline.process(
        (
            "Stage: POPS assistant output control\n"
            f"Active page: {active_page}\n\n"
            f"Vault/Glyph Trace context:\n{vault_context or 'No Vault/Glyph Trace records supplied.'}\n\n"
            f"Candidate response:\n{model_response}"
        ),
        "text",
        f"pops_post_{int(time.time() * 1000)}",
    )

    return {
        "available": postflight.status.value == "complete",
        "reason": "ok" if postflight.status.value == "complete" else "TPC output control failed",
        "response": model_response,
        "model": model,
        "endpoint": llama_endpoint,
        "tpc_status": postflight.status.value,
        "tpc_glyph_signature": postflight.glyph_signature or preflight.glyph_signature,
        "used_record_ids": used_record_ids,
        "used_glyph_trace_ids": used_glyph_trace_ids,
        "vault_record_count": vault_record_count,
        "glyph_record_count": glyph_record_count,
    }


@app.post("/api/v1/speak")
async def speak(request: dict):
    """
    Convert text to speech.

    Request body:
    {
        "text": "text to speak",
        "voice": "optional voice id",
        "engine": "kokoro" | "qwen" | "auto"
    }
    """
    if not phonatory:
        raise HTTPException(status_code=503, detail="Phonatory bridge not initialized")

    text = request.get("text", "")
    voice = request.get("voice")
    engine = request.get("engine", "auto")

    if not text:
        raise HTTPException(status_code=400, detail="Text required")

    result = phonatory.speak(text, voice, engine)
    return result


@app.get("/api/v1/stats")
async def stats():
    """Get system statistics."""
    return {
        "pipeline": pipeline.get_stats() if pipeline else {},
        "phonatory": phonatory.get_stats() if phonatory else {},
        "timestamp": time.time()
    }


@app.get("/api/v1/voices")
async def voices():
    """List available TTS voices."""
    from engines.kokoro_engine.adapter import get_kokoro_adapter
    kokoro = get_kokoro_adapter()
    return {
        "kokoro": kokoro.list_voices(),
        "qwen": ["default"]
    }


@app.get("/api/v1/drift")
async def drift_report():
    """Get drift ping report."""
    from tpc_core.drift_ping.drift_ping import get_drift_ping_chain
    drift = get_drift_ping_chain()
    return drift.get_drift_report()


# ============================================================
# WEBSOCKET — Real-time Pipeline Streaming
# ============================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)


manager = ConnectionManager()


@app.websocket("/ws/pipeline")
async def pipeline_websocket(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()

            action = data.get("action")

            if action == "reason":
                input_data = data.get("input", "")
                input_type = data.get("input_type", "text")

                # Stream pipeline stages
                await websocket.send_json({
                    "stage": "stt_gateway",
                    "status": "processing",
                    "message": "Normalizing input..."
                })

                result = await pipeline.process(input_data, input_type)

                await websocket.send_json({
                    "stage": "complete",
                    "status": result.status.value,
                    "output": result.output_text,
                    "confidence": result.confidence,
                    "depth_trace": result.depth_trace,
                    "processing_time_ms": result.processing_time_ms
                })

            elif action == "ping":
                await websocket.send_json({"pong": True, "timestamp": time.time()})

            elif action == "stats":
                await websocket.send_json({
                    "pipeline": pipeline.get_stats(),
                    "phonatory": phonatory.get_stats()
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        await websocket.send_json({"error": str(e)})
        manager.disconnect(websocket)


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
