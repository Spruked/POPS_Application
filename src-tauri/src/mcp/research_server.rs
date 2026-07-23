use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct McpResearchInput {
    pub query: String,
    pub context: String,
    pub adapter: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct McpResearchResult {
    pub tool: String,
    pub query: String,
    pub context: String,
    pub status: String,
    pub title: String,
    pub finding: String,
    pub sources: Vec<String>,
    pub deterministic: bool,
    pub adapter: String,
    pub created_at: String,
}

fn approved_adapter(requested: Option<String>) -> Result<String, String> {
    let adapter = requested
        .unwrap_or_else(|| "placeholder".to_string())
        .trim()
        .to_lowercase();

    match adapter.as_str() {
        "" | "placeholder" => Ok("placeholder".to_string()),
        "rdrive_substrate" | "orb_mesh" | "local_mcp" => Ok("rdrive_substrate".to_string()),
        _ => Err(format!("Research adapter '{}' is not configured.", adapter)),
    }
}

#[tauri::command]
pub fn mcp_research_tool(input: McpResearchInput) -> Result<McpResearchResult, String> {
    let query = input.query.trim().to_string();
    if query.is_empty() {
        return Err("Research query is required.".to_string());
    }

    let adapter = approved_adapter(input.adapter)?;

    let substrate_root = std::env::var("POPS_SUBSTRATE_ROOT")
        .unwrap_or_else(|_| "R:\\R_Drive_Substrate\\orb_mesh".to_string());
    let substrate_available = std::path::Path::new(&substrate_root).exists();
    let (status, title, finding, sources) = if adapter == "rdrive_substrate" {
        (
            if substrate_available { "complete" } else { "substrate_unavailable" }.to_string(),
            "R-drive substrate MCP research result".to_string(),
            format!(
                "R-drive substrate adapter selected. Query '{}' was bounded to local POPS context and substrate root '{}'.",
                query, substrate_root
            ),
            vec![substrate_root.clone()],
        )
    } else {
        (
            "placeholder".to_string(),
            "MCP research placeholder result".to_string(),
            "Deterministic research tool stub executed. No external search, enrichment, OCR, embeddings, or provider call was performed.".to_string(),
            Vec::new(),
        )
    };

    Ok(McpResearchResult {
        tool: "mcp.research.local.v1".to_string(),
        query,
        context: input.context.trim().to_string(),
        status,
        title,
        finding,
        sources,
        deterministic: true,
        adapter,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}
