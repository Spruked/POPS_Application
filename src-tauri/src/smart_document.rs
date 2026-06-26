use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Shared Rust-side contract for POPS append-only Smart Documents.
/// `main.rs` will expose validated Tauri commands that use this module.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartDocumentEventInput {
    #[serde(rename = "documentId")]
    pub document_id: String,
    #[serde(rename = "documentKind")]
    pub document_kind: String,
    pub action: String,
    #[serde(rename = "actorId")]
    pub actor_id: String,
    #[serde(rename = "actorLabel")]
    pub actor_label: String,
    pub effective: bool,
    pub payload: Value,
    #[serde(rename = "parentEventId")]
    pub parent_event_id: Option<String>,
    pub source: String,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartDocumentEvent {
    #[serde(rename = "eventId")]
    pub event_id: String,
    #[serde(rename = "documentId")]
    pub document_id: String,
    #[serde(rename = "documentKind")]
    pub document_kind: String,
    pub sequence: i64,
    pub action: String,
    #[serde(rename = "actorId")]
    pub actor_id: String,
    #[serde(rename = "actorLabel")]
    pub actor_label: String,
    pub effective: bool,
    pub payload: Value,
    #[serde(rename = "payloadHash")]
    pub payload_hash: String,
    #[serde(rename = "previousEventHash")]
    pub previous_event_hash: Option<String>,
    #[serde(rename = "eventHash")]
    pub event_hash: String,
    #[serde(rename = "parentEventId")]
    pub parent_event_id: Option<String>,
    pub source: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SmartDocumentReceipt {
    pub ok: bool,
    #[serde(rename = "documentId")]
    pub document_id: String,
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub action: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "eventHash")]
    pub event_hash: String,
    #[serde(rename = "previousEventHash")]
    pub previous_event_hash: Option<String>,
    pub message: String,
}

pub fn initialize_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "BEGIN;
        CREATE TABLE IF NOT EXISTS smart_documents (
            document_id TEXT PRIMARY KEY,
            document_kind TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            head_event_id TEXT,
            head_event_hash TEXT
        );
        CREATE TABLE IF NOT EXISTS smart_document_events (
            event_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            document_kind TEXT NOT NULL,
            sequence_number INTEGER NOT NULL,
            action TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            actor_label TEXT NOT NULL,
            effective INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            payload_hash TEXT NOT NULL,
            previous_event_hash TEXT,
            event_hash TEXT NOT NULL UNIQUE,
            parent_event_id TEXT,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES smart_documents(document_id),
            UNIQUE(document_id, sequence_number)
        );
        CREATE INDEX IF NOT EXISTS idx_smart_document_events_document_sequence
            ON smart_document_events(document_id, sequence_number);
        CREATE INDEX IF NOT EXISTS idx_smart_document_events_created_at
            ON smart_document_events(created_at);
        COMMIT;",
    )
    .map_err(|error| error.to_string())
}
