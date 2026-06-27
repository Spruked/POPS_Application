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

    Ok(McpResearchResult {
        tool: "mcp.research.placeholder.v1".to_string(),
        query,
        context: input.context.trim().to_string(),
        status: "placeholder".to_string(),
        title: "MCP research placeholder result".to_string(),
        finding: "Deterministic research tool stub executed. No external search, enrichment, OCR, embeddings, or provider call was performed.".to_string(),
        sources: Vec::new(),
        deterministic: true,
        adapter,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}
