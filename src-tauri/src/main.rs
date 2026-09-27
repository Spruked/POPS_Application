#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod local_agent;
#[path = "mcp/research_server.rs"]
mod research_server;

use local_agent::{
    local_agent_chat_with_context, local_agent_ocr, local_agent_speak, local_agent_status,
    LocalAgentChatInput, LocalAgentChatResult,
};
use research_server::mcp_research_tool;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::api::path::app_data_dir;
use tauri::{Manager, State};

// ─── SQLite Database ──────────────────────────────────────────────

struct DbConn(std::sync::Mutex<rusqlite::Connection>);
struct VaultRoot(PathBuf);

fn runtime_vault_system_dir(config: &tauri::Config) -> Result<PathBuf, String> {
    if let Ok(explicit_root) = std::env::var("POPS_VAULT_SYSTEM_DIR") {
        let explicit_path = PathBuf::from(explicit_root);
        if !explicit_path.as_os_str().is_empty() {
            return Ok(explicit_path);
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        for ancestor in current_exe.ancestors() {
            let candidate = ancestor.join("Vault_System");
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(project_root) = manifest_dir.parent() {
        return Ok(project_root.join("Vault_System"));
    }

    let app_dir = app_data_dir(config).ok_or("No app dir")?;
    Ok(app_dir.join("Vault_System"))
}

fn vault_database_dir(vault_root: &Path) -> PathBuf {
    vault_root.join("database")
}

fn vault_database_path(vault_root: &Path) -> PathBuf {
    vault_database_dir(vault_root).join("proof_of_presence.db")
}

fn vault_data_dir(vault_root: &Path, name: &str) -> PathBuf {
    vault_root.join(name)
}

fn ensure_vault_system_layout(vault_root: &Path) -> Result<(), String> {
    for dir in [
        vault_database_dir(vault_root),
        vault_data_dir(vault_root, "evidence_originals"),
        vault_data_dir(vault_root, "communication_exports"),
        vault_data_dir(vault_root, "case_bundles"),
        vault_data_dir(vault_root, "exports"),
        vault_data_dir(vault_root, "runtime_cache"),
        vault_data_dir(vault_root, "derived_state_cache"),
        vault_data_dir(vault_root, "temp_exports"),
        vault_data_dir(vault_root, "dossiers").join("contacts"),
        vault_data_dir(vault_root, "child_support_ledger"),
        vault_data_dir(vault_root, "operational_records"),
        vault_data_dir(vault_root, "browser_records"),
    ] {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn copy_file_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() || destination.exists() {
        return Ok(());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(source, destination).map_err(|e| e.to_string())?;
    Ok(())
}

fn copy_dir_contents_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_contents_if_missing(&source_path, &destination_path)?;
        } else {
            copy_file_if_missing(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

fn migrate_legacy_app_data(config: &tauri::Config, vault_root: &Path) -> Result<(), String> {
    let Some(legacy_dir) = app_data_dir(config) else {
        return Ok(());
    };
    if legacy_dir == vault_root {
        return Ok(());
    }

    for file_name in [
        "proof_of_presence.db",
        "proof_of_presence.db-wal",
        "proof_of_presence.db-shm",
    ] {
        copy_file_if_missing(
            &legacy_dir.join(file_name),
            &vault_database_dir(vault_root).join(file_name),
        )?;
    }

    for dir_name in [
        "evidence_originals",
        "communication_exports",
        "case_bundles",
        "exports",
        "runtime_cache",
        "derived_state_cache",
        "temp_exports",
        "dossiers",
        "child_support_ledger",
        "operational_records",
        "browser_records",
    ] {
        copy_dir_contents_if_missing(
            &legacy_dir.join(dir_name),
            &vault_data_dir(vault_root, dir_name),
        )?;
    }

    Ok(())
}

fn init_db(path: &str) -> rusqlite::Connection {
    let conn = rusqlite::Connection::open(path).expect("open db");
    conn.execute_batch(
        "BEGIN;
        CREATE TABLE IF NOT EXISTS evidence (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL DEFAULT 'primary',
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            date TEXT,
            file_path TEXT,
            sha256 TEXT NOT NULL,
            tags TEXT,
            file_name TEXT,
            file_size INTEGER,
            file_type TEXT,
            trust_glyph_risk TEXT,
            source_description TEXT,
            original_modified_at TEXT,
            imported_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS evidence_chain (
            id TEXT PRIMARY KEY,
            evidence_id TEXT NOT NULL,
            action TEXT NOT NULL,
            hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            previous_ledger_hash TEXT,
            ledger_entry_hash TEXT
        );
        CREATE TABLE IF NOT EXISTS evidence_metadata (
            evidence_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            file_path TEXT NOT NULL,
            exif_json TEXT NOT NULL,
            gps_lat REAL,
            gps_lon REAL,
            device_identity TEXT NOT NULL,
            timestamp_utc TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS communication_records (
            id TEXT PRIMARY KEY,
            evidence_id TEXT NOT NULL,
            timeline_event_id TEXT,
            incident_id TEXT,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            original_hash TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            message_count INTEGER NOT NULL,
            first_timestamp TEXT,
            last_timestamp TEXT,
            participants_json TEXT NOT NULL,
            gaps_json TEXT NOT NULL,
            screenshot_risk TEXT NOT NULL,
            trust_glyph_risk TEXT NOT NULL,
            court_safe_summary TEXT NOT NULL,
            thread_context_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL DEFAULT 'primary',
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            location TEXT,
            description TEXT NOT NULL,
            denied_visit_scheduled_start TEXT,
            denied_visit_scheduled_end TEXT,
            denied_visit_arrival_time TEXT,
            denied_visit_exchange_location TEXT,
            denied_visit_who_denied TEXT,
            denied_visit_child_present TEXT,
            denied_visit_reason_given TEXT,
            denied_visit_attempted_contact TEXT,
            linked_evidence_ids TEXT,
            linked_communication_ids TEXT,
            timeline_event_id TEXT,
            court_safe_summary TEXT NOT NULL,
            trust_glyph_risk TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS court_orders (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL DEFAULT 'primary',
            title TEXT NOT NULL,
            order_date TEXT,
            effective_date TEXT,
            judge_name TEXT,
            court_name TEXT,
            docket_number TEXT,
            terms TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS violations (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL DEFAULT 'primary',
            order_id TEXT NOT NULL,
            date TEXT,
            description TEXT,
            evidence_ids TEXT,
            severity TEXT,
            status TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL DEFAULT 'primary',
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            date TEXT,
            description TEXT,
            related_evidence_ids TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS child_support_payments (
            id TEXT PRIMARY KEY,
            monthly_amount_due TEXT NOT NULL,
            due_date TEXT NOT NULL,
            amount_paid TEXT,
            payment_date TEXT,
            payment_method TEXT,
            state_case_number TEXT,
            confirmation_number TEXT,
            support_category TEXT NOT NULL,
            source_status TEXT NOT NULL,
            official_balance TEXT,
            arrears_balance TEXT,
            receipt_file_name TEXT,
            receipt_file_size INTEGER NOT NULL DEFAULT 0,
            receipt_sha256 TEXT,
            agency_statement_name TEXT,
            agency_statement_sha256 TEXT,
            correction_note TEXT,
            dispute_note TEXT,
            missed_payment_claim TEXT,
            certified_record INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_child_support_due_date ON child_support_payments(due_date);
        CREATE INDEX IF NOT EXISTS idx_child_support_status ON child_support_payments(source_status);
        CREATE TABLE IF NOT EXISTS operational_records (
            id TEXT PRIMARY KEY,
            glyph_trace_id TEXT NOT NULL,
            record_type TEXT NOT NULL,
            case_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            verification_state TEXT NOT NULL,
            source_provenance TEXT NOT NULL,
            date TEXT,
            linked_record_ids_json TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            vault_path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_operational_records_type ON operational_records(record_type, updated_at);
        CREATE INDEX IF NOT EXISTS idx_operational_records_glyph ON operational_records(glyph_trace_id);
        CREATE INDEX IF NOT EXISTS idx_operational_records_case ON operational_records(case_id);
        CREATE TABLE IF NOT EXISTS case_calendar_documents (
            document_id TEXT PRIMARY KEY,
            calendar_category TEXT NOT NULL,
            title TEXT NOT NULL,
            review_status TEXT NOT NULL,
            current_payload_json TEXT NOT NULL,
            legacy_source_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            head_event_id TEXT NOT NULL,
            head_event_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS case_calendar_ledger (
            event_id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            parent_event_hash TEXT,
            event_hash TEXT NOT NULL,
            action_type TEXT NOT NULL,
            actor_identity TEXT NOT NULL,
            timestamp_utc TEXT NOT NULL,
            review_status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            receipt_json TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES case_calendar_documents(document_id)
        );
        CREATE INDEX IF NOT EXISTS idx_case_calendar_date ON case_calendar_documents(updated_at);
        CREATE INDEX IF NOT EXISTS idx_case_calendar_ledger_doc ON case_calendar_ledger(document_id, timestamp_utc);
        CREATE TABLE IF NOT EXISTS case_profile (
            id TEXT PRIMARY KEY,
            case_name TEXT,
            client_name TEXT,
            opposing_party TEXT,
            attorney_name TEXT,
            attorney_phone TEXT,
            attorney_email TEXT,
            court_name TEXT,
            docket_number TEXT,
            case_type TEXT,
            notes TEXT,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS case_matters (
            id TEXT PRIMARY KEY,
            parent_case_id TEXT,
            case_type TEXT NOT NULL,
            title TEXT NOT NULL,
            case_number TEXT NOT NULL,
            court_name TEXT NOT NULL,
            judge_name TEXT NOT NULL,
            status TEXT NOT NULL,
            lifecycle_stage TEXT NOT NULL,
            opened_date TEXT NOT NULL,
            closed_date TEXT NOT NULL,
            next_deadline TEXT NOT NULL,
            next_hearing_date TEXT NOT NULL,
            order_ids_json TEXT NOT NULL,
            evidence_ids_json TEXT NOT NULL,
            event_ids_json TEXT NOT NULL,
            document_ids_json TEXT NOT NULL,
            notes TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS case_alerts (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            details TEXT NOT NULL,
            due_date TEXT NOT NULL,
            resolved INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_case_alerts_case ON case_alerts(case_id, resolved, due_date);
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL DEFAULT 'primary',
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            generated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS players_dossier (
            id TEXT PRIMARY KEY,
            case_ids_json TEXT NOT NULL DEFAULT '[\"primary\"]',
            category TEXT NOT NULL DEFAULT 'other',
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            known_role TEXT NOT NULL,
            organization TEXT NOT NULL,
            phone_numbers TEXT NOT NULL,
            emails TEXT NOT NULL,
            address TEXT NOT NULL,
            relationship_to_case TEXT NOT NULL,
            status TEXT NOT NULL,
            last_contact TEXT NOT NULL,
            follow_up_needed INTEGER NOT NULL,
            conflict_concern INTEGER NOT NULL,
            documents_requested TEXT NOT NULL,
            documents_provided TEXT NOT NULL,
            linked_evidence TEXT NOT NULL,
            linked_incidents TEXT NOT NULL,
            linked_timeline_events TEXT NOT NULL,
            private_field_notes TEXT NOT NULL,
            court_safe_notes TEXT NOT NULL,
            profile_json TEXT NOT NULL DEFAULT '{}',
            interaction_history_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS contact_research_findings (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL,
            research_question TEXT NOT NULL,
            provider_or_source TEXT NOT NULL,
            source_reference TEXT NOT NULL,
            source_title TEXT NOT NULL,
            captured_finding TEXT NOT NULL,
            user_note TEXT NOT NULL,
            status TEXT NOT NULL,
            linked_person_id TEXT,
            linked_evidence_id TEXT,
            linked_event_id TEXT,
            linked_court_order_id TEXT,
            linked_calendar_item_id TEXT,
            linked_timeline_item_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            audit_ledger_id TEXT,
            receipt_hash TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_contact_research_contact ON contact_research_findings(contact_id, updated_at);
        CREATE TABLE IF NOT EXISTS sealed_records (
            id TEXT PRIMARY KEY,
            original_input TEXT NOT NULL,
            system_suggestion TEXT NOT NULL,
            final_verified_statement TEXT NOT NULL,
            category_suggestion TEXT,
            record_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            verified_by TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_ledger (
            id TEXT PRIMARY KEY,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL,
            payload_hash TEXT,
            hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            previous_ledger_hash TEXT,
            ledger_entry_hash TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_created_at ON audit_ledger(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_entry_hash ON audit_ledger(ledger_entry_hash);
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_previous_hash ON audit_ledger(previous_ledger_hash);
        CREATE INDEX IF NOT EXISTS idx_audit_ledger_record_id ON audit_ledger(record_id);
        COMMIT;",
    )
    .expect("init tables");
    let _ = conn.execute("ALTER TABLE evidence ADD COLUMN file_name TEXT", []);
    let _ = conn.execute("ALTER TABLE evidence ADD COLUMN file_size INTEGER", []);
    let _ = conn.execute("ALTER TABLE evidence ADD COLUMN file_type TEXT", []);
    let _ = conn.execute("ALTER TABLE evidence ADD COLUMN trust_glyph_risk TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE evidence ADD COLUMN source_description TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE evidence ADD COLUMN original_modified_at TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE evidence ADD COLUMN imported_at TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE audit_ledger ADD COLUMN previous_ledger_hash TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE players_dossier ADD COLUMN category TEXT NOT NULL DEFAULT 'other'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE players_dossier ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE players_dossier ADD COLUMN case_ids_json TEXT NOT NULL DEFAULT '[\"primary\"]'",
        [],
    );
    for table in [
        "evidence", "incidents", "court_orders", "violations", "events",
        "child_support_payments", "reports", "players_dossier", "contact_research_findings",
        "case_calendar_documents",
    ] {
        let _ = conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN case_id TEXT NOT NULL DEFAULT 'primary'"),
            [],
        );
    }
    let now = chrono::Utc::now().to_rfc3339();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO case_matters (
            id, parent_case_id, case_type, title, case_number, court_name, judge_name, status,
            lifecycle_stage, opened_date, closed_date, next_deadline, next_hearing_date,
            order_ids_json, evidence_ids_json, event_ids_json, document_ids_json, notes,
            created_at, updated_at
        ) VALUES ('primary', NULL, 'primary_custody', 'Primary Custody / Family Case', '', '', '', 'active', 'filing', '', '', '', '', '[]', '[]', '[]', '[]', '', ?1, ?1)",
        [&now],
    );
    let _ = conn.execute(
        "ALTER TABLE audit_ledger ADD COLUMN ledger_entry_hash TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE audit_ledger ADD COLUMN payload_hash TEXT", []);
    let _ = conn.execute(
        "UPDATE audit_ledger SET payload_hash = hash WHERE payload_hash IS NULL",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_ledger_created_at ON audit_ledger(created_at)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_ledger_entry_hash ON audit_ledger(ledger_entry_hash)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_ledger_previous_hash ON audit_ledger(previous_ledger_hash)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_ledger_record_id ON audit_ledger(record_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type)",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_evidence_metadata_document_id ON evidence_metadata(document_id)",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS contact_research_findings (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL,
            research_question TEXT NOT NULL,
            provider_or_source TEXT NOT NULL,
            source_reference TEXT NOT NULL,
            source_title TEXT NOT NULL,
            captured_finding TEXT NOT NULL,
            user_note TEXT NOT NULL,
            status TEXT NOT NULL,
            linked_person_id TEXT,
            linked_evidence_id TEXT,
            linked_event_id TEXT,
            linked_court_order_id TEXT,
            linked_calendar_item_id TEXT,
            linked_timeline_item_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            audit_ledger_id TEXT,
            receipt_hash TEXT
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_contact_research_contact ON contact_research_findings(contact_id, updated_at)",
        [],
    );
    conn
}

// ─── Data Structures ─────────────────────────────────────────────

fn default_case_id() -> String {
    "primary".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
struct EvidenceItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    #[serde(rename = "type")]
    ev_type: String,
    title: String,
    description: String,
    date: String,
    #[serde(rename = "filePath")]
    file_path: Option<String>,
    sha256: String,
    tags: Vec<String>,
    #[serde(rename = "fileName")]
    file_name: Option<String>,
    #[serde(rename = "fileSize")]
    file_size: Option<i64>,
    #[serde(rename = "fileType")]
    file_type: Option<String>,
    #[serde(rename = "trustGlyphRisk")]
    trust_glyph_risk: Option<String>,
    #[serde(rename = "sourceDescription")]
    source_description: Option<String>,
    #[serde(rename = "originalModifiedAt")]
    original_modified_at: Option<String>,
    #[serde(rename = "importedAt")]
    imported_at: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Serialize)]
struct EvidenceChainItem {
    id: String,
    #[serde(rename = "evidenceId")]
    evidence_id: String,
    action: String,
    hash: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "metadataJson")]
    metadata_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct EvidencePayload {
    evidence_id: String,
    document_id: String,
    file_path: String,
    file_hash: String,
    exif_json: String,
    gps_lat: Option<f64>,
    gps_lon: Option<f64>,
    device_identity: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChainOfCustodyPayload {
    evidence_id: String,
    operation: String,
    actor_identity: String,
    notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PdfExportPayload {
    document_id: String,
    title: String,
    include_history: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttorneyPacketPayload {
    case_id: String,
    include_evidence: bool,
    include_timeline: bool,
    include_profile: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct CaseSummaryPayload {
    case_id: String,
    include_evidence: bool,
    include_timeline: bool,
    include_orders: bool,
    include_profile: bool,
}

#[derive(Debug, Serialize)]
struct CaseSummaryResult {
    case_id: String,
    timeline_count: usize,
    evidence_count: usize,
    violation_count: usize,
    last_updated: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CaseMatterItem {
    id: String,
    #[serde(rename = "parentCaseId")]
    parent_case_id: Option<String>,
    #[serde(rename = "caseType")]
    case_type: String,
    title: String,
    #[serde(rename = "caseNumber")]
    case_number: String,
    #[serde(rename = "courtName")]
    court_name: String,
    #[serde(rename = "judgeName")]
    judge_name: String,
    status: String,
    #[serde(rename = "lifecycleStage")]
    lifecycle_stage: String,
    #[serde(rename = "openedDate")]
    opened_date: String,
    #[serde(rename = "closedDate")]
    closed_date: String,
    #[serde(rename = "nextDeadline")]
    next_deadline: String,
    #[serde(rename = "nextHearingDate")]
    next_hearing_date: String,
    #[serde(rename = "orderIds")]
    order_ids: Vec<String>,
    #[serde(rename = "evidenceIds")]
    evidence_ids: Vec<String>,
    #[serde(rename = "eventIds")]
    event_ids: Vec<String>,
    #[serde(rename = "documentIds")]
    document_ids: Vec<String>,
    notes: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CaseAlertItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    #[serde(rename = "alertType")]
    alert_type: String,
    severity: String,
    title: String,
    details: String,
    #[serde(rename = "dueDate")]
    due_date: String,
    resolved: bool,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize)]
struct CaseOverviewDataResult {
    #[serde(rename = "primaryCase")]
    primary_case: CaseMatterItem,
    #[serde(rename = "relatedCases")]
    related_cases: Vec<CaseMatterItem>,
    alerts: Vec<CaseAlertItem>,
    #[serde(rename = "activeOrderCount")]
    active_order_count: usize,
    #[serde(rename = "upcomingDeadlineCount")]
    upcoming_deadline_count: usize,
    #[serde(rename = "crossCaseEvidenceCount")]
    cross_case_evidence_count: usize,
}

#[derive(Debug, Serialize)]
struct FullIntegrityCheckResult {
    success: bool,
    total_events: usize,
    broken_links: usize,
    missing_hashes: usize,
    orphan_documents: usize,
}

#[derive(Debug, Serialize)]
struct DiagnosticsReport {
    db_path: String,
    total_documents: usize,
    total_events: usize,
    total_evidence: usize,
    last_export: Option<String>,
    app_version: String,
}

#[derive(Debug, Serialize)]
struct FullCaseBundleReceipt {
    success: bool,
    bundle_path: String,
    timestamp_utc: String,
}

#[derive(Debug, Serialize)]
struct EvidenceMetadataRecord {
    evidence_id: String,
    document_id: String,
    file_path: String,
    file_hash: String,
    exif_json: String,
    gps_lat: Option<f64>,
    gps_lon: Option<f64>,
    device_identity: String,
    timestamp_utc: String,
}

#[derive(Debug, Serialize)]
struct ExportReceipt {
    success: bool,
    file_path: String,
    timestamp_utc: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct CourtOrderItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    title: String,
    #[serde(rename = "orderDate")]
    order_date: String,
    #[serde(rename = "effectiveDate")]
    effective_date: String,
    #[serde(rename = "judgeName")]
    judge_name: String,
    #[serde(rename = "courtName")]
    court_name: String,
    #[serde(rename = "docketNumber")]
    docket_number: String,
    terms: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ViolationItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    #[serde(rename = "orderId")]
    order_id: String,
    date: String,
    description: String,
    #[serde(rename = "evidenceIds")]
    evidence_ids: Vec<String>,
    severity: String,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct EventItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    #[serde(rename = "type")]
    ev_type: String,
    title: String,
    date: String,
    description: String,
    #[serde(rename = "relatedEvidenceIds")]
    related_evidence_ids: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChildSupportPaymentItem {
    id: String,
    #[serde(rename = "monthlyAmountDue")]
    monthly_amount_due: String,
    #[serde(rename = "dueDate")]
    due_date: String,
    #[serde(rename = "amountPaid")]
    amount_paid: String,
    #[serde(rename = "paymentDate")]
    payment_date: String,
    #[serde(rename = "paymentMethod")]
    payment_method: String,
    #[serde(rename = "stateCaseNumber")]
    state_case_number: String,
    #[serde(rename = "confirmationNumber")]
    confirmation_number: String,
    #[serde(rename = "supportCategory")]
    support_category: String,
    #[serde(rename = "sourceStatus")]
    source_status: String,
    #[serde(rename = "officialBalance")]
    official_balance: String,
    #[serde(rename = "arrearsBalance")]
    arrears_balance: String,
    #[serde(rename = "receiptFileName")]
    receipt_file_name: String,
    #[serde(rename = "receiptFileSize")]
    receipt_file_size: i64,
    #[serde(rename = "receiptSha256")]
    receipt_sha256: String,
    #[serde(rename = "agencyStatementName")]
    agency_statement_name: String,
    #[serde(rename = "agencyStatementSha256")]
    agency_statement_sha256: String,
    #[serde(rename = "correctionNote")]
    correction_note: String,
    #[serde(rename = "disputeNote")]
    dispute_note: String,
    #[serde(rename = "missedPaymentClaim")]
    missed_payment_claim: String,
    #[serde(rename = "certifiedRecord")]
    certified_record: bool,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct OperationalRecordItem {
    id: String,
    #[serde(rename = "glyphTraceId")]
    glyph_trace_id: String,
    #[serde(rename = "recordType")]
    record_type: String,
    #[serde(rename = "caseId")]
    case_id: String,
    title: String,
    status: String,
    #[serde(rename = "verificationState")]
    verification_state: String,
    #[serde(rename = "sourceProvenance")]
    source_provenance: String,
    date: String,
    #[serde(rename = "linkedRecordIds")]
    linked_record_ids: Vec<String>,
    payload: serde_json::Value,
    #[serde(rename = "vaultPath")]
    vault_path: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    archived: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct GlyphTraceSummaryItem {
    #[serde(rename = "recordId")]
    record_id: String,
    #[serde(rename = "glyphTraceId")]
    glyph_trace_id: String,
    #[serde(rename = "recordType")]
    record_type: String,
    #[serde(rename = "caseId")]
    case_id: String,
    title: String,
    status: String,
    #[serde(rename = "verificationState")]
    verification_state: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "vaultPath")]
    vault_path: String,
    #[serde(rename = "linkedRecordIds")]
    linked_record_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CaseCalendarPayload {
    #[serde(rename = "documentId")]
    document_id: Option<String>,
    #[serde(rename = "calendarCategory")]
    calendar_category: String,
    title: String,
    date: String,
    #[serde(rename = "startTime")]
    start_time: String,
    #[serde(rename = "endTime")]
    end_time: String,
    location: String,
    #[serde(rename = "personInvolved")]
    person_involved: String,
    #[serde(rename = "reviewStatus")]
    review_status: String,
    #[serde(rename = "orderReference")]
    order_reference: String,
    #[serde(rename = "attemptedContact")]
    attempted_contact: String,
    #[serde(rename = "sourceReference")]
    source_reference: String,
    #[serde(rename = "narrativeNotes")]
    narrative_notes: String,
    #[serde(rename = "legacySourceId")]
    legacy_source_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CaseCalendarActionInput {
    #[serde(rename = "documentId")]
    document_id: String,
    #[serde(rename = "actionType")]
    action_type: String,
    #[serde(rename = "actorIdentity")]
    actor_identity: Option<String>,
    payload: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct CaseCalendarReceipt {
    success: bool,
    #[serde(rename = "documentId")]
    document_id: String,
    #[serde(rename = "eventId")]
    event_id: String,
    #[serde(rename = "eventHash")]
    event_hash: String,
    #[serde(rename = "auditLedgerId")]
    audit_ledger_id: String,
    #[serde(rename = "timestampUtc")]
    timestamp_utc: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct CaseCalendarEventRecord {
    #[serde(rename = "eventId")]
    event_id: String,
    #[serde(rename = "documentId")]
    document_id: String,
    #[serde(rename = "parentEventHash")]
    parent_event_hash: Option<String>,
    #[serde(rename = "eventHash")]
    event_hash: String,
    #[serde(rename = "actionType")]
    action_type: String,
    #[serde(rename = "actorIdentity")]
    actor_identity: String,
    #[serde(rename = "timestampUtc")]
    timestamp_utc: String,
    #[serde(rename = "reviewStatus")]
    review_status: String,
    payload: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct CaseCalendarRecord {
    #[serde(rename = "documentId")]
    document_id: String,
    #[serde(rename = "calendarCategory")]
    calendar_category: String,
    title: String,
    #[serde(rename = "reviewStatus")]
    review_status: String,
    #[serde(rename = "currentPayload")]
    current_payload: serde_json::Value,
    #[serde(rename = "legacySourceId")]
    legacy_source_id: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    history: Vec<CaseCalendarEventRecord>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CaseProfile {
    id: String,
    #[serde(rename = "caseName")]
    case_name: String,
    #[serde(rename = "clientName")]
    client_name: String,
    #[serde(rename = "opposingParty")]
    opposing_party: String,
    #[serde(rename = "attorneyName")]
    attorney_name: String,
    #[serde(rename = "attorneyPhone")]
    attorney_phone: String,
    #[serde(rename = "attorneyEmail")]
    attorney_email: String,
    #[serde(rename = "courtName")]
    court_name: String,
    #[serde(rename = "docketNumber")]
    docket_number: String,
    #[serde(rename = "caseType")]
    case_type: String,
    notes: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ReportItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    title: String,
    #[serde(rename = "type")]
    report_type: String,
    content: String,
    #[serde(rename = "generatedAt")]
    generated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct PlayerInteractionLog {
    id: String,
    when: String,
    summary: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct PlayerDossierProfile {
    #[serde(rename = "photoDataUrl")]
    photo_data_url: String,
    #[serde(rename = "photoCaption")]
    photo_caption: String,
    aliases: String,
    pronouns: String,
    #[serde(rename = "dateOfBirth")]
    date_of_birth: String,
    #[serde(rename = "preferredContactMethod")]
    preferred_contact_method: String,
    #[serde(rename = "bestContactTime")]
    best_contact_time: String,
    #[serde(rename = "courtRole")]
    court_role: String,
    jurisdiction: String,
    identifiers: String,
    employment: String,
    education: String,
    language: String,
    accessibility: String,
    #[serde(rename = "communicationPlatforms")]
    communication_platforms: String,
    #[serde(rename = "socialHandles")]
    social_handles: String,
    #[serde(rename = "emergencyContact")]
    emergency_contact: String,
    #[serde(rename = "relatedChildren")]
    related_children: String,
    #[serde(rename = "knownAssociates")]
    known_associates: String,
    #[serde(rename = "sourceProvenance")]
    source_provenance: String,
    #[serde(rename = "verificationStatus")]
    verification_status: String,
    #[serde(rename = "riskNotes")]
    risk_notes: String,
    #[serde(rename = "additionalDetails")]
    additional_details: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct PlayerDossierItem {
    id: String,
    #[serde(rename = "caseIds")]
    case_ids: Vec<String>,
    category: String,
    name: String,
    role: String,
    #[serde(rename = "knownRole")]
    known_role: String,
    organization: String,
    #[serde(rename = "phoneNumbers")]
    phone_numbers: String,
    emails: String,
    address: String,
    #[serde(rename = "relationshipToCase")]
    relationship_to_case: String,
    status: String,
    #[serde(rename = "lastContact")]
    last_contact: String,
    #[serde(rename = "followUpNeeded")]
    follow_up_needed: bool,
    #[serde(rename = "conflictConcern")]
    conflict_concern: bool,
    #[serde(rename = "documentsRequested")]
    documents_requested: String,
    #[serde(rename = "documentsProvided")]
    documents_provided: String,
    #[serde(rename = "linkedEvidence")]
    linked_evidence: String,
    #[serde(rename = "linkedIncidents")]
    linked_incidents: String,
    #[serde(rename = "linkedTimelineEvents")]
    linked_timeline_events: String,
    #[serde(rename = "privateFieldNotes")]
    private_field_notes: String,
    #[serde(rename = "courtSafeNotes")]
    court_safe_notes: String,
    profile: PlayerDossierProfile,
    #[serde(rename = "interactionHistory")]
    interaction_history: Vec<PlayerInteractionLog>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ContactResearchFinding {
    id: String,
    #[serde(rename = "contactId")]
    contact_id: String,
    #[serde(rename = "researchQuestion")]
    research_question: String,
    #[serde(rename = "providerOrSource")]
    provider_or_source: String,
    #[serde(rename = "sourceReference")]
    source_reference: String,
    #[serde(rename = "sourceTitle")]
    source_title: String,
    #[serde(rename = "capturedFinding")]
    captured_finding: String,
    #[serde(rename = "userNote")]
    user_note: String,
    status: String,
    #[serde(rename = "linkedPersonId")]
    linked_person_id: String,
    #[serde(rename = "linkedEvidenceId")]
    linked_evidence_id: String,
    #[serde(rename = "linkedEventId")]
    linked_event_id: String,
    #[serde(rename = "linkedCourtOrderId")]
    linked_court_order_id: String,
    #[serde(rename = "linkedCalendarItemId")]
    linked_calendar_item_id: String,
    #[serde(rename = "linkedTimelineItemId")]
    linked_timeline_item_id: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "auditLedgerId")]
    audit_ledger_id: Option<String>,
    #[serde(rename = "receiptHash")]
    receipt_hash: Option<String>,
}

#[derive(Serialize)]
struct ContactResearchReceipt {
    success: bool,
    #[serde(rename = "findingId")]
    finding_id: String,
    #[serde(rename = "auditLedgerId")]
    audit_ledger_id: String,
    #[serde(rename = "receiptHash")]
    receipt_hash: String,
    #[serde(rename = "timestampUtc")]
    timestamp_utc: String,
    message: String,
}

#[derive(Serialize)]
struct SealedRecordPackage<'a> {
    id: &'a str,
    original_input: &'a str,
    system_suggestion: &'a str,
    final_verified_statement: &'a str,
    category_suggestion: &'a str,
    created_at: &'a str,
    verified_by: &'a str,
}

#[derive(Serialize)]
struct SealVerifiedRecordResult {
    id: String,
    #[serde(rename = "recordHash")]
    record_hash: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "auditAction")]
    audit_action: String,
}

#[derive(Serialize)]
struct SealedRecordItem {
    id: String,
    #[serde(rename = "originalInput")]
    original_input: String,
    #[serde(rename = "systemSuggestion")]
    system_suggestion: String,
    #[serde(rename = "finalVerifiedStatement")]
    final_verified_statement: String,
    #[serde(rename = "categorySuggestion")]
    category_suggestion: String,
    #[serde(rename = "recordHash")]
    record_hash: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "verifiedBy")]
    verified_by: String,
}

#[derive(Serialize)]
struct AuditLedgerItem {
    id: String,
    #[serde(rename = "recordId")]
    record_id: String,
    action: String,
    #[serde(rename = "payloadHash")]
    payload_hash: String,
    hash: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "metadataJson")]
    metadata_json: String,
    #[serde(rename = "previousLedgerHash")]
    previous_ledger_hash: Option<String>,
    #[serde(rename = "ledgerEntryHash")]
    ledger_entry_hash: Option<String>,
}

#[derive(Serialize)]
struct LedgerIntegrityStatus {
    status: String,
    #[serde(rename = "checkedRows")]
    checked_rows: usize,
    #[serde(rename = "breachRowId")]
    breach_row_id: Option<String>,
    message: String,
}

#[derive(Serialize)]
struct ImportedEvidenceFile {
    #[serde(rename = "filePath")]
    file_path: String,
    sha256: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "fileSize")]
    file_size: i64,
    #[serde(rename = "fileType")]
    file_type: String,
    #[serde(rename = "originalModifiedAt")]
    original_modified_at: Option<String>,
    #[serde(rename = "importedAt")]
    imported_at: String,
}

#[derive(Serialize)]
struct IntegrityCheckResult {
    status: String,
    #[serde(rename = "expectedHash")]
    expected_hash: String,
    #[serde(rename = "actualHash")]
    actual_hash: Option<String>,
}

#[derive(Serialize)]
struct CommunicationMessage {
    timestamp: Option<String>,
    sender: Option<String>,
    recipient: Option<String>,
    body: String,
}

#[derive(Serialize)]
struct CommunicationImportResult {
    id: String,
    #[serde(rename = "evidenceId")]
    evidence_id: String,
    #[serde(rename = "timelineEventId")]
    timeline_event_id: String,
    #[serde(rename = "originalHash")]
    original_hash: String,
    #[serde(rename = "messageCount")]
    message_count: usize,
    #[serde(rename = "firstTimestamp")]
    first_timestamp: Option<String>,
    #[serde(rename = "lastTimestamp")]
    last_timestamp: Option<String>,
    participants: Vec<String>,
    gaps: Vec<String>,
    #[serde(rename = "screenshotRisk")]
    screenshot_risk: String,
    #[serde(rename = "trustGlyphRisk")]
    trust_glyph_risk: String,
    #[serde(rename = "courtSafeSummary")]
    court_safe_summary: String,
}

#[derive(Deserialize)]
struct IncidentInput {
    #[serde(rename = "caseId", default = "default_case_id")]
    case_id: String,
    #[serde(rename = "type")]
    incident_type: String,
    title: String,
    date: String,
    location: String,
    description: String,
    #[serde(rename = "deniedVisitScheduledStart")]
    denied_visit_scheduled_start: String,
    #[serde(rename = "deniedVisitScheduledEnd")]
    denied_visit_scheduled_end: String,
    #[serde(rename = "deniedVisitArrivalTime")]
    denied_visit_arrival_time: String,
    #[serde(rename = "deniedVisitExchangeLocation")]
    denied_visit_exchange_location: String,
    #[serde(rename = "deniedVisitWhoDenied")]
    denied_visit_who_denied: String,
    #[serde(rename = "deniedVisitChildPresent")]
    denied_visit_child_present: String,
    #[serde(rename = "deniedVisitReasonGiven")]
    denied_visit_reason_given: String,
    #[serde(rename = "deniedVisitAttemptedContact")]
    denied_visit_attempted_contact: String,
    #[serde(rename = "linkedEvidenceIds")]
    linked_evidence_ids: Vec<String>,
    #[serde(rename = "linkedCommunicationIds")]
    linked_communication_ids: Vec<String>,
}

#[derive(Serialize)]
struct IncidentItem {
    id: String,
    #[serde(rename = "caseId")]
    case_id: String,
    #[serde(rename = "type")]
    incident_type: String,
    title: String,
    date: String,
    location: String,
    description: String,
    #[serde(rename = "deniedVisitScheduledStart")]
    denied_visit_scheduled_start: String,
    #[serde(rename = "deniedVisitScheduledEnd")]
    denied_visit_scheduled_end: String,
    #[serde(rename = "deniedVisitArrivalTime")]
    denied_visit_arrival_time: String,
    #[serde(rename = "deniedVisitExchangeLocation")]
    denied_visit_exchange_location: String,
    #[serde(rename = "deniedVisitWhoDenied")]
    denied_visit_who_denied: String,
    #[serde(rename = "deniedVisitChildPresent")]
    denied_visit_child_present: String,
    #[serde(rename = "deniedVisitReasonGiven")]
    denied_visit_reason_given: String,
    #[serde(rename = "deniedVisitAttemptedContact")]
    denied_visit_attempted_contact: String,
    #[serde(rename = "linkedEvidenceIds")]
    linked_evidence_ids: Vec<String>,
    #[serde(rename = "linkedCommunicationIds")]
    linked_communication_ids: Vec<String>,
    #[serde(rename = "timelineEventId")]
    timeline_event_id: String,
    #[serde(rename = "courtSafeSummary")]
    court_safe_summary: String,
    #[serde(rename = "trustGlyphRisk")]
    trust_glyph_risk: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

// ─── Commands ─────────────────────────────────────────────────────

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn sanitize_file_name(file_name: &str) -> String {
    let sanitized: String = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();

    if sanitized.trim_matches('_').is_empty() {
        "evidence_file".to_string()
    } else {
        sanitized
    }
}

fn file_extension(file_name: &str) -> String {
    file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default()
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn normalize_export_text(file_name: &str, bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes).to_string();
    match file_extension(file_name).as_str() {
        "html" | "htm" => strip_html_tags(&text),
        _ => text,
    }
}

fn looks_like_timestamp(value: &str) -> bool {
    let value = value.trim();
    let digit_count = value.chars().filter(|ch| ch.is_ascii_digit()).count();
    digit_count >= 6 && value.contains(':') && (value.contains('/') || value.contains('-'))
}

fn parse_csv_messages(text: &str) -> Vec<CommunicationMessage> {
    let mut lines = text.lines();
    let Some(header) = lines.next() else {
        return Vec::new();
    };
    let headers: Vec<String> = header
        .split(',')
        .map(|part| part.trim().trim_matches('"').to_ascii_lowercase())
        .collect();
    let find_idx = |names: &[&str]| {
        headers.iter().position(|header| {
            names
                .iter()
                .any(|name| header.contains(&name.to_ascii_lowercase()))
        })
    };
    let timestamp_idx = find_idx(&["timestamp", "date", "time"]);
    let sender_idx = find_idx(&["sender", "from", "author"]);
    let recipient_idx = find_idx(&["recipient", "to"]);
    let body_idx = find_idx(&["body", "message", "text", "content"]);

    lines
        .filter_map(|line| {
            let cols: Vec<String> = line
                .split(',')
                .map(|part| part.trim().trim_matches('"').to_string())
                .collect();
            let body = body_idx
                .and_then(|idx| cols.get(idx))
                .cloned()
                .unwrap_or_else(|| cols.last().cloned().unwrap_or_default());
            if body.trim().is_empty() {
                return None;
            }
            Some(CommunicationMessage {
                timestamp: timestamp_idx.and_then(|idx| cols.get(idx).cloned()),
                sender: sender_idx.and_then(|idx| cols.get(idx).cloned()),
                recipient: recipient_idx.and_then(|idx| cols.get(idx).cloned()),
                body,
            })
        })
        .collect()
}

fn parse_text_messages(text: &str) -> Vec<CommunicationMessage> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.len() < 8 {
                return None;
            }

            let (timestamp, rest) = if let Some((left, right)) = line.split_once(" - ") {
                if looks_like_timestamp(left) {
                    (Some(left.trim().to_string()), right.trim())
                } else {
                    (None, line)
                }
            } else {
                (None, line)
            };

            let (sender, body) = if let Some((left, right)) = rest.split_once(':') {
                if left.len() <= 80 && !right.trim().is_empty() {
                    (Some(left.trim().to_string()), right.trim().to_string())
                } else {
                    (None, rest.to_string())
                }
            } else {
                (None, rest.to_string())
            };

            if timestamp.is_none() && sender.is_none() {
                return None;
            }

            Some(CommunicationMessage {
                timestamp,
                sender,
                recipient: None,
                body,
            })
        })
        .collect()
}

fn parse_communication_messages(file_name: &str, bytes: &[u8]) -> Vec<CommunicationMessage> {
    let text = normalize_export_text(file_name, bytes);
    match file_extension(file_name).as_str() {
        "csv" => parse_csv_messages(&text),
        _ => parse_text_messages(&text),
    }
}

fn unique_participants(messages: &[CommunicationMessage]) -> Vec<String> {
    let mut participants = Vec::new();
    for message in messages {
        for value in [&message.sender, &message.recipient].into_iter().flatten() {
            let value = value.trim();
            if !value.is_empty() && !participants.iter().any(|known| known == value) {
                participants.push(value.to_string());
            }
        }
    }
    participants
}

fn communication_gaps(
    extension: &str,
    messages: &[CommunicationMessage],
    participants: &[String],
) -> Vec<String> {
    let mut gaps = Vec::new();
    if messages.is_empty() {
        gaps.push("No readable structured messages were extracted.".to_string());
    }
    if messages.iter().any(|message| message.timestamp.is_none()) {
        gaps.push("One or more messages are missing timestamps.".to_string());
    }
    if messages.iter().any(|message| message.sender.is_none()) {
        gaps.push("One or more messages are missing sender data.".to_string());
    }
    if participants.len() < 2 {
        gaps.push("Participant context may be incomplete.".to_string());
    }
    if matches!(extension, "png" | "jpg" | "jpeg" | "webp" | "gif") {
        gaps.push("Screenshot evidence may omit surrounding thread context.".to_string());
    }
    if extension == "pdf" && messages.len() < 2 {
        gaps.push("PDF export preserved, but readable thread extraction is limited.".to_string());
    }
    gaps
}

fn score_communication_risk(
    extension: &str,
    gaps: &[String],
    message_count: usize,
) -> (String, String) {
    let screenshot_risk = if matches!(extension, "png" | "jpg" | "jpeg" | "webp" | "gif") {
        "high"
    } else if extension == "pdf" {
        "medium"
    } else {
        "low"
    };
    let trust_glyph_risk = if screenshot_risk == "high" || gaps.len() >= 3 || message_count == 0 {
        "high"
    } else if screenshot_risk == "medium" || !gaps.is_empty() {
        "medium"
    } else {
        "low"
    };
    (screenshot_risk.to_string(), trust_glyph_risk.to_string())
}

fn court_safe_communication_summary(
    title: &str,
    messages: &[CommunicationMessage],
    participants: &[String],
    gaps: &[String],
) -> String {
    let first = messages
        .iter()
        .find_map(|message| message.timestamp.clone());
    let last = messages
        .iter()
        .rev()
        .find_map(|message| message.timestamp.clone());
    let participant_text = if participants.is_empty() {
        "participants not fully identified".to_string()
    } else {
        participants.join(", ")
    };
    let range_text = match (first, last) {
        (Some(first), Some(last)) if first != last => format!("from {first} through {last}"),
        (Some(one), _) => format!("on {one}"),
        _ => "with incomplete timestamp data".to_string(),
    };
    let gap_text = if gaps.is_empty() {
        "No obvious context gaps were detected by the importer.".to_string()
    } else {
        format!("Potential context issues: {}.", gaps.join("; "))
    };
    format!(
        "{title}: imported communication thread involving {participant_text}, containing {} readable message(s) {range_text}. {gap_text}",
        messages.len()
    )
}

fn incident_trust_glyph_risk(input: &IncidentInput) -> String {
    if input.linked_evidence_ids.is_empty() && input.linked_communication_ids.is_empty() {
        return "high".to_string();
    }
    if input.incident_type == "denied_visit"
        && (input.denied_visit_arrival_time.trim().is_empty()
            || input.denied_visit_exchange_location.trim().is_empty())
    {
        return "medium".to_string();
    }
    if input.linked_evidence_ids.len() + input.linked_communication_ids.len() >= 2 {
        "low".to_string()
    } else {
        "medium".to_string()
    }
}

fn court_safe_incident_summary(input: &IncidentInput) -> String {
    if input.incident_type == "denied_visit" {
        let mut parts = Vec::new();
        parts.push(format!(
            "A scheduled parenting-time exchange was documented for {} at {}.",
            input.date,
            if input.denied_visit_exchange_location.trim().is_empty() {
                "the expected exchange location"
            } else {
                input.denied_visit_exchange_location.trim()
            }
        ));
        if !input.denied_visit_scheduled_start.trim().is_empty() {
            parts.push(format!(
                "The scheduled start time was {}.",
                input.denied_visit_scheduled_start.trim()
            ));
        }
        if !input.denied_visit_arrival_time.trim().is_empty() {
            parts.push(format!(
                "The reporting parent recorded arrival at {}.",
                input.denied_visit_arrival_time.trim()
            ));
        }
        if !input.denied_visit_who_denied.trim().is_empty() {
            parts.push(format!(
                "The denial/interference was attributed to {}.",
                input.denied_visit_who_denied.trim()
            ));
        }
        if !input.denied_visit_reason_given.trim().is_empty() {
            parts.push(format!(
                "The stated reason was: {}.",
                input.denied_visit_reason_given.trim()
            ));
        }
        if !input.denied_visit_attempted_contact.trim().is_empty() {
            parts.push(format!(
                "Attempted contact/mitigation noted: {}.",
                input.denied_visit_attempted_contact.trim()
            ));
        }
        if !input.description.trim().is_empty() {
            parts.push(format!("Additional context: {}.", input.description.trim()));
        }
        return parts.join(" ");
    }

    format!(
        "{} was recorded on {}{}: {}",
        input.title.trim(),
        input.date.trim(),
        if input.location.trim().is_empty() {
            "".to_string()
        } else {
            format!(" at {}", input.location.trim())
        },
        input.description.trim()
    )
}

fn get_previous_ledger_hash(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ledger_entry_hash
             FROM audit_ledger
             WHERE ledger_entry_hash IS NOT NULL
             ORDER BY created_at DESC, id DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        row.get(0).map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

fn ledger_entry_hash(
    record_id: &str,
    action: &str,
    payload_hash: &str,
    created_at: &str,
    metadata_json: &str,
    previous_ledger_hash: Option<&str>,
) -> String {
    let package = serde_json::json!({
        "record_id": record_id,
        "action": action,
        "payload_hash": payload_hash,
        "created_at": created_at,
        "metadata_json": metadata_json,
        "previous_ledger_hash": previous_ledger_hash,
    });
    sha256_hex(package.to_string().as_bytes())
}

fn insert_evidence_chain(
    conn: &rusqlite::Connection,
    evidence_id: &str,
    action: &str,
    hash: &str,
    metadata_json: String,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO evidence_chain (id, evidence_id, action, hash, created_at, metadata_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            evidence_id,
            action,
            hash,
            chrono::Utc::now().to_rfc3339(),
            metadata_json
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_evidence(db: State<DbConn>, item: EvidenceItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let metadata_json = serde_json::json!({
        "evidence_id": &item.id,
        "action": "EVIDENCE_SAVED",
        "title": &item.title,
        "type": &item.ev_type,
        "file_name": &item.file_name,
        "file_size": &item.file_size,
        "file_type": &item.file_type,
        "trust_glyph_risk": &item.trust_glyph_risk,
        "source_description": &item.source_description,
        "original_modified_at": &item.original_modified_at,
        "imported_at": &item.imported_at,
    })
    .to_string();

    conn.execute(
        "INSERT OR REPLACE INTO evidence (
            id, case_id, type, title, description, date, file_path, sha256, tags,
            file_name, file_size, file_type, trust_glyph_risk,
            source_description, original_modified_at, imported_at, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        rusqlite::params![
            &item.id,
            &item.case_id,
            &item.ev_type,
            &item.title,
            &item.description,
            &item.date,
            &item.file_path,
            &item.sha256,
            item.tags.join(","),
            &item.file_name,
            &item.file_size,
            &item.file_type,
            &item.trust_glyph_risk,
            &item.source_description,
            &item.original_modified_at,
            &item.imported_at,
            &item.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    insert_evidence_chain(
        &conn,
        &item.id,
        "EVIDENCE_SAVED",
        &item.sha256,
        metadata_json,
    )?;
    Ok(())
}

#[tauri::command]
fn get_evidence(db: State<DbConn>) -> Result<Vec<EvidenceItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, case_id, type, title, description, date, file_path, sha256, tags,
            file_name, file_size, file_type, trust_glyph_risk,
            source_description, original_modified_at, imported_at, created_at
         FROM evidence ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let tags_raw: String = row.get(8)?;
            Ok(EvidenceItem {
                id: row.get(0)?,
                case_id: row.get(1)?,
                ev_type: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                date: row.get(5)?,
                file_path: row.get(6)?,
                sha256: row.get(7)?,
                tags: tags_raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                file_name: row.get(9)?,
                file_size: row.get(10)?,
                file_type: row.get(11)?,
                trust_glyph_risk: row.get(12)?,
                source_description: row.get(13)?,
                original_modified_at: row.get(14)?,
                imported_at: row.get(15)?,
                created_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_evidence(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let existing_hash: Option<String> = conn
        .query_row("SELECT sha256 FROM evidence WHERE id = ?1", [&id], |row| {
            row.get(0)
        })
        .ok();
    conn.execute("DELETE FROM evidence WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    let hash = existing_hash.unwrap_or_else(|| "unknown".to_string());
    let metadata_json = serde_json::json!({
        "evidence_id": id,
        "action": "EVIDENCE_DELETED"
    })
    .to_string();
    insert_evidence_chain(&conn, &id, "EVIDENCE_DELETED", &hash, metadata_json)?;
    Ok(())
}

#[tauri::command]
fn get_evidence_chain(
    db: State<DbConn>,
    evidence_id: String,
) -> Result<Vec<EvidenceChainItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, evidence_id, action, hash, created_at, metadata_json
             FROM evidence_chain
             WHERE evidence_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([evidence_id], |row| {
            Ok(EvidenceChainItem {
                id: row.get(0)?,
                evidence_id: row.get(1)?,
                action: row.get(2)?,
                hash: row.get(3)?,
                created_at: row.get(4)?,
                metadata_json: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn submit_evidence(db: State<DbConn>, payload: String) -> Result<String, String> {
    let input: EvidencePayload = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let timestamp_utc = chrono::Utc::now().to_rfc3339();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO evidence_metadata (
            evidence_id, document_id, file_hash, file_path, exif_json,
            gps_lat, gps_lon, device_identity, timestamp_utc
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &input.evidence_id,
            &input.document_id,
            &input.file_hash,
            &input.file_path,
            &input.exif_json,
            &input.gps_lat,
            &input.gps_lon,
            &input.device_identity,
            &timestamp_utc
        ],
    )
    .map_err(|e| e.to_string())?;

    let metadata_json = serde_json::json!({
        "document_id": input.document_id,
        "file_path": input.file_path,
        "device_identity": input.device_identity,
        "timestamp_utc": timestamp_utc,
    })
    .to_string();
    insert_evidence_chain(
        &conn,
        &input.evidence_id,
        "EVIDENCE_METADATA_SUBMITTED",
        &input.file_hash,
        metadata_json,
    )?;

    Ok(serde_json::json!({
        "success": true,
        "evidence_id": input.evidence_id,
        "timestamp_utc": timestamp_utc
    })
    .to_string())
}

#[tauri::command]
fn get_evidence_metadata(db: State<DbConn>, evidence_id: String) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let record = conn
        .query_row(
            "SELECT evidence_id, document_id, file_path, file_hash, exif_json,
                gps_lat, gps_lon, device_identity, timestamp_utc
             FROM evidence_metadata
             WHERE evidence_id = ?1",
            [&evidence_id],
            |row| {
                Ok(EvidenceMetadataRecord {
                    evidence_id: row.get(0)?,
                    document_id: row.get(1)?,
                    file_path: row.get(2)?,
                    file_hash: row.get(3)?,
                    exif_json: row.get(4)?,
                    gps_lat: row.get(5)?,
                    gps_lon: row.get(6)?,
                    device_identity: row.get(7)?,
                    timestamp_utc: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    serde_json::to_string(&record).map_err(|e| e.to_string())
}

#[tauri::command]
fn record_chain_of_custody(db: State<DbConn>, payload: String) -> Result<String, String> {
    let input: ChainOfCustodyPayload = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let metadata_json = serde_json::json!({
        "operation": input.operation,
        "actor_identity": input.actor_identity,
        "notes": input.notes,
    })
    .to_string();
    let chain_hash = sha256_hex(metadata_json.as_bytes());
    insert_evidence_chain(
        &conn,
        &input.evidence_id,
        "CHAIN_OF_CUSTODY_RECORDED",
        &chain_hash,
        metadata_json,
    )?;
    Ok(serde_json::json!({
        "success": true,
        "evidence_id": input.evidence_id
    })
    .to_string())
}

#[tauri::command]
fn export_pdf(payload: String) -> Result<String, String> {
    let input: PdfExportPayload = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    export_receipt(format!("exports/{}.pdf", sanitize_file_name(&input.title)))
}

#[tauri::command]
fn export_timeline(document_id: String) -> Result<String, String> {
    export_receipt(format!(
        "exports/timeline-{}.json",
        sanitize_file_name(&document_id)
    ))
}

#[tauri::command]
fn export_evidence_index() -> Result<String, String> {
    export_receipt("exports/evidence-index.json".to_string())
}

#[tauri::command]
fn export_attorney_packet(case_id: String) -> Result<String, String> {
    let payload = AttorneyPacketPayload {
        case_id,
        include_evidence: true,
        include_timeline: true,
        include_profile: true,
    };
    export_receipt(format!(
        "exports/attorney-packet-{}.json",
        sanitize_file_name(&payload.case_id)
    ))
}

fn export_receipt(file_path: String) -> Result<String, String> {
    serde_json::to_string(&ExportReceipt {
        success: true,
        file_path,
        timestamp_utc: chrono::Utc::now().to_rfc3339(),
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_case_summary(db: State<DbConn>, case_id: String) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let summary = case_summary_from_db(&conn, case_id)?;
    serde_json::to_string(&summary).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_case_overview(db: State<DbConn>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let summary = case_summary_from_db(&conn, "default".to_string())?;
    serde_json::to_string(&vec![summary]).map_err(|e| e.to_string())
}

fn default_primary_case_item() -> CaseMatterItem {
    let now = chrono::Utc::now().to_rfc3339();
    CaseMatterItem {
        id: "primary".to_string(),
        parent_case_id: None,
        case_type: "primary_custody".to_string(),
        title: "Primary Custody / Family Case".to_string(),
        case_number: String::new(),
        court_name: String::new(),
        judge_name: String::new(),
        status: "active".to_string(),
        lifecycle_stage: "filing".to_string(),
        opened_date: String::new(),
        closed_date: String::new(),
        next_deadline: String::new(),
        next_hearing_date: String::new(),
        order_ids: Vec::new(),
        evidence_ids: Vec::new(),
        event_ids: Vec::new(),
        document_ids: Vec::new(),
        notes: String::new(),
        created_at: now.clone(),
        updated_at: now,
    }
}

#[tauri::command]
fn save_case_matter(db: State<DbConn>, item: CaseMatterItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO case_matters (
            id, parent_case_id, case_type, title, case_number, court_name, judge_name, status,
            lifecycle_stage, opened_date, closed_date, next_deadline, next_hearing_date,
            order_ids_json, evidence_ids_json, event_ids_json, document_ids_json, notes,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        rusqlite::params![
            item.id,
            item.parent_case_id,
            item.case_type,
            item.title,
            item.case_number,
            item.court_name,
            item.judge_name,
            item.status,
            item.lifecycle_stage,
            item.opened_date,
            item.closed_date,
            item.next_deadline,
            item.next_hearing_date,
            serde_json::to_string(&item.order_ids).map_err(|e| e.to_string())?,
            serde_json::to_string(&item.evidence_ids).map_err(|e| e.to_string())?,
            serde_json::to_string(&item.event_ids).map_err(|e| e.to_string())?,
            serde_json::to_string(&item.document_ids).map_err(|e| e.to_string())?,
            item.notes,
            item.created_at,
            item.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_case_matter(db: State<DbConn>, id: String) -> Result<(), String> {
    if id == "primary" {
        return Err("The primary case cannot be deleted.".to_string());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM case_matters WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_case_alert(db: State<DbConn>, item: CaseAlertItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO case_alerts (id, case_id, alert_type, severity, title, details, due_date, resolved, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![item.id, item.case_id, item.alert_type, item.severity, item.title, item.details, item.due_date, if item.resolved { 1 } else { 0 }, item.created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn resolve_case_alert(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE case_alerts SET resolved = 1 WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_case_overview_data(db: State<DbConn>) -> Result<CaseOverviewDataResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, parent_case_id, case_type, title, case_number, court_name, judge_name, status,
                lifecycle_stage, opened_date, closed_date, next_deadline, next_hearing_date,
                order_ids_json, evidence_ids_json, event_ids_json, document_ids_json, notes, created_at, updated_at
             FROM case_matters ORDER BY CASE WHEN id = 'primary' THEN 0 ELSE 1 END, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CaseMatterItem {
                id: row.get(0)?, parent_case_id: row.get(1)?, case_type: row.get(2)?, title: row.get(3)?, case_number: row.get(4)?, court_name: row.get(5)?, judge_name: row.get(6)?, status: row.get(7)?, lifecycle_stage: row.get(8)?, opened_date: row.get(9)?, closed_date: row.get(10)?, next_deadline: row.get(11)?, next_hearing_date: row.get(12)?, order_ids: serde_json::from_str(&row.get::<_, String>(13)?).unwrap_or_default(), evidence_ids: serde_json::from_str(&row.get::<_, String>(14)?).unwrap_or_default(), event_ids: serde_json::from_str(&row.get::<_, String>(15)?).unwrap_or_default(), document_ids: serde_json::from_str(&row.get::<_, String>(16)?).unwrap_or_default(), notes: row.get(17)?, created_at: row.get(18)?, updated_at: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let matters = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let primary_case = matters.iter().find(|item| item.id == "primary").cloned().unwrap_or_else(default_primary_case_item);
    let related_cases = matters.into_iter().filter(|item| item.id != "primary").collect();

    let mut alert_stmt = conn
        .prepare("SELECT id, case_id, alert_type, severity, title, details, due_date, resolved, created_at FROM case_alerts WHERE resolved = 0 ORDER BY due_date ASC, created_at DESC")
        .map_err(|e| e.to_string())?;
    let alert_rows = alert_stmt
        .query_map([], |row| Ok(CaseAlertItem { id: row.get(0)?, case_id: row.get(1)?, alert_type: row.get(2)?, severity: row.get(3)?, title: row.get(4)?, details: row.get(5)?, due_date: row.get(6)?, resolved: row.get::<_, i64>(7)? != 0, created_at: row.get(8)? }))
        .map_err(|e| e.to_string())?;
    let alerts = alert_rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let active_order_count = table_count(&conn, "court_orders")?;
    let upcoming_deadline_count = conn.query_row("SELECT COUNT(*) FROM case_matters WHERE next_deadline <> '' OR next_hearing_date <> ''", [], |row| row.get::<_, i64>(0)).map_err(|e| e.to_string())? as usize;
    let cross_case_evidence_count = conn.query_row("SELECT COUNT(*) FROM evidence", [], |row| row.get::<_, i64>(0)).map_err(|e| e.to_string())? as usize;
    Ok(CaseOverviewDataResult { primary_case, related_cases, alerts, active_order_count, upcoming_deadline_count, cross_case_evidence_count })
}

#[tauri::command]
fn rebuild_derived_state(document_id: String) -> Result<String, String> {
    Ok(serde_json::json!({
        "success": true,
        "document_id": document_id,
        "timestamp_utc": chrono::Utc::now().to_rfc3339()
    })
    .to_string())
}

#[tauri::command]
fn run_full_integrity_check(db: State<DbConn>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let total_events = table_count(&conn, "events")?;
    let missing_hashes = conn
        .query_row(
            "SELECT COUNT(*) FROM evidence WHERE sha256 IS NULL OR TRIM(sha256) = ''",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as usize;
    let result = FullIntegrityCheckResult {
        success: missing_hashes == 0,
        total_events,
        broken_links: 0,
        missing_hashes,
        orphan_documents: 0,
    };
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

fn case_summary_from_db(
    conn: &rusqlite::Connection,
    case_id: String,
) -> Result<CaseSummaryResult, String> {
    Ok(CaseSummaryResult {
        case_id,
        timeline_count: table_count(conn, "events")?,
        evidence_count: table_count(conn, "evidence")?,
        violation_count: table_count(conn, "violations")?,
        last_updated: chrono::Utc::now().to_rfc3339(),
    })
}

fn table_count(conn: &rusqlite::Connection, table_name: &str) -> Result<usize, String> {
    let sql = format!("SELECT COUNT(*) FROM {table_name}");
    let count = conn
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    Ok(count as usize)
}

#[tauri::command]
fn get_app_diagnostics(
    _app_handle: tauri::AppHandle,
    db: State<DbConn>,
    vault: State<VaultRoot>,
) -> Result<String, String> {
    let app_dir = vault.0.clone();
    let db_path = vault_database_path(&vault.0);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let last_export = app_dir
        .join("exports")
        .exists()
        .then(|| app_dir.join("exports").to_string_lossy().to_string());
    let report = DiagnosticsReport {
        db_path: db_path.to_string_lossy().to_string(),
        total_documents: table_count(&conn, "sealed_records").unwrap_or(0),
        total_events: table_count(&conn, "events")?,
        total_evidence: table_count(&conn, "evidence")?,
        last_export,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    serde_json::to_string(&report).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_runtime_cache(
    app_handle: tauri::AppHandle,
    vault: State<VaultRoot>,
) -> Result<String, String> {
    let _ = app_handle;
    let app_dir = vault.0.clone();
    for folder in ["runtime_cache", "derived_state_cache", "temp_exports"] {
        let path = app_dir.join(folder);
        if path.exists() {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        }
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({
        "success": true,
        "timestamp_utc": chrono::Utc::now().to_rfc3339()
    })
    .to_string())
}

#[tauri::command]
fn rebuild_all_documents(db: State<DbConn>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let total_events = table_count(&conn, "events")?;
    let total_documents = table_count(&conn, "sealed_records").unwrap_or(0);
    Ok(serde_json::json!({
        "success": true,
        "total_documents": total_documents,
        "total_events": total_events,
        "timestamp_utc": chrono::Utc::now().to_rfc3339()
    })
    .to_string())
}

#[tauri::command]
fn export_full_case_bundle(
    app_handle: tauri::AppHandle,
    db: State<DbConn>,
    vault: State<VaultRoot>,
    case_id: String,
) -> Result<String, String> {
    let _ = app_handle;
    let app_dir = vault.0.clone();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let safe_timestamp = timestamp.replace(':', "-");
    let bundle_dir = app_dir.join("case_bundles").join(format!(
        "{}-{}",
        sanitize_file_name(&case_id),
        safe_timestamp
    ));
    fs::create_dir_all(&bundle_dir).map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let summary = case_summary_from_db(&conn, case_id.clone())?;
    write_json_file(
        &bundle_dir.join("case_summary.json"),
        &serde_json::to_string_pretty(&summary).map_err(|e| e.to_string())?,
    )?;
    write_json_file(
        &bundle_dir.join("evidence_index.json"),
        &export_table_as_json(&conn, "evidence", "created_at DESC")?,
    )?;
    write_json_file(
        &bundle_dir.join("timeline_events.json"),
        &export_table_as_json(&conn, "events", "created_at DESC")?,
    )?;
    write_json_file(
        &bundle_dir.join("manifest.json"),
        &serde_json::to_string_pretty(&serde_json::json!({
            "case_id": case_id,
            "created_at_utc": timestamp,
            "contents": ["case_summary.json", "evidence_index.json", "timeline_events.json"]
        }))
        .map_err(|e| e.to_string())?,
    )?;

    let receipt = FullCaseBundleReceipt {
        success: true,
        bundle_path: bundle_dir.to_string_lossy().to_string(),
        timestamp_utc: timestamp,
    };
    serde_json::to_string(&receipt).map_err(|e| e.to_string())
}

fn export_table_as_json(
    conn: &rusqlite::Connection,
    table_name: &str,
    order_by: &str,
) -> Result<String, String> {
    let sql = format!("SELECT * FROM {table_name} ORDER BY {order_by}");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let rows = stmt
        .query_map([], |row| {
            let mut item = serde_json::Map::new();
            for (index, name) in column_names.iter().enumerate() {
                let value = row
                    .get::<_, Option<String>>(index)?
                    .map(serde_json::Value::String)
                    .unwrap_or(serde_json::Value::Null);
                item.insert(name.clone(), value);
            }
            Ok(serde_json::Value::Object(item))
        })
        .map_err(|e| e.to_string())?;
    let values = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&values).map_err(|e| e.to_string())
}

fn write_json_file(path: &std::path::Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp_path = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    match fs::rename(&temp_path, path) {
        Ok(()) => Ok(()),
        Err(rename_error) if path.exists() => {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            fs::rename(&temp_path, path).map_err(|_| rename_error.to_string())
        }
        Err(error) => Err(error.to_string()),
    }
}

fn write_player_dossier_vault_snapshot(
    vault_root: &Path,
    item: &PlayerDossierItem,
    action: &str,
    actor_source: &str,
    previous_record_hash: Option<&str>,
    payload_hash: &str,
    ledger_entry_hash: &str,
    timestamp_utc: &str,
) -> Result<String, String> {
    let contact_dir = vault_data_dir(vault_root, "dossiers")
        .join("contacts")
        .join(sanitize_file_name(&item.id));
    for dir in [
        contact_dir.join("history"),
        contact_dir.join("documents"),
        contact_dir.join("notes"),
        contact_dir.join("research"),
    ] {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let current_path = contact_dir.join("current.json");
    let snapshot_path = contact_dir.join("history").join(format!(
        "{}-{}-{}.json",
        timestamp_utc.replace(':', "-"),
        action.to_ascii_lowercase(),
        payload_hash.chars().take(12).collect::<String>()
    ));

    let snapshot = serde_json::json!({
        "dossier_uuid": item.id,
        "action": action,
        "timestamp_utc": timestamp_utc,
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": payload_hash,
        "snapshot_path": snapshot_path.to_string_lossy(),
        "audit_chain_entry_hash": ledger_entry_hash,
        "dossier": item,
    });
    let content = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    write_json_file(&current_path, &content)?;
    write_json_file(&snapshot_path, &content)?;

    Ok(snapshot_path.to_string_lossy().to_string())
}

fn write_player_dossier_delete_snapshot(
    vault_root: &Path,
    id: &str,
    actor_source: &str,
    previous_record_hash: Option<&str>,
    payload_hash: &str,
    ledger_entry_hash: &str,
    timestamp_utc: &str,
) -> Result<String, String> {
    let contact_dir = vault_data_dir(vault_root, "dossiers")
        .join("contacts")
        .join(sanitize_file_name(id));
    for dir in [
        contact_dir.join("history"),
        contact_dir.join("documents"),
        contact_dir.join("notes"),
        contact_dir.join("research"),
    ] {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let snapshot_path = contact_dir.join("history").join(format!(
        "{}-player_dossier_deleted-{}.json",
        timestamp_utc.replace(':', "-"),
        payload_hash.chars().take(12).collect::<String>()
    ));
    let snapshot = serde_json::json!({
        "dossier_uuid": id,
        "action": "PLAYER_DOSSIER_DELETED",
        "timestamp_utc": timestamp_utc,
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": payload_hash,
        "snapshot_path": snapshot_path.to_string_lossy(),
        "audit_chain_entry_hash": ledger_entry_hash,
        "tombstone": true,
    });
    let content = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    write_json_file(&contact_dir.join("current.json"), &content)?;
    write_json_file(&snapshot_path, &content)?;
    Ok(snapshot_path.to_string_lossy().to_string())
}

fn write_browser_record_vault_snapshot(
    vault_root: &Path,
    record_type: &str,
    record_id: &str,
    action: &str,
    actor_source: &str,
    payload: &str,
    previous_record_hash: Option<&str>,
    payload_hash: &str,
    ledger_entry_hash: &str,
    timestamp_utc: &str,
) -> Result<String, String> {
    let record_dir = if record_type == "child_support_payment_ledger" {
        vault_data_dir(vault_root, "child_support_ledger").join(sanitize_file_name(record_id))
    } else if let Some(kind) = record_type.strip_prefix("operational_record:") {
        vault_data_dir(vault_root, "operational_records")
            .join(sanitize_file_name(kind))
            .join(sanitize_file_name(record_id))
    } else {
        vault_data_dir(vault_root, "browser_records")
            .join(sanitize_file_name(record_type))
            .join(sanitize_file_name(record_id))
    };
    let history_dir = record_dir.join("history");
    fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;
    let snapshot_path = history_dir.join(format!(
        "{}-{}-{}.json",
        timestamp_utc.replace(':', "-"),
        action.to_ascii_lowercase(),
        payload_hash.chars().take(12).collect::<String>()
    ));
    let snapshot = serde_json::json!({
        "action": action,
        "record_type": record_type,
        "record_id": record_id,
        "timestamp_utc": timestamp_utc,
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": payload_hash,
        "snapshot_path": snapshot_path.to_string_lossy(),
        "audit_chain_entry_hash": ledger_entry_hash,
        "payload": serde_json::from_str::<serde_json::Value>(payload)
            .unwrap_or_else(|_| serde_json::Value::String(payload.to_string())),
    });
    let content = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    if !action.ends_with("_DELETED")
        || record_type == "child_support_payment_ledger"
        || record_type.starts_with("operational_record:")
    {
        write_json_file(&record_dir.join("current.json"), &content)?;
    }
    write_json_file(&snapshot_path, &content)?;
    Ok(record_dir.to_string_lossy().to_string())
}

fn write_contact_research_vault_snapshot(
    vault_root: &Path,
    finding: &ContactResearchFinding,
    action: &str,
    actor_source: &str,
    previous_record_hash: Option<&str>,
    payload_hash: &str,
    ledger_entry_hash: &str,
    timestamp_utc: &str,
) -> Result<String, String> {
    let research_dir = vault_data_dir(vault_root, "dossiers")
        .join("contacts")
        .join(sanitize_file_name(&finding.contact_id))
        .join("research")
        .join(sanitize_file_name(&finding.id));
    let history_dir = research_dir.join("history");
    fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;
    let snapshot_path = history_dir.join(format!(
        "{}-{}-{}.json",
        timestamp_utc.replace(':', "-"),
        action.to_ascii_lowercase(),
        payload_hash.chars().take(12).collect::<String>()
    ));
    let snapshot = serde_json::json!({
        "dossier_uuid": finding.contact_id,
        "research_finding_uuid": finding.id,
        "action": action,
        "timestamp_utc": timestamp_utc,
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": payload_hash,
        "snapshot_path": snapshot_path.to_string_lossy(),
        "audit_chain_entry_hash": ledger_entry_hash,
        "research_finding": finding,
    });
    let content = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    write_json_file(&research_dir.join("current.json"), &content)?;
    write_json_file(&snapshot_path, &content)?;
    Ok(snapshot_path.to_string_lossy().to_string())
}

fn current_record_hash(current_path: &Path) -> Result<Option<String>, String> {
    if !current_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(current_path).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(parsed
        .get("new_record_hash")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string()))
}

#[tauri::command]
fn save_court_order(db: State<DbConn>, item: CourtOrderItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO court_orders (id, case_id, title, order_date, effective_date, judge_name, court_name, docket_number, terms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![item.id, item.case_id, item.title, item.order_date, item.effective_date, item.judge_name, item.court_name, item.docket_number, item.terms, item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_court_orders(db: State<DbConn>) -> Result<Vec<CourtOrderItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, case_id, title, order_date, effective_date, judge_name, court_name, docket_number, terms, created_at FROM court_orders ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CourtOrderItem {
                id: row.get(0)?,
                case_id: row.get(1)?,
                title: row.get(2)?,
                order_date: row.get(3)?,
                effective_date: row.get(4)?,
                judge_name: row.get(5)?,
                court_name: row.get(6)?,
                docket_number: row.get(7)?,
                terms: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_court_order(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM court_orders WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_violation(db: State<DbConn>, item: ViolationItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO violations (id, case_id, order_id, date, description, evidence_ids, severity, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![item.id, item.case_id, item.order_id, item.date, item.description, item.evidence_ids.join(","), item.severity, item.status, item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_violations(db: State<DbConn>) -> Result<Vec<ViolationItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, case_id, order_id, date, description, evidence_ids, severity, status, created_at FROM violations ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let ids_raw: String = row.get(5)?;
            Ok(ViolationItem {
                id: row.get(0)?,
                case_id: row.get(1)?,
                order_id: row.get(2)?,
                date: row.get(3)?,
                description: row.get(4)?,
                evidence_ids: ids_raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                severity: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_violation(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM violations WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_event(db: State<DbConn>, item: EventItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO events (id, case_id, type, title, date, description, related_evidence_ids, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![item.id, item.case_id, item.ev_type, item.title, item.date, item.description, item.related_evidence_ids.join(","), item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_events(db: State<DbConn>) -> Result<Vec<EventItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, case_id, type, title, date, description, related_evidence_ids, created_at FROM events ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let ids_raw: String = row.get(6)?;
            Ok(EventItem {
                id: row.get(0)?,
                case_id: row.get(1)?,
                ev_type: row.get(2)?,
                title: row.get(3)?,
                date: row.get(4)?,
                description: row.get(5)?,
                related_evidence_ids: ids_raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_event(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM events WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_child_support_payment(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    item: ChildSupportPaymentItem,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO child_support_payments (
            id, monthly_amount_due, due_date, amount_paid, payment_date, payment_method,
            state_case_number, confirmation_number, support_category, source_status,
            official_balance, arrears_balance, receipt_file_name, receipt_file_size,
            receipt_sha256, agency_statement_name, agency_statement_sha256,
            correction_note, dispute_note, missed_payment_claim, certified_record,
            created_at, updated_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
            ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
         )",
        rusqlite::params![
            &item.id,
            &item.monthly_amount_due,
            &item.due_date,
            &item.amount_paid,
            &item.payment_date,
            &item.payment_method,
            &item.state_case_number,
            &item.confirmation_number,
            &item.support_category,
            &item.source_status,
            &item.official_balance,
            &item.arrears_balance,
            &item.receipt_file_name,
            item.receipt_file_size,
            &item.receipt_sha256,
            &item.agency_statement_name,
            &item.agency_statement_sha256,
            &item.correction_note,
            &item.dispute_note,
            &item.missed_payment_claim,
            item.certified_record,
            &item.created_at,
            &item.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    audit_browser_record(
        &conn,
        &vault.0,
        "child_support_payment_ledger",
        &item.id,
        &payload,
        "CHILD_SUPPORT_PAYMENT_SAVED",
    )
}

#[tauri::command]
fn get_child_support_payments(db: State<DbConn>) -> Result<Vec<ChildSupportPaymentItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT
            id, monthly_amount_due, due_date, amount_paid, payment_date, payment_method,
            state_case_number, confirmation_number, support_category, source_status,
            official_balance, arrears_balance, receipt_file_name, receipt_file_size,
            receipt_sha256, agency_statement_name, agency_statement_sha256,
            correction_note, dispute_note, missed_payment_claim, certified_record,
            created_at, updated_at
         FROM child_support_payments
         ORDER BY due_date DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ChildSupportPaymentItem {
                id: row.get(0)?,
                monthly_amount_due: row.get(1)?,
                due_date: row.get(2)?,
                amount_paid: row.get(3)?,
                payment_date: row.get(4)?,
                payment_method: row.get(5)?,
                state_case_number: row.get(6)?,
                confirmation_number: row.get(7)?,
                support_category: row.get(8)?,
                source_status: row.get(9)?,
                official_balance: row.get(10)?,
                arrears_balance: row.get(11)?,
                receipt_file_name: row.get(12)?,
                receipt_file_size: row.get(13)?,
                receipt_sha256: row.get(14)?,
                agency_statement_name: row.get(15)?,
                agency_statement_sha256: row.get(16)?,
                correction_note: row.get(17)?,
                dispute_note: row.get(18)?,
                missed_payment_claim: row.get(19)?,
                certified_record: row.get(20)?,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_child_support_payment(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    id: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let existing = conn
        .query_row(
            "SELECT
                id, monthly_amount_due, due_date, amount_paid, payment_date, payment_method,
                state_case_number, confirmation_number, support_category, source_status,
                official_balance, arrears_balance, receipt_file_name, receipt_file_size,
                receipt_sha256, agency_statement_name, agency_statement_sha256,
                correction_note, dispute_note, missed_payment_claim, certified_record,
                created_at, updated_at
             FROM child_support_payments
             WHERE id = ?1",
            [&id],
            |row| {
                Ok(ChildSupportPaymentItem {
                    id: row.get(0)?,
                    monthly_amount_due: row.get(1)?,
                    due_date: row.get(2)?,
                    amount_paid: row.get(3)?,
                    payment_date: row.get(4)?,
                    payment_method: row.get(5)?,
                    state_case_number: row.get(6)?,
                    confirmation_number: row.get(7)?,
                    support_category: row.get(8)?,
                    source_status: row.get(9)?,
                    official_balance: row.get(10)?,
                    arrears_balance: row.get(11)?,
                    receipt_file_name: row.get(12)?,
                    receipt_file_size: row.get(13)?,
                    receipt_sha256: row.get(14)?,
                    agency_statement_name: row.get(15)?,
                    agency_statement_sha256: row.get(16)?,
                    correction_note: row.get(17)?,
                    dispute_note: row.get(18)?,
                    missed_payment_claim: row.get(19)?,
                    certified_record: row.get(20)?,
                    created_at: row.get(21)?,
                    updated_at: row.get(22)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM child_support_payments WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "id": id,
        "deletedAt": chrono::Utc::now().to_rfc3339(),
        "previous": existing,
        "tombstone": true,
    })
    .to_string();
    audit_browser_record(
        &conn,
        &vault.0,
        "child_support_payment_ledger",
        &id,
        &payload,
        "CHILD_SUPPORT_PAYMENT_DELETED",
    )
}

fn operational_vault_path(vault_root: &Path, record_type: &str, id: &str) -> String {
    vault_data_dir(vault_root, "operational_records")
        .join(sanitize_file_name(record_type))
        .join(sanitize_file_name(id))
        .to_string_lossy()
        .to_string()
}

fn row_to_operational_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<OperationalRecordItem> {
    let linked_raw: String = row.get(9)?;
    let payload_raw: String = row.get(10)?;
    Ok(OperationalRecordItem {
        id: row.get(0)?,
        glyph_trace_id: row.get(1)?,
        record_type: row.get(2)?,
        case_id: row.get(3)?,
        title: row.get(4)?,
        status: row.get(5)?,
        verification_state: row.get(6)?,
        source_provenance: row.get(7)?,
        date: row.get(8)?,
        linked_record_ids: serde_json::from_str(&linked_raw).unwrap_or_default(),
        payload: serde_json::from_str(&payload_raw).unwrap_or_else(|_| serde_json::json!({})),
        vault_path: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        archived: row.get::<_, bool>(14)?,
    })
}

#[tauri::command]
fn save_operational_record(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    mut item: OperationalRecordItem,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    if item.glyph_trace_id.trim().is_empty() {
        item.glyph_trace_id = format!("glyph:{}:{}", item.record_type, item.id);
    }
    if item.case_id.trim().is_empty() {
        item.case_id = "default".to_string();
    }
    if item.verification_state.trim().is_empty() {
        item.verification_state = "Needs Document".to_string();
    }
    if item.status.trim().is_empty() {
        item.status = "Open".to_string();
    }
    if item.source_provenance.trim().is_empty() {
        item.source_provenance = "User entered".to_string();
    }
    item.vault_path = operational_vault_path(&vault.0, &item.record_type, &item.id);
    let now = chrono::Utc::now().to_rfc3339();
    if item.created_at.trim().is_empty() {
        item.created_at = now.clone();
    }
    item.updated_at = now;
    let linked_json = serde_json::to_string(&item.linked_record_ids).map_err(|e| e.to_string())?;
    let payload_json = serde_json::to_string(&item.payload).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO operational_records (
            id, glyph_trace_id, record_type, case_id, title, status, verification_state,
            source_provenance, date, linked_record_ids_json, payload_json, vault_path,
            created_at, updated_at, archived
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        rusqlite::params![
            &item.id,
            &item.glyph_trace_id,
            &item.record_type,
            &item.case_id,
            &item.title,
            &item.status,
            &item.verification_state,
            &item.source_provenance,
            &item.date,
            &linked_json,
            &payload_json,
            &item.vault_path,
            &item.created_at,
            &item.updated_at,
            item.archived,
        ],
    )
    .map_err(|e| e.to_string())?;

    let audit_payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    audit_browser_record(
        &conn,
        &vault.0,
        &format!("operational_record:{}", item.record_type),
        &item.id,
        &audit_payload,
        "OPERATIONAL_RECORD_SAVED",
    )
}

#[tauri::command]
fn get_operational_records(
    db: State<DbConn>,
    record_type: Option<String>,
) -> Result<Vec<OperationalRecordItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let base = "SELECT id, glyph_trace_id, record_type, case_id, title, status, verification_state,
            source_provenance, date, linked_record_ids_json, payload_json, vault_path,
            created_at, updated_at, archived
         FROM operational_records";
    let sql = if record_type
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        format!("{base} WHERE record_type = ?1 ORDER BY updated_at DESC")
    } else {
        format!("{base} ORDER BY updated_at DESC")
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if let Some(kind) = record_type.filter(|value| !value.trim().is_empty()) {
        stmt.query_map([kind], row_to_operational_record)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
    } else {
        stmt.query_map([], row_to_operational_record)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
    };
    rows.map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_operational_record(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    id: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let existing = conn
        .query_row(
            "SELECT id, glyph_trace_id, record_type, case_id, title, status, verification_state,
                source_provenance, date, linked_record_ids_json, payload_json, vault_path,
                created_at, updated_at, archived
             FROM operational_records
             WHERE id = ?1",
            [&id],
            row_to_operational_record,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let record_type = existing
        .as_ref()
        .map(|item| item.record_type.clone())
        .unwrap_or_else(|| "unknown".to_string());
    conn.execute("DELETE FROM operational_records WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "id": id,
        "deletedAt": chrono::Utc::now().to_rfc3339(),
        "previous": existing,
        "tombstone": true,
    })
    .to_string();
    audit_browser_record(
        &conn,
        &vault.0,
        &format!("operational_record:{record_type}"),
        &id,
        &payload,
        "OPERATIONAL_RECORD_DELETED",
    )
}

#[tauri::command]
fn get_glyph_trace_records(
    db: State<DbConn>,
    vault: State<VaultRoot>,
) -> Result<Vec<GlyphTraceSummaryItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut records = Vec::new();

    let mut op_stmt = conn
        .prepare(
            "SELECT id, glyph_trace_id, record_type, case_id, title, status, verification_state,
                source_provenance, date, linked_record_ids_json, payload_json, vault_path,
                created_at, updated_at, archived
             FROM operational_records
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let op_rows = op_stmt
        .query_map([], row_to_operational_record)
        .map_err(|e| e.to_string())?;
    for item in op_rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    {
        records.push(GlyphTraceSummaryItem {
            record_id: item.id,
            glyph_trace_id: item.glyph_trace_id,
            record_type: item.record_type,
            case_id: item.case_id,
            title: item.title,
            status: item.status,
            verification_state: item.verification_state,
            updated_at: item.updated_at,
            vault_path: item.vault_path,
            linked_record_ids: item.linked_record_ids,
        });
    }

    let mut evidence_stmt = conn
        .prepare("SELECT id, title, created_at FROM evidence ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let evidence_rows = evidence_stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            Ok(GlyphTraceSummaryItem {
                record_id: id.clone(),
                glyph_trace_id: format!("glyph:evidence:{id}"),
                record_type: "evidence".to_string(),
                case_id: "default".to_string(),
                title: row.get(1)?,
                status: "Vault Protected".to_string(),
                verification_state: "Vault Protected".to_string(),
                updated_at: row.get(2)?,
                vault_path: vault_data_dir(&vault.0, "evidence_originals")
                    .join(sanitize_file_name(&id))
                    .to_string_lossy()
                    .to_string(),
                linked_record_ids: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;
    records.extend(
        evidence_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?,
    );

    records.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(records)
}

#[tauri::command]
fn create_incident(db: State<DbConn>, input: IncidentInput) -> Result<IncidentItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let timeline_event_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let summary = court_safe_incident_summary(&input);
    let risk = incident_trust_glyph_risk(&input);
    let linked_evidence_ids = input.linked_evidence_ids.join(",");
    let linked_communication_ids = input.linked_communication_ids.join(",");

    conn.execute(
        "INSERT INTO incidents (
            id, case_id, type, title, date, location, description,
            denied_visit_scheduled_start, denied_visit_scheduled_end,
            denied_visit_arrival_time, denied_visit_exchange_location,
            denied_visit_who_denied, denied_visit_child_present,
            denied_visit_reason_given, denied_visit_attempted_contact,
            linked_evidence_ids, linked_communication_ids, timeline_event_id,
            court_safe_summary, trust_glyph_risk, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        rusqlite::params![
            &id,
            &input.case_id,
            &input.incident_type,
            &input.title,
            &input.date,
            &input.location,
            &input.description,
            &input.denied_visit_scheduled_start,
            &input.denied_visit_scheduled_end,
            &input.denied_visit_arrival_time,
            &input.denied_visit_exchange_location,
            &input.denied_visit_who_denied,
            &input.denied_visit_child_present,
            &input.denied_visit_reason_given,
            &input.denied_visit_attempted_contact,
            &linked_evidence_ids,
            &linked_communication_ids,
            &timeline_event_id,
            &summary,
            &risk,
            &created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO events (id, case_id, type, title, date, description, related_evidence_ids, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            &timeline_event_id,
            &input.case_id,
            if input.incident_type == "denied_visit" {
                "visit"
            } else {
                "other"
            },
            &input.title,
            &input.date,
            &summary,
            &linked_evidence_ids,
            &created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(IncidentItem {
        id,
        case_id: input.case_id,
        incident_type: input.incident_type,
        title: input.title,
        date: input.date,
        location: input.location,
        description: input.description,
        denied_visit_scheduled_start: input.denied_visit_scheduled_start,
        denied_visit_scheduled_end: input.denied_visit_scheduled_end,
        denied_visit_arrival_time: input.denied_visit_arrival_time,
        denied_visit_exchange_location: input.denied_visit_exchange_location,
        denied_visit_who_denied: input.denied_visit_who_denied,
        denied_visit_child_present: input.denied_visit_child_present,
        denied_visit_reason_given: input.denied_visit_reason_given,
        denied_visit_attempted_contact: input.denied_visit_attempted_contact,
        linked_evidence_ids: linked_evidence_ids
            .split(',')
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .collect(),
        linked_communication_ids: linked_communication_ids
            .split(',')
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .collect(),
        timeline_event_id,
        court_safe_summary: summary,
        trust_glyph_risk: risk,
        created_at,
    })
}

#[tauri::command]
fn get_incidents(db: State<DbConn>) -> Result<Vec<IncidentItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, case_id, type, title, date, location, description,
                denied_visit_scheduled_start, denied_visit_scheduled_end,
                denied_visit_arrival_time, denied_visit_exchange_location,
                denied_visit_who_denied, denied_visit_child_present,
                denied_visit_reason_given, denied_visit_attempted_contact,
                linked_evidence_ids, linked_communication_ids, timeline_event_id,
                court_safe_summary, trust_glyph_risk, created_at
             FROM incidents
             ORDER BY date DESC, created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let evidence_raw: String = row.get(15)?;
            let communication_raw: String = row.get(16)?;
            Ok(IncidentItem {
                id: row.get(0)?,
                case_id: row.get(1)?,
                incident_type: row.get(2)?,
                title: row.get(3)?,
                date: row.get(4)?,
                location: row.get(5)?,
                description: row.get(6)?,
                denied_visit_scheduled_start: row.get(7)?,
                denied_visit_scheduled_end: row.get(8)?,
                denied_visit_arrival_time: row.get(9)?,
                denied_visit_exchange_location: row.get(10)?,
                denied_visit_who_denied: row.get(11)?,
                denied_visit_child_present: row.get(12)?,
                denied_visit_reason_given: row.get(13)?,
                denied_visit_attempted_contact: row.get(14)?,
                linked_evidence_ids: evidence_raw
                    .split(',')
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string())
                    .collect(),
                linked_communication_ids: communication_raw
                    .split(',')
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string())
                    .collect(),
                timeline_event_id: row.get(17)?,
                court_safe_summary: row.get(18)?,
                trust_glyph_risk: row.get(19)?,
                created_at: row.get(20)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_incident(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM incidents WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn save_player_dossier_record(
    conn: &rusqlite::Connection,
    vault_root: &Path,
    item: PlayerDossierItem,
) -> Result<(), String> {
    let interaction_history_json =
        serde_json::to_string(&item.interaction_history).map_err(|e| e.to_string())?;
    let profile_json = serde_json::to_string(&item.profile).map_err(|e| e.to_string())?;
    let timestamp_utc = chrono::Utc::now().to_rfc3339();
    let payload_json = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    let payload_hash = sha256_hex(payload_json.as_bytes());
    let audit_ledger_id = uuid::Uuid::new_v4().to_string();
    let previous_ledger_hash = get_previous_ledger_hash(&conn)?;
    let contact_dir = vault_data_dir(vault_root, "dossiers")
        .join("contacts")
        .join(sanitize_file_name(&item.id));
    let previous_record_hash = current_record_hash(&contact_dir.join("current.json"))?;
    let snapshot_path = contact_dir
        .join("history")
        .join(format!(
            "{}-player_dossier_saved-{}.json",
            timestamp_utc.replace(':', "-"),
            payload_hash.chars().take(12).collect::<String>()
        ))
        .to_string_lossy()
        .to_string();
    let actor_source = "local_operator";
    let metadata_json = serde_json::json!({
        "record_id": &item.id,
        "action": "PLAYER_DOSSIER_SAVED",
        "record_type": "player_dossier",
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": &payload_hash,
        "snapshot_path": snapshot_path,
    })
    .to_string();
    let ledger_hash = ledger_entry_hash(
        &item.id,
        "PLAYER_DOSSIER_SAVED",
        &payload_hash,
        &timestamp_utc,
        &metadata_json,
        previous_ledger_hash.as_deref(),
    );
    write_player_dossier_vault_snapshot(
        vault_root,
        &item,
        "PLAYER_DOSSIER_SAVED",
        actor_source,
        previous_record_hash.as_deref(),
        &payload_hash,
        &ledger_hash,
        &timestamp_utc,
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO players_dossier (
            id, category, name, role, known_role, organization, phone_numbers, emails, address,
            relationship_to_case, status, last_contact, follow_up_needed, conflict_concern,
            documents_requested, documents_provided, linked_evidence, linked_incidents,
            linked_timeline_events, private_field_notes, court_safe_notes,
            profile_json, interaction_history_json, case_ids_json, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
            ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, ?18,
            ?19, ?20, ?21, ?22,
            ?23, ?24, ?25, ?26
        )",
        rusqlite::params![
            &item.id,
            &item.category,
            &item.name,
            &item.role,
            &item.known_role,
            &item.organization,
            &item.phone_numbers,
            &item.emails,
            &item.address,
            &item.relationship_to_case,
            &item.status,
            &item.last_contact,
            if item.follow_up_needed { 1 } else { 0 },
            if item.conflict_concern { 1 } else { 0 },
            &item.documents_requested,
            &item.documents_provided,
            &item.linked_evidence,
            &item.linked_incidents,
            &item.linked_timeline_events,
            &item.private_field_notes,
            &item.court_safe_notes,
            profile_json,
            interaction_history_json,
            serde_json::to_string(&item.case_ids).map_err(|e| e.to_string())?,
            &item.created_at,
            &item.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO audit_ledger (
            id, record_id, action, payload_hash, hash, created_at, metadata_json,
            previous_ledger_hash, ledger_entry_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &audit_ledger_id,
            &item.id,
            "PLAYER_DOSSIER_SAVED",
            &payload_hash,
            &payload_hash,
            &timestamp_utc,
            &metadata_json,
            &previous_ledger_hash,
            &ledger_hash,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_player_dossier(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    item: PlayerDossierItem,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    save_player_dossier_record(&conn, &vault.0, item)
}

#[tauri::command]
fn get_players_dossier(db: State<DbConn>) -> Result<Vec<PlayerDossierItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT
                id, category, name, role, known_role, organization, phone_numbers, emails, address,
                relationship_to_case, status, last_contact, follow_up_needed, conflict_concern,
                documents_requested, documents_provided, linked_evidence, linked_incidents,
                linked_timeline_events, private_field_notes, court_safe_notes,
                profile_json, interaction_history_json, case_ids_json, created_at, updated_at
             FROM players_dossier
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let profile_json: String = row.get(21)?;
            let profile: PlayerDossierProfile = serde_json::from_str(&profile_json).unwrap_or_default();
            let interaction_history_json: String = row.get(22)?;
            let interaction_history: Vec<PlayerInteractionLog> =
                serde_json::from_str(&interaction_history_json).unwrap_or_default();
            let case_ids_json: String = row.get(23)?;
            let case_ids: Vec<String> = serde_json::from_str(&case_ids_json)
                .unwrap_or_else(|_| vec!["primary".to_string()]);

            Ok(PlayerDossierItem {
                id: row.get(0)?,
                case_ids,
                category: row.get(1)?,
                name: row.get(2)?,
                role: row.get(3)?,
                known_role: row.get(4)?,
                organization: row.get(5)?,
                phone_numbers: row.get(6)?,
                emails: row.get(7)?,
                address: row.get(8)?,
                relationship_to_case: row.get(9)?,
                status: row.get(10)?,
                last_contact: row.get(11)?,
                follow_up_needed: row.get::<_, i64>(12)? != 0,
                conflict_concern: row.get::<_, i64>(13)? != 0,
                documents_requested: row.get(14)?,
                documents_provided: row.get(15)?,
                linked_evidence: row.get(16)?,
                linked_incidents: row.get(17)?,
                linked_timeline_events: row.get(18)?,
                private_field_notes: row.get(19)?,
                court_safe_notes: row.get(20)?,
                profile,
                interaction_history,
                created_at: row.get(24)?,
                updated_at: row.get(25)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn delete_player_dossier_record(
    conn: &rusqlite::Connection,
    vault_root: &Path,
    id: String,
) -> Result<(), String> {
    let timestamp_utc = chrono::Utc::now().to_rfc3339();
    let payload_json = serde_json::json!({
        "id": &id,
        "action": "PLAYER_DOSSIER_DELETED",
        "timestamp_utc": &timestamp_utc,
    })
    .to_string();
    let payload_hash = sha256_hex(payload_json.as_bytes());
    let audit_ledger_id = uuid::Uuid::new_v4().to_string();
    let previous_ledger_hash = get_previous_ledger_hash(&conn)?;
    let contact_dir = vault_data_dir(vault_root, "dossiers")
        .join("contacts")
        .join(sanitize_file_name(&id));
    let previous_record_hash = current_record_hash(&contact_dir.join("current.json"))?;
    let snapshot_path = contact_dir
        .join("history")
        .join(format!(
            "{}-player_dossier_deleted-{}.json",
            timestamp_utc.replace(':', "-"),
            payload_hash.chars().take(12).collect::<String>()
        ))
        .to_string_lossy()
        .to_string();
    let actor_source = "local_operator";
    let metadata_json = serde_json::json!({
        "record_id": &id,
        "action": "PLAYER_DOSSIER_DELETED",
        "record_type": "player_dossier",
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": &payload_hash,
        "snapshot_path": snapshot_path,
    })
    .to_string();
    let ledger_hash = ledger_entry_hash(
        &id,
        "PLAYER_DOSSIER_DELETED",
        &payload_hash,
        &timestamp_utc,
        &metadata_json,
        previous_ledger_hash.as_deref(),
    );
    write_player_dossier_delete_snapshot(
        vault_root,
        &id,
        actor_source,
        previous_record_hash.as_deref(),
        &payload_hash,
        &ledger_hash,
        &timestamp_utc,
    )?;

    conn.execute("DELETE FROM players_dossier WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO audit_ledger (
            id, record_id, action, payload_hash, hash, created_at, metadata_json,
            previous_ledger_hash, ledger_entry_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &audit_ledger_id,
            &id,
            "PLAYER_DOSSIER_DELETED",
            &payload_hash,
            &payload_hash,
            &timestamp_utc,
            &metadata_json,
            &previous_ledger_hash,
            &ledger_hash,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_player_dossier(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    delete_player_dossier_record(&conn, &vault.0, id)
}

fn audit_browser_record(
    conn: &rusqlite::Connection,
    vault_root: &Path,
    record_type: &str,
    record_id: &str,
    payload: &str,
    action: &str,
) -> Result<String, String> {
    let timestamp_utc = chrono::Utc::now().to_rfc3339();
    let payload_hash = sha256_hex(payload.as_bytes());
    let audit_ledger_id = uuid::Uuid::new_v4().to_string();
    let previous_ledger_hash = get_previous_ledger_hash(conn)?;
    let record_dir_path = vault_data_dir(vault_root, "browser_records")
        .join(sanitize_file_name(record_type))
        .join(sanitize_file_name(record_id));
    let previous_record_hash = current_record_hash(&record_dir_path.join("current.json"))?;
    let snapshot_path = record_dir_path
        .join("history")
        .join(format!(
            "{}-{}-{}.json",
            timestamp_utc.replace(':', "-"),
            action.to_ascii_lowercase(),
            payload_hash.chars().take(12).collect::<String>()
        ))
        .to_string_lossy()
        .to_string();
    let actor_source = "browser_ui";
    let metadata_json = serde_json::json!({
        "record_id": record_id,
        "action": action,
        "record_type": record_type,
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": &payload_hash,
        "snapshot_path": snapshot_path,
    })
    .to_string();
    let ledger_hash = ledger_entry_hash(
        record_id,
        action,
        &payload_hash,
        &timestamp_utc,
        &metadata_json,
        previous_ledger_hash.as_deref(),
    );
    let snapshot_dir = write_browser_record_vault_snapshot(
        vault_root,
        record_type,
        record_id,
        action,
        actor_source,
        payload,
        previous_record_hash.as_deref(),
        &payload_hash,
        &ledger_hash,
        &timestamp_utc,
    )?;

    conn.execute(
        "INSERT INTO audit_ledger (
            id, record_id, action, payload_hash, hash, created_at, metadata_json,
            previous_ledger_hash, ledger_entry_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &audit_ledger_id,
            record_id,
            action,
            &payload_hash,
            &payload_hash,
            &timestamp_utc,
            &metadata_json,
            &previous_ledger_hash,
            &ledger_hash,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "record_type": record_type,
        "record_id": record_id,
        "action": action,
        "payload_hash": payload_hash,
        "ledger_entry_hash": ledger_hash,
        "record_dir": snapshot_dir,
        "timestamp_utc": timestamp_utc,
    })
    .to_string())
}

#[tauri::command]
fn save_vault_record(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    record_type: String,
    record_id: String,
    payload: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    audit_browser_record(
        &conn,
        &vault.0,
        &record_type,
        &record_id,
        &payload,
        "BROWSER_RECORD_SAVED",
    )
}

#[tauri::command]
fn delete_vault_record(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    record_type: String,
    record_id: String,
    payload: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    audit_browser_record(
        &conn,
        &vault.0,
        &record_type,
        &record_id,
        &payload,
        "BROWSER_RECORD_DELETED",
    )
}

#[tauri::command]
fn save_contact_research_finding(
    db: State<DbConn>,
    vault: State<VaultRoot>,
    mut finding: ContactResearchFinding,
) -> Result<ContactResearchReceipt, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let timestamp_utc = chrono::Utc::now().to_rfc3339();
    if finding.created_at.trim().is_empty() {
        finding.created_at = timestamp_utc.clone();
    }
    finding.updated_at = timestamp_utc.clone();

    let payload_json = serde_json::to_string(&finding).map_err(|e| e.to_string())?;
    let receipt_hash = sha256_hex(payload_json.as_bytes());
    let audit_ledger_id = uuid::Uuid::new_v4().to_string();
    let previous_ledger_hash = get_previous_ledger_hash(&conn)?;
    let research_dir = vault_data_dir(&vault.0, "dossiers")
        .join("contacts")
        .join(sanitize_file_name(&finding.contact_id))
        .join("research")
        .join(sanitize_file_name(&finding.id));
    let previous_record_hash = current_record_hash(&research_dir.join("current.json"))?;
    let snapshot_path = research_dir
        .join("history")
        .join(format!(
            "{}-contact_research_finding_saved-{}.json",
            timestamp_utc.replace(':', "-"),
            receipt_hash.chars().take(12).collect::<String>()
        ))
        .to_string_lossy()
        .to_string();
    let actor_source = "local_operator";
    let metadata_json = serde_json::json!({
        "record_id": &finding.id,
        "dossier_uuid": &finding.contact_id,
        "action": "CONTACT_RESEARCH_FINDING_SAVED",
        "record_type": "contact_research_finding",
        "actor_source": actor_source,
        "previous_record_hash": previous_record_hash,
        "new_record_hash": &receipt_hash,
        "snapshot_path": snapshot_path,
    })
    .to_string();
    let ledger_hash = ledger_entry_hash(
        &finding.id,
        "CONTACT_RESEARCH_FINDING_SAVED",
        &receipt_hash,
        &timestamp_utc,
        &metadata_json,
        previous_ledger_hash.as_deref(),
    );

    finding.audit_ledger_id = Some(audit_ledger_id.clone());
    finding.receipt_hash = Some(receipt_hash.clone());
    write_contact_research_vault_snapshot(
        &vault.0,
        &finding,
        "CONTACT_RESEARCH_FINDING_SAVED",
        actor_source,
        previous_record_hash.as_deref(),
        &receipt_hash,
        &ledger_hash,
        &timestamp_utc,
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO contact_research_findings (
            id, contact_id, research_question, provider_or_source, source_reference,
            source_title, captured_finding, user_note, status, linked_person_id,
            linked_evidence_id, linked_event_id, linked_court_order_id,
            linked_calendar_item_id, linked_timeline_item_id, created_at, updated_at,
            audit_ledger_id, receipt_hash
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5,
            ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13,
            ?14, ?15, ?16, ?17,
            ?18, ?19
        )",
        rusqlite::params![
            &finding.id,
            &finding.contact_id,
            &finding.research_question,
            &finding.provider_or_source,
            &finding.source_reference,
            &finding.source_title,
            &finding.captured_finding,
            &finding.user_note,
            &finding.status,
            &finding.linked_person_id,
            &finding.linked_evidence_id,
            &finding.linked_event_id,
            &finding.linked_court_order_id,
            &finding.linked_calendar_item_id,
            &finding.linked_timeline_item_id,
            &finding.created_at,
            &finding.updated_at,
            &audit_ledger_id,
            &receipt_hash,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO audit_ledger (
            id, record_id, action, payload_hash, hash, created_at, metadata_json,
            previous_ledger_hash, ledger_entry_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &audit_ledger_id,
            &finding.id,
            "CONTACT_RESEARCH_FINDING_SAVED",
            &receipt_hash,
            &receipt_hash,
            &timestamp_utc,
            &metadata_json,
            &previous_ledger_hash,
            &ledger_hash,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(ContactResearchReceipt {
        success: true,
        finding_id: finding.id,
        audit_ledger_id,
        receipt_hash,
        timestamp_utc,
        message: "Research finding saved.".to_string(),
    })
}

#[tauri::command]
fn get_contact_research_findings(
    db: State<DbConn>,
    contact_id: String,
) -> Result<Vec<ContactResearchFinding>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT
                id, contact_id, research_question, provider_or_source, source_reference,
                source_title, captured_finding, user_note, status, linked_person_id,
                linked_evidence_id, linked_event_id, linked_court_order_id,
                linked_calendar_item_id, linked_timeline_item_id, created_at, updated_at,
                audit_ledger_id, receipt_hash
             FROM contact_research_findings
             WHERE contact_id = ?1
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([contact_id], |row| {
            Ok(ContactResearchFinding {
                id: row.get(0)?,
                contact_id: row.get(1)?,
                research_question: row.get(2)?,
                provider_or_source: row.get(3)?,
                source_reference: row.get(4)?,
                source_title: row.get(5)?,
                captured_finding: row.get(6)?,
                user_note: row.get(7)?,
                status: row.get(8)?,
                linked_person_id: row.get(9)?,
                linked_evidence_id: row.get(10)?,
                linked_event_id: row.get(11)?,
                linked_court_order_id: row.get(12)?,
                linked_calendar_item_id: row.get(13)?,
                linked_timeline_item_id: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                audit_ledger_id: row.get(17)?,
                receipt_hash: row.get(18)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_profile(db: State<DbConn>, profile: CaseProfile) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO case_profile (id, case_name, client_name, opposing_party, attorney_name, attorney_phone, attorney_email, court_name, docket_number, case_type, notes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            profile.id, profile.case_name, profile.client_name, profile.opposing_party,
            profile.attorney_name, profile.attorney_phone, profile.attorney_email,
            profile.court_name, profile.docket_number, profile.case_type, profile.notes, profile.updated_at
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_profile(db: State<DbConn>) -> Result<Option<CaseProfile>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, case_name, client_name, opposing_party, attorney_name, attorney_phone, attorney_email, court_name, docket_number, case_type, notes, updated_at FROM case_profile LIMIT 1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(CaseProfile {
            id: row.get(0).map_err(|e| e.to_string())?,
            case_name: row.get(1).map_err(|e| e.to_string())?,
            client_name: row.get(2).map_err(|e| e.to_string())?,
            opposing_party: row.get(3).map_err(|e| e.to_string())?,
            attorney_name: row.get(4).map_err(|e| e.to_string())?,
            attorney_phone: row.get(5).map_err(|e| e.to_string())?,
            attorney_email: row.get(6).map_err(|e| e.to_string())?,
            court_name: row.get(7).map_err(|e| e.to_string())?,
            docket_number: row.get(8).map_err(|e| e.to_string())?,
            case_type: row.get(9).map_err(|e| e.to_string())?,
            notes: row.get(10).map_err(|e| e.to_string())?,
            updated_at: row.get(11).map_err(|e| e.to_string())?,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_report(db: State<DbConn>, vault: State<VaultRoot>, item: ReportItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO reports (id, case_id, title, type, content, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            &item.id,
            &item.case_id,
            &item.title,
            &item.report_type,
            &item.content,
            &item.generated_at
        ],
    )
    .map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    audit_browser_record(
        &conn,
        &vault.0,
        "report",
        &item.id,
        &payload,
        "REPORT_SAVED",
    )?;
    Ok(())
}

#[tauri::command]
fn get_reports(db: State<DbConn>) -> Result<Vec<ReportItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, case_id, title, type, content, generated_at FROM reports ORDER BY generated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReportItem {
                id: row.get(0)?,
                case_id: row.get(1)?,
                title: row.get(2)?,
                report_type: row.get(3)?,
                content: row.get(4)?,
                generated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_report(db: State<DbConn>, vault: State<VaultRoot>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reports WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "id": id,
        "deleted": true,
        "deleted_at": chrono::Utc::now().to_rfc3339(),
    })
    .to_string();
    audit_browser_record(&conn, &vault.0, "report", &id, &payload, "REPORT_DELETED")?;
    Ok(())
}

#[tauri::command]
fn seal_verified_record(
    db: State<DbConn>,
    original_input: String,
    system_suggestion: String,
    final_verified_statement: String,
    category_suggestion: String,
) -> Result<SealVerifiedRecordResult, String> {
    use sha2::{Digest, Sha256};

    let record_id = uuid::Uuid::new_v4().to_string();
    let audit_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let verified_by = "local_operator";

    let package = SealedRecordPackage {
        id: &record_id,
        original_input: &original_input,
        system_suggestion: &system_suggestion,
        final_verified_statement: &final_verified_statement,
        category_suggestion: &category_suggestion,
        created_at: &created_at,
        verified_by,
    };
    let package_json = serde_json::to_string(&package).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(package_json.as_bytes());
    let record_hash = hex::encode(hasher.finalize());

    let metadata_json = serde_json::json!({
        "record_id": record_id,
        "action": "VERIFIED_COMMIT_SEALED",
        "record_package": package,
    })
    .to_string();

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let previous_ledger_hash = get_previous_ledger_hash(&conn)?;
    let entry_hash = ledger_entry_hash(
        &record_id,
        "VERIFIED_COMMIT_SEALED",
        &record_hash,
        &created_at,
        &metadata_json,
        previous_ledger_hash.as_deref(),
    );
    conn.execute(
        "INSERT INTO sealed_records (
            id, original_input, system_suggestion, final_verified_statement,
            category_suggestion, record_hash, created_at, verified_by
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            &record_id,
            &original_input,
            &system_suggestion,
            &final_verified_statement,
            &category_suggestion,
            &record_hash,
            &created_at,
            verified_by
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO audit_ledger (
            id, record_id, action, payload_hash, hash, created_at, metadata_json,
            previous_ledger_hash, ledger_entry_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            &audit_id,
            &record_id,
            "VERIFIED_COMMIT_SEALED",
            &record_hash,
            &record_hash,
            &created_at,
            &metadata_json,
            &previous_ledger_hash,
            &entry_hash
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(SealVerifiedRecordResult {
        id: record_id,
        record_hash,
        created_at,
        audit_action: "VERIFIED_COMMIT_SEALED".to_string(),
    })
}

#[tauri::command]
fn get_sealed_records(db: State<DbConn>) -> Result<Vec<SealedRecordItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, original_input, system_suggestion, final_verified_statement,
                category_suggestion, record_hash, created_at, verified_by
             FROM sealed_records
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SealedRecordItem {
                id: row.get(0)?,
                original_input: row.get(1)?,
                system_suggestion: row.get(2)?,
                final_verified_statement: row.get(3)?,
                category_suggestion: row.get(4)?,
                record_hash: row.get(5)?,
                created_at: row.get(6)?,
                verified_by: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_audit_ledger(db: State<DbConn>) -> Result<Vec<AuditLedgerItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, record_id, action, COALESCE(payload_hash, hash), hash, created_at, metadata_json,
                previous_ledger_hash, ledger_entry_hash
             FROM audit_ledger
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AuditLedgerItem {
                id: row.get(0)?,
                record_id: row.get(1)?,
                action: row.get(2)?,
                payload_hash: row.get(3)?,
                hash: row.get(4)?,
                created_at: row.get(5)?,
                metadata_json: row.get(6)?,
                previous_ledger_hash: row.get(7)?,
                ledger_entry_hash: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_audit_ledger(db: State<DbConn>) -> Result<LedgerIntegrityStatus, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, record_id, action, COALESCE(payload_hash, hash), created_at,
                metadata_json, previous_ledger_hash, ledger_entry_hash
             FROM audit_ledger
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut previous: Option<String> = None;
    let mut checked_rows = 0usize;
    for row in rows {
        let (
            id,
            record_id,
            action,
            payload_hash,
            created_at,
            metadata_json,
            previous_ledger_hash,
            ledger_hash,
        ) = row.map_err(|e| e.to_string())?;

        if previous_ledger_hash != previous {
            return Ok(LedgerIntegrityStatus {
                status: "BREACH".to_string(),
                checked_rows,
                breach_row_id: Some(id),
                message: "Integrity Alert: Audit Ledger Breach Detected".to_string(),
            });
        }

        let expected_hash = ledger_entry_hash(
            &record_id,
            &action,
            &payload_hash,
            &created_at,
            &metadata_json,
            previous.as_deref(),
        );

        if ledger_hash.as_deref() != Some(expected_hash.as_str()) {
            return Ok(LedgerIntegrityStatus {
                status: "BREACH".to_string(),
                checked_rows,
                breach_row_id: Some(id),
                message: "Integrity Alert: Audit Ledger Breach Detected".to_string(),
            });
        }

        previous = Some(expected_hash);
        checked_rows += 1;
    }

    Ok(LedgerIntegrityStatus {
        status: "VERIFIED".to_string(),
        checked_rows,
        breach_row_id: None,
        message: "Audit ledger verified.".to_string(),
    })
}

#[tauri::command]
fn import_evidence_file(
    app_handle: tauri::AppHandle,
    vault: State<VaultRoot>,
    evidence_id: String,
    file_name: String,
    file_type: String,
    original_modified_at: Option<String>,
    bytes: Vec<u8>,
) -> Result<ImportedEvidenceFile, String> {
    let _ = app_handle;
    let app_dir = vault.0.clone();
    let evidence_dir = app_dir.join("evidence_originals").join(&evidence_id);
    fs::create_dir_all(&evidence_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_file_name(&file_name);
    let file_path = evidence_dir.join(&safe_name);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(ImportedEvidenceFile {
        file_path: file_path.to_string_lossy().to_string(),
        sha256: sha256_hex(&bytes),
        file_name,
        file_size: bytes.len() as i64,
        file_type,
        original_modified_at,
        imported_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
fn verify_evidence_integrity(
    db: State<DbConn>,
    evidence_id: String,
    file_path: Option<String>,
    expected_hash: String,
) -> Result<IntegrityCheckResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let Some(path) = file_path else {
        let metadata_json = serde_json::json!({
            "evidence_id": evidence_id,
            "action": "MISSING_FILE",
            "expected_hash": expected_hash,
        })
        .to_string();
        insert_evidence_chain(
            &conn,
            &evidence_id,
            "MISSING_FILE",
            &expected_hash,
            metadata_json,
        )?;
        return Ok(IntegrityCheckResult {
            status: "Missing file".to_string(),
            expected_hash,
            actual_hash: None,
        });
    };

    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => {
            let metadata_json = serde_json::json!({
                "evidence_id": evidence_id,
                "action": "MISSING_FILE",
                "file_path": path,
                "expected_hash": expected_hash,
            })
            .to_string();
            insert_evidence_chain(
                &conn,
                &evidence_id,
                "MISSING_FILE",
                &expected_hash,
                metadata_json,
            )?;
            return Ok(IntegrityCheckResult {
                status: "Missing file".to_string(),
                expected_hash,
                actual_hash: None,
            });
        }
    };

    let actual_hash = sha256_hex(&bytes);
    let (status, action) = if actual_hash == expected_hash {
        ("Verified", "HASH_VERIFIED")
    } else {
        ("Mismatch", "HASH_MISMATCH")
    };
    let metadata_json = serde_json::json!({
        "evidence_id": evidence_id,
        "action": action,
        "file_path": path,
        "expected_hash": expected_hash,
        "actual_hash": actual_hash,
    })
    .to_string();
    insert_evidence_chain(&conn, &evidence_id, action, &actual_hash, metadata_json)?;

    Ok(IntegrityCheckResult {
        status: status.to_string(),
        expected_hash,
        actual_hash: Some(actual_hash),
    })
}

#[tauri::command]
fn import_communication_export(
    app_handle: tauri::AppHandle,
    db: State<DbConn>,
    vault: State<VaultRoot>,
    title: String,
    file_name: String,
    file_type: String,
    incident_id: Option<String>,
    bytes: Vec<u8>,
) -> Result<CommunicationImportResult, String> {
    let communication_id = uuid::Uuid::new_v4().to_string();
    let evidence_id = uuid::Uuid::new_v4().to_string();
    let timeline_event_id = uuid::Uuid::new_v4().to_string();
    let imported_at = chrono::Utc::now().to_rfc3339();
    let extension = file_extension(&file_name);
    let original_hash = sha256_hex(&bytes);

    let _ = app_handle;
    let app_dir = vault.0.clone();
    let export_dir = app_dir
        .join("communication_exports")
        .join(&communication_id);
    fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;
    let safe_name = sanitize_file_name(&file_name);
    let file_path = export_dir.join(&safe_name);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    let messages = parse_communication_messages(&file_name, &bytes);
    let participants = unique_participants(&messages);
    let gaps = communication_gaps(&extension, &messages, &participants);
    let (screenshot_risk, trust_glyph_risk) =
        score_communication_risk(&extension, &gaps, messages.len());
    let first_timestamp = messages
        .iter()
        .find_map(|message| message.timestamp.clone());
    let last_timestamp = messages
        .iter()
        .rev()
        .find_map(|message| message.timestamp.clone());
    let court_safe_summary =
        court_safe_communication_summary(&title, &messages, &participants, &gaps);
    let thread_context_json = serde_json::json!({
        "messages": messages,
        "source_file_name": file_name,
        "source_file_type": file_type,
        "preserved_file_path": file_path.to_string_lossy(),
        "native_export": matches!(extension.as_str(), "txt" | "html" | "htm" | "csv"),
        "screenshot_export": matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif"),
    })
    .to_string();
    let participants_json = serde_json::to_string(&participants).map_err(|e| e.to_string())?;
    let gaps_json = serde_json::to_string(&gaps).map_err(|e| e.to_string())?;
    let file_path_string = file_path.to_string_lossy().to_string();

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO communication_records (
            id, evidence_id, timeline_event_id, incident_id, title, file_path,
            file_name, file_type, file_size, original_hash, imported_at,
            message_count, first_timestamp, last_timestamp, participants_json,
            gaps_json, screenshot_risk, trust_glyph_risk, court_safe_summary,
            thread_context_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        rusqlite::params![
            &communication_id,
            &evidence_id,
            &timeline_event_id,
            &incident_id,
            &title,
            &file_path_string,
            &file_name,
            &file_type,
            bytes.len() as i64,
            &original_hash,
            &imported_at,
            messages.len() as i64,
            &first_timestamp,
            &last_timestamp,
            &participants_json,
            &gaps_json,
            &screenshot_risk,
            &trust_glyph_risk,
            &court_safe_summary,
            &thread_context_json
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO evidence (
            id, type, title, description, date, file_path, sha256, tags,
            file_name, file_size, file_type, trust_glyph_risk,
            source_description, original_modified_at, imported_at, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        rusqlite::params![
            &evidence_id,
            "document",
            &title,
            &court_safe_summary,
            first_timestamp.as_deref().unwrap_or(&imported_at),
            &file_path_string,
            &original_hash,
            "communication,message-export",
            &file_name,
            bytes.len() as i64,
            &file_type,
            &trust_glyph_risk,
            "Communication evidence import",
            Option::<String>::None,
            &imported_at,
            &imported_at
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO events (id, type, title, date, description, related_evidence_ids, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            &timeline_event_id,
            "communication",
            &title,
            first_timestamp.as_deref().unwrap_or(&imported_at),
            &court_safe_summary,
            &evidence_id,
            &imported_at
        ],
    )
    .map_err(|e| e.to_string())?;

    let metadata_json = serde_json::json!({
        "communication_id": communication_id,
        "evidence_id": evidence_id,
        "timeline_event_id": timeline_event_id,
        "incident_id": incident_id,
        "action": "COMMUNICATION_EXPORT_IMPORTED",
        "file_name": file_name,
        "file_type": file_type,
        "original_hash": original_hash,
        "message_count": messages.len(),
        "participants": participants,
        "gaps": gaps,
        "screenshot_risk": screenshot_risk,
        "trust_glyph_risk": trust_glyph_risk,
    })
    .to_string();
    insert_evidence_chain(
        &conn,
        &evidence_id,
        "COMMUNICATION_EXPORT_IMPORTED",
        &original_hash,
        metadata_json,
    )?;

    Ok(CommunicationImportResult {
        id: communication_id,
        evidence_id,
        timeline_event_id,
        original_hash,
        message_count: messages.len(),
        first_timestamp,
        last_timestamp,
        participants,
        gaps,
        screenshot_risk,
        trust_glyph_risk,
        court_safe_summary,
    })
}

#[tauri::command]
fn compute_file_hash(path: String) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[tauri::command]
fn export_database(db_path: String, destination: String) -> Result<(), String> {
    std::fs::copy(&db_path, &destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_db_path(app_handle: tauri::AppHandle, vault: State<VaultRoot>) -> Result<String, String> {
    let _ = app_handle;
    let db_path = vault_database_path(&vault.0);
    Ok(db_path.to_string_lossy().to_string())
}

fn assistant_context_terms(prompt: &str) -> Vec<String> {
    let stop = [
        "what",
        "when",
        "where",
        "with",
        "from",
        "that",
        "this",
        "there",
        "their",
        "about",
        "please",
        "show",
        "tell",
        "summarize",
        "case",
        "record",
        "records",
    ];
    prompt
        .split(|ch: char| !ch.is_alphanumeric())
        .map(|term| term.to_lowercase())
        .filter(|term| term.len() > 3 && !stop.contains(&term.as_str()))
        .take(8)
        .collect()
}

fn assistant_context_matches(line: &str, terms: &[String], allow_recent: bool) -> bool {
    if terms.is_empty() {
        return allow_recent;
    }
    let lower = line.to_lowercase();
    terms.iter().any(|term| lower.contains(term))
}

fn build_assistant_vault_context(
    conn: &rusqlite::Connection,
    vault_root: &Path,
    prompt: &str,
    active_page: &str,
) -> Result<(String, usize, usize), String> {
    let terms = assistant_context_terms(prompt);
    let broad_case_request = {
        let lower = prompt.to_lowercase();
        lower.contains("summarize")
            || lower.contains("my case")
            || lower.contains("my record")
            || lower.contains("what happened")
    };
    let mut lines: Vec<String> = vec![format!(
        "vault_root={} | active_page={}",
        vault_root.to_string_lossy(),
        active_page
    )];

    let mut record_count = 0usize;
    let mut glyph_count = 0usize;

    let mut push_line = |line: String, has_glyph: bool| {
        if assistant_context_matches(&line, &terms, broad_case_request) && record_count < 18 {
            if has_glyph {
                glyph_count += 1;
            }
            record_count += 1;
            lines.push(line);
        }
    };

    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, glyph_trace_id, record_type, case_id, title, status,
                verification_state, updated_at, vault_path
         FROM operational_records
         WHERE archived = 0
         ORDER BY updated_at DESC
         LIMIT 25",
    ) {
        let rows = stmt
            .query_map([], |row| {
                Ok(format!(
                    "source=operational_records | record_id={} | glyph={} | type={} | case_id={} | title={} | status={} | verification={} | updated={} | vault_path={}",
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            push_line(row.map_err(|e| e.to_string())?, true);
        }
    }

    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, title, type, date, sha256, file_path
         FROM evidence
         ORDER BY created_at DESC
         LIMIT 20",
    ) {
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                Ok(format!(
                    "source=evidence | record_id={} | glyph=glyph:evidence:{} | title={} | type={} | date={} | sha256={} | vault_path={}",
                    id,
                    id,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            push_line(row.map_err(|e| e.to_string())?, true);
        }
    }

    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, due_date, amount_paid, payment_date, support_category,
                source_status, receipt_sha256, agency_statement_sha256, updated_at
         FROM child_support_payments
         ORDER BY updated_at DESC
         LIMIT 20",
    ) {
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                Ok(format!(
                    "source=child_support_payments | record_id={} | glyph=glyph:child_support_payment_ledger:{} | due_date={} | amount_paid={} | payment_date={} | category={} | source_status={} | receipt_sha256={} | agency_statement_sha256={} | vault_path={}",
                    id,
                    id,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    vault_data_dir(vault_root, "child_support_ledger").join(&id).to_string_lossy(),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            push_line(row.map_err(|e| e.to_string())?, true);
        }
    }

    Ok((
        if record_count == 0 {
            String::new()
        } else {
            lines.join("\n")
        },
        record_count,
        glyph_count,
    ))
}

#[tauri::command]
async fn local_agent_chat(
    input: LocalAgentChatInput,
    db: State<'_, DbConn>,
    vault: State<'_, VaultRoot>,
) -> Result<LocalAgentChatResult, String> {
    let (vault_context, vault_record_count, glyph_record_count) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        build_assistant_vault_context(&conn, &vault.0, &input.prompt, &input.active_page)?
    };

    local_agent_chat_with_context(input, vault_context, vault_record_count, glyph_record_count)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dossier(id: &str, status: &str) -> PlayerDossierItem {
        PlayerDossierItem {
            id: id.to_string(),
            case_ids: vec!["primary".to_string()],
            category: "witness".to_string(),
            name: "Temporary Test Contact".to_string(),
            role: "witness".to_string(),
            known_role: "Test-only contact".to_string(),
            organization: "".to_string(),
            phone_numbers: "555-0100".to_string(),
            emails: "temp@example.invalid".to_string(),
            address: "123 Test St".to_string(),
            relationship_to_case: "temporary validation".to_string(),
            status: status.to_string(),
            last_contact: "2026-08-09".to_string(),
            follow_up_needed: false,
            conflict_concern: false,
            documents_requested: "".to_string(),
            documents_provided: "".to_string(),
            linked_evidence: "".to_string(),
            linked_incidents: "".to_string(),
            linked_timeline_events: "".to_string(),
            private_field_notes: "temporary private note".to_string(),
            court_safe_notes: "temporary court safe note".to_string(),
            profile: PlayerDossierProfile::default(),
            interaction_history: vec![],
            created_at: "2026-08-09T00:00:00Z".to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    fn assert_audit_chain(conn: &rusqlite::Connection) {
        let mut stmt = conn
            .prepare(
                "SELECT id, record_id, action, COALESCE(payload_hash, hash), created_at,
                    metadata_json, previous_ledger_hash, ledger_entry_hash
                 FROM audit_ledger
                 ORDER BY created_at ASC, id ASC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            })
            .unwrap();

        let mut previous: Option<String> = None;
        let mut count = 0usize;
        for row in rows {
            let (
                id,
                record_id,
                action,
                payload_hash,
                created_at,
                metadata_json,
                previous_hash,
                ledger_hash,
            ) = row.unwrap();
            assert_eq!(previous_hash, previous, "bad previous hash at {id}");
            let expected = ledger_entry_hash(
                &record_id,
                &action,
                &payload_hash,
                &created_at,
                &metadata_json,
                previous.as_deref(),
            );
            assert_eq!(ledger_hash.as_deref(), Some(expected.as_str()));
            previous = Some(expected);
            count += 1;
        }
        assert_eq!(count, 3);
    }

    #[test]
    fn dossier_create_update_delete_writes_snapshots_and_chain() {
        let temp_root =
            std::env::temp_dir().join(format!("pops-vault-dossier-test-{}", uuid::Uuid::new_v4()));
        let db_path = temp_root.join("database").join("proof_of_presence.db");
        ensure_vault_system_layout(&temp_root).unwrap();
        let conn = init_db(db_path.to_str().unwrap());
        let dossier_id = uuid::Uuid::new_v4().to_string();

        save_player_dossier_record(&conn, &temp_root, test_dossier(&dossier_id, "active")).unwrap();
        save_player_dossier_record(&conn, &temp_root, test_dossier(&dossier_id, "watch")).unwrap();
        delete_player_dossier_record(&conn, &temp_root, dossier_id.clone()).unwrap();

        let dossier_dir = temp_root
            .join("dossiers")
            .join("contacts")
            .join(&dossier_id);
        assert!(dossier_dir.join("current.json").exists());
        assert!(dossier_dir.join("documents").is_dir());
        assert!(dossier_dir.join("notes").is_dir());
        assert!(dossier_dir.join("research").is_dir());
        let history_count = fs::read_dir(dossier_dir.join("history")).unwrap().count();
        assert_eq!(history_count, 3);

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM players_dossier WHERE id = ?1",
                [&dossier_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
        assert_audit_chain(&conn);
        drop(conn);
        fs::remove_dir_all(&temp_root).unwrap();
        assert!(!temp_root.exists());
    }
}

// ─── Main ─────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let vault_root = runtime_vault_system_dir(&app.config()).expect("resolve vault root");
            ensure_vault_system_layout(&vault_root).expect("create vault system layout");
            migrate_legacy_app_data(&app.config(), &vault_root).expect("migrate legacy app data");
            let db_path = vault_database_path(&vault_root);
            let conn = init_db(db_path.to_str().unwrap());
            app.manage(DbConn(std::sync::Mutex::new(conn)));
            app.manage(VaultRoot(vault_root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_evidence,
            submit_evidence,
            get_evidence_metadata,
            record_chain_of_custody,
            export_pdf,
            export_timeline,
            export_evidence_index,
            export_attorney_packet,
            get_case_summary,
            get_case_overview,
            get_case_overview_data,
            save_case_matter,
            delete_case_matter,
            save_case_alert,
            resolve_case_alert,
            rebuild_derived_state,
            run_full_integrity_check,
            get_app_diagnostics,
            clear_runtime_cache,
            rebuild_all_documents,
            export_full_case_bundle,
            get_evidence,
            delete_evidence,
            get_evidence_chain,
            save_court_order,
            get_court_orders,
            delete_court_order,
            save_violation,
            get_violations,
            delete_violation,
            save_event,
            get_events,
            delete_event,
            save_child_support_payment,
            get_child_support_payments,
            delete_child_support_payment,
            save_operational_record,
            get_operational_records,
            delete_operational_record,
            get_glyph_trace_records,
            create_incident,
            get_incidents,
            delete_incident,
            save_player_dossier,
            get_players_dossier,
            delete_player_dossier,
            save_contact_research_finding,
            get_contact_research_findings,
            save_profile,
            get_profile,
            save_report,
            get_reports,
            delete_report,
            seal_verified_record,
            get_sealed_records,
            get_audit_ledger,
            verify_audit_ledger,
            import_evidence_file,
            import_communication_export,
            verify_evidence_integrity,
            compute_file_hash,
            export_database,
            get_db_path,
            save_vault_record,
            delete_vault_record,
            mcp_research_tool,
            local_agent_status,
            local_agent_chat,
            local_agent_speak,
            local_agent_ocr
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
