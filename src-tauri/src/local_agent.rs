use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::Duration;

const DEFAULT_OLLAMA_URL: &str = "http://127.0.0.1:11434";
const DEFAULT_STT_URL: &str = "http://127.0.0.1:9000";
const DEFAULT_TTS_URL: &str = "http://127.0.0.1:9880";
const WINDOWS_QWEN_TTS_URL: &str = "http://127.0.0.1:8020";
const DEFAULT_SUBSTRATE_ROOT: &str = "R:\\R_Drive_Substrate\\orb_mesh";
const DEFAULT_OLLAMA_MODEL: &str = "qwen2.5:3b";

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
    pub substrate_root: String,
    pub used_site_context: bool,
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

#[derive(Debug, Deserialize)]
struct OllamaGenerateResponse {
    response: Option<String>,
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
            status: if response.status().is_success() { "online" } else { "error" }.to_string(),
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
    let ollama = env_or_default("POPS_OLLAMA_URL", DEFAULT_OLLAMA_URL);
    let stt = env_or_default("POPS_STT_URL", DEFAULT_STT_URL);
    let tts = env_or_default("POPS_TTS_URL", DEFAULT_TTS_URL);

    let mut services = vec![
        probe_get("ollama", format!("{}/api/tags", ollama.trim_end_matches('/'))).await,
        probe_get("faster-whisper", format!("{}/openapi.json", stt.trim_end_matches('/'))).await,
        probe_get("kokoro-tts", format!("{}/health", tts.trim_end_matches('/'))).await,
        probe_get("windows-qwen3-tts", format!("{}/health", WINDOWS_QWEN_TTS_URL)).await,
    ];

    let tesseract = Command::new("wsl")
        .args(["sh", "-lc", "command -v tesseract && tesseract --version | head -1"])
        .output();
    services.push(match tesseract {
        Ok(output) if output.status.success() => LocalServiceStatus {
            name: "wsl-tesseract".to_string(),
            status: "online".to_string(),
            detail: String::from_utf8_lossy(&output.stdout).trim().replace('\n', " | "),
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
pub async fn local_agent_chat(input: LocalAgentChatInput) -> Result<LocalAgentChatResult, String> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let ollama = env_or_default("POPS_OLLAMA_URL", DEFAULT_OLLAMA_URL);
    let model = env_or_default("POPS_OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL);
    let substrate_root = env_or_default("POPS_SUBSTRATE_ROOT", DEFAULT_SUBSTRATE_ROOT);
    let endpoint = format!("{}/api/generate", ollama.trim_end_matches('/'));
    let client = http_client()?;
    let system_prompt = format!(
        "You are Pops, the local POPS guide and assistant agent.\n\
         Use the prebuilt site map to navigate the app and answer as an expert guide.\n\
         Use local-first POPS context only. Keep legal material factual and review-safe.\n\
         R-drive substrate root: {substrate_root}\n\
         Active page: {}\n\n\
         Site map and guide context:\n{}\n\n\
         User request:\n{}",
        input.active_page.trim(),
        input.site_context.trim(),
        prompt
    );

    let response = client
        .post(&endpoint)
        .json(&serde_json::json!({
            "model": model,
            "prompt": system_prompt,
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", response.status().as_u16()));
    }

    let body: OllamaGenerateResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(LocalAgentChatResult {
        response: body.response.unwrap_or_default().trim().to_string(),
        model,
        endpoint,
        substrate_root,
        used_site_context: !input.site_context.trim().is_empty(),
    })
}

#[tauri::command]
pub async fn local_agent_speak(input: LocalAgentSpeakInput) -> Result<LocalAgentSpeakResult, String> {
    let text = input.text.trim();
    if text.is_empty() {
        return Err("Speech text is required.".to_string());
    }

    let tts = env_or_default("POPS_TTS_URL", DEFAULT_TTS_URL);
    let client = http_client()?;

    let candidates = [
        (
            format!("{}/speak", tts.trim_end_matches('/')),
            serde_json::json!({
                "text": text,
                "voice": input.voice.clone().unwrap_or_else(|| "af_bella".to_string())
            }),
        ),
        (
            format!("{}/synthesize", WINDOWS_QWEN_TTS_URL),
            serde_json::json!({
                "text": text,
                "voice": input.voice.clone().unwrap_or_else(|| "af_bella".to_string())
            }),
        ),
    ];

    let mut last_error = String::new();
    for (endpoint, payload) in candidates {
        let response = client
            .post(&endpoint)
            .json(&payload)
            .send()
            .await;

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
        "No local TTS endpoint responded.".to_string()
    } else {
        last_error
    })
        /*
        client
        .post(&endpoint)
        .json(&serde_json::json!({
            "text": text,
            "voice": input.voice.unwrap_or_else(|| "af_bella".to_string())
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let audio_path = raw
        .get("audio_path")
        .or_else(|| raw.get("path"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    Ok(LocalAgentSpeakResult {
        ok: true,
        endpoint,
        audio_path,
        raw,
    })
    */
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
