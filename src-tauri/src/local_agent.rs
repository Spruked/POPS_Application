use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::Duration;

const DEFAULT_LLAMACPP_URL: &str = "http://127.0.0.1:40343";
const DEFAULT_TPC_URL: &str = "http://127.0.0.1:8021";
const DEFAULT_STT_URL: &str = "http://127.0.0.1:9000";
const WINDOWS_QWEN_TTS_URL: &str = "http://127.0.0.1:8020";
const DEFAULT_SUBSTRATE_ROOT: &str = "R:\\R_Drive_Substrate\\orb_mesh";
const DEFAULT_LLAMACPP_MODEL: &str = "local-qwen";

#[derive(Debug, Deserialize)]
pub struct LocalAgentChatInput {
    pub prompt: String,
    pub active_page: String,
    pub site_context: String,
}

#[derive(Debug, Serialize)]
pub struct LocalAgentChatResult {
    pub response: String,
    pub model: String,
    pub endpoint: String,
    pub tpc_endpoint: String,
    pub tpc_status: String,
    pub tpc_glyph_signature: Option<String>,
    pub available: bool,
    pub reason: String,
    pub used_record_ids: Vec<String>,
    pub used_glyph_trace_ids: Vec<String>,
    pub substrate_root: String,
    pub used_site_context: bool,
    pub used_vault_context: bool,
    pub vault_record_count: usize,
    pub glyph_record_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct LocalAgentSpeakInput {
    pub text: String,
    pub voice: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LocalAgentSpeakResult {
    pub ok: bool,
    pub endpoint: String,
    pub audio_path: Option<String>,
    pub raw: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct LocalAgentOcrInput {
    pub image_path: String,
}

#[derive(Debug, Serialize)]
pub struct LocalAgentOcrResult {
    pub text: String,
    pub engine: String,
}

#[derive(Debug, Serialize)]
pub struct LocalServiceStatus {
    pub name: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct LocalAgentStatus {
    pub substrate_root: String,
    pub substrate_available: bool,
    pub services: Vec<LocalServiceStatus>,
}

#[derive(Debug, Serialize)]
pub struct LocalAgentReadiness {
    pub ready: bool,
    pub llama_endpoint: String,
    pub llama_status: String,
    pub model: Option<String>,
    pub tpc_endpoint: String,
    pub tpc_status: String,
}

#[derive(Debug, Deserialize)]
struct TpcChatResponse {
    available: bool,
    reason: Option<String>,
    response: Option<String>,
    model: Option<String>,
    endpoint: Option<String>,
    tpc_status: Option<String>,
    tpc_glyph_signature: Option<String>,
    used_record_ids: Option<Vec<String>>,
    used_glyph_trace_ids: Option<Vec<String>>,
    vault_record_count: Option<usize>,
    glyph_record_count: Option<usize>,
}

fn env_or_default(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

async fn probe_get(name: &str, url: String) -> LocalServiceStatus {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return LocalServiceStatus {
                name: name.to_string(),
                status: "error".to_string(),
                detail: error.to_string(),
            }
        }
    };

    match client.get(&url).send().await {
        Ok(response) => LocalServiceStatus {
            name: name.to_string(),
            status: if response.status().is_success() {
                "online"
            } else {
                "error"
            }
            .to_string(),
            detail: format!("{} {}", response.status().as_u16(), url),
        },
        Err(error) => LocalServiceStatus {
            name: name.to_string(),
            status: "offline".to_string(),
            detail: error.to_string(),
        },
    }
}

#[tauri::command]
pub async fn local_agent_status() -> Result<LocalAgentStatus, String> {
    let substrate_root = env_or_default("POPS_SUBSTRATE_ROOT", DEFAULT_SUBSTRATE_ROOT);
    let llamacpp = env_or_default("POPS_LLAMACPP_URL", DEFAULT_LLAMACPP_URL);
    let tpc = env_or_default("POPS_TPC_URL", DEFAULT_TPC_URL);
    let stt = env_or_default("POPS_STT_URL", DEFAULT_STT_URL);
    let qwen_tts = env_or_default("POPS_QWEN_TTS_URL", WINDOWS_QWEN_TTS_URL);

    let mut services = vec![
        probe_get(
            "windows-llama.cpp",
            format!("{}/v1/models", llamacpp.trim_end_matches('/')),
        )
        .await,
        probe_get(
            "tpc-reasoning-pipeline",
            format!("{}/health", tpc.trim_end_matches('/')),
        )
        .await,
        probe_get(
            "faster-whisper",
            format!("{}/openapi.json", stt.trim_end_matches('/')),
        )
        .await,
        probe_get(
            "windows-qwen-tts",
            format!("{}/health", qwen_tts.trim_end_matches('/')),
        )
        .await,
    ];

    let tesseract = Command::new("wsl")
        .args([
            "sh",
            "-lc",
            "command -v tesseract && tesseract --version | head -1",
        ])
        .output();
    services.push(match tesseract {
        Ok(output) if output.status.success() => LocalServiceStatus {
            name: "wsl-tesseract".to_string(),
            status: "online".to_string(),
            detail: String::from_utf8_lossy(&output.stdout)
                .trim()
                .replace('\n', " | "),
        },
        Ok(output) => LocalServiceStatus {
            name: "wsl-tesseract".to_string(),
            status: "offline".to_string(),
            detail: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(error) => LocalServiceStatus {
            name: "wsl-tesseract".to_string(),
            status: "offline".to_string(),
            detail: error.to_string(),
        },
    });

    Ok(LocalAgentStatus {
        substrate_available: Path::new(&substrate_root).exists(),
        substrate_root,
        services,
    })
}

#[tauri::command]
pub async fn local_agent_readiness() -> Result<LocalAgentReadiness, String> {
    let llamacpp = env_or_default("POPS_LLAMACPP_URL", DEFAULT_LLAMACPP_URL);
    let tpc = env_or_default("POPS_TPC_URL", DEFAULT_TPC_URL);
    let llama_endpoint = format!("{}/v1/models", llamacpp.trim_end_matches('/'));
    let tpc_endpoint = format!("{}/health", tpc.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| error.to_string())?;

    let (llama_status, model) = match client.get(&llama_endpoint).send().await {
        Ok(response) if response.status().is_success() => {
            let model = response
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|body| body.get("models").and_then(|models| models.as_array()).cloned())
                .and_then(|models| models.first().cloned())
                .and_then(|entry| entry.get("model").or_else(|| entry.get("name")).and_then(|v| v.as_str()).map(String::from));
            ("online".to_string(), model)
        }
        Ok(response) => (format!("http_{}", response.status().as_u16()), None),
        Err(error) => (format!("offline: {error}"), None),
    };
    let tpc_status = match client.get(&tpc_endpoint).send().await {
        Ok(response) if response.status().is_success() => "online".to_string(),
        Ok(response) => format!("http_{}", response.status().as_u16()),
        Err(error) => format!("offline: {error}"),
    };

    Ok(LocalAgentReadiness {
        ready: llama_status == "online" && tpc_status == "online",
        llama_endpoint,
        llama_status,
        model,
        tpc_endpoint,
        tpc_status,
    })
}

pub async fn local_agent_chat_with_context(
    input: LocalAgentChatInput,
    vault_context: String,
    vault_record_count: usize,
    glyph_record_count: usize,
) -> Result<LocalAgentChatResult, String> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let tpc = env_or_default("POPS_TPC_URL", DEFAULT_TPC_URL);
    let substrate_root = env_or_default("POPS_SUBSTRATE_ROOT", DEFAULT_SUBSTRATE_ROOT);
    let tpc_endpoint = format!("{}/api/v1/pops/chat", tpc.trim_end_matches('/'));
    let client = http_client()?;

    let response = client
        .post(&tpc_endpoint)
        .json(&serde_json::json!({
            "prompt": prompt,
            "active_page": input.active_page.trim(),
            "site_context": input.site_context.trim(),
            "vault_context": vault_context.trim(),
            "vault_record_count": vault_record_count,
            "glyph_record_count": glyph_record_count
        }))
        .send()
        .await
        .map_err(|error| {
            format!("TPC service unavailable. Local llama.cpp was not called. {error}")
        })?;

    if !response.status().is_success() {
        return Err(format!(
            "TPC service returned HTTP {}. Local llama.cpp was not called directly.",
            response.status().as_u16()
        ));
    }

    let body: TpcChatResponse = response
        .json()
        .await
        .map_err(|error| format!("TPC service returned an unreadable response. {error}"))?;

    if !body.available {
        return Ok(LocalAgentChatResult {
            response: "Chat Assistant is temporarily unavailable.".to_string(),
            model: body.model.unwrap_or_default(),
            endpoint: body.endpoint.unwrap_or_default(),
            tpc_endpoint,
            tpc_status: body.tpc_status.unwrap_or_else(|| "unavailable".to_string()),
            tpc_glyph_signature: body.tpc_glyph_signature,
            available: false,
            reason: body
                .reason
                .unwrap_or_else(|| "TPC service unavailable".to_string()),
            used_record_ids: body.used_record_ids.unwrap_or_default(),
            used_glyph_trace_ids: body.used_glyph_trace_ids.unwrap_or_default(),
            substrate_root,
            used_site_context: !input.site_context.trim().is_empty(),
            used_vault_context: !vault_context.trim().is_empty(),
            vault_record_count: body.vault_record_count.unwrap_or(vault_record_count),
            glyph_record_count: body.glyph_record_count.unwrap_or(glyph_record_count),
        });
    }

    Ok(LocalAgentChatResult {
        response: body.response.unwrap_or_default(),
        model: body
            .model
            .unwrap_or_else(|| DEFAULT_LLAMACPP_MODEL.to_string()),
        endpoint: body.endpoint.unwrap_or_default(),
        tpc_endpoint,
        tpc_status: body.tpc_status.unwrap_or_else(|| "complete".to_string()),
        tpc_glyph_signature: body.tpc_glyph_signature,
        available: true,
        reason: body.reason.unwrap_or_else(|| "ok".to_string()),
        used_record_ids: body.used_record_ids.unwrap_or_default(),
        used_glyph_trace_ids: body.used_glyph_trace_ids.unwrap_or_default(),
        substrate_root,
        used_site_context: !input.site_context.trim().is_empty(),
        used_vault_context: !vault_context.trim().is_empty(),
        vault_record_count: body.vault_record_count.unwrap_or(vault_record_count),
        glyph_record_count: body.glyph_record_count.unwrap_or(glyph_record_count),
    })
}

#[tauri::command]
pub async fn local_agent_speak(
    input: LocalAgentSpeakInput,
) -> Result<LocalAgentSpeakResult, String> {
    let text = input.text.trim();
    if text.is_empty() {
        return Err("Speech text is required.".to_string());
    }

    let qwen_tts = env_or_default("POPS_QWEN_TTS_URL", WINDOWS_QWEN_TTS_URL);
    let client = http_client()?;

    let candidates = [
        (
            format!("{}/synthesize", qwen_tts.trim_end_matches('/')),
            serde_json::json!({
                "text": text,
                "voice": input.voice.clone().unwrap_or_else(|| "default".to_string())
            }),
        ),
        (
            format!("{}/speak", qwen_tts.trim_end_matches('/')),
            serde_json::json!({
                "text": text,
                "voice": input.voice.clone().unwrap_or_else(|| "default".to_string())
            }),
        ),
    ];

    let mut last_error = String::new();
    for (endpoint, payload) in candidates {
        let response = client.post(&endpoint).json(&payload).send().await;

        let Ok(response) = response else {
            last_error = response.err().map(|e| e.to_string()).unwrap_or_default();
            continue;
        };

        if !response.status().is_success() {
            last_error = format!("{} returned HTTP {}", endpoint, response.status().as_u16());
            continue;
        }

        let raw: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let audio_path = raw
            .get("audio_path")
            .or_else(|| raw.get("path"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());

        return Ok(LocalAgentSpeakResult {
            ok: true,
            endpoint,
            audio_path,
            raw,
        });
    }

    Err(if last_error.is_empty() {
        "No Windows Qwen TTS endpoint responded.".to_string()
    } else {
        last_error
    })
}

#[tauri::command]
pub fn local_agent_ocr(input: LocalAgentOcrInput) -> Result<LocalAgentOcrResult, String> {
    let image_path = input.image_path.trim();
    if image_path.is_empty() {
        return Err("Image path is required.".to_string());
    }

    let escaped = image_path.replace('\\', "/").replace('\'', "'\\''");
    let command = format!("tesseract '{}' stdout", escaped);
    let output = Command::new("wsl")
        .args(["sh", "-lc", &command])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(LocalAgentOcrResult {
        text: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        engine: "wsl-tesseract".to_string(),
    })
}
