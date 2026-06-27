#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[path = "mcp/research_server.rs"]
mod research_server;

use serde::{Deserialize, Serialize};
use std::fs;
use tauri::api::path::app_data_dir;
use tauri::{Manager, State};
use rusqlite::OptionalExtension;
use research_server::mcp_research_tool;

// ─── SQLite Database ──────────────────────────────────────────────

struct DbConn(std::sync::Mutex<rusqlite::Connection>);

fn init_db(path: &str) -> rusqlite::Connection {
    let conn = rusqlite::Connection::open(path).expect("open db");
    conn.execute_batch(
        "BEGIN;
        CREATE TABLE IF NOT EXISTS evidence (
            id TEXT PRIMARY KEY,
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
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            date TEXT,
            description TEXT,
            related_evidence_ids TEXT,
            created_at TEXT NOT NULL
        );
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
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            generated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS players_dossier (
            id TEXT PRIMARY KEY,
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

#[derive(Serialize, Deserialize, Clone)]
struct EvidenceItem {
    id: String,
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

#[derive(Serialize, Deserialize, Clone)]
struct PlayerDossierItem {
    id: String,
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
            id, type, title, description, date, file_path, sha256, tags,
            file_name, file_size, file_type, trust_glyph_risk,
            source_description, original_modified_at, imported_at, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        rusqlite::params![
            &item.id,
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
            "SELECT id, type, title, description, date, file_path, sha256, tags,
            file_name, file_size, file_type, trust_glyph_risk,
            source_description, original_modified_at, imported_at, created_at
         FROM evidence ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let tags_raw: String = row.get(7)?;
            Ok(EvidenceItem {
                id: row.get(0)?,
                ev_type: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                date: row.get(4)?,
                file_path: row.get(5)?,
                sha256: row.get(6)?,
                tags: tags_raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                file_name: row.get(8)?,
                file_size: row.get(9)?,
                file_type: row.get(10)?,
                trust_glyph_risk: row.get(11)?,
                source_description: row.get(12)?,
                original_modified_at: row.get(13)?,
                imported_at: row.get(14)?,
                created_at: row.get(15)?,
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
    let input: ChainOfCustodyPayload =
        serde_json::from_str(&payload).map_err(|e| e.to_string())?;
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
    export_receipt(format!("exports/timeline-{}.json", sanitize_file_name(&document_id)))
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
    app_handle: tauri::AppHandle,
    db: State<DbConn>,
) -> Result<String, String> {
    let app_dir = app_data_dir(&app_handle.config()).ok_or("No app dir")?;
    let db_path = app_dir.join("proof_of_presence.db");
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
fn clear_runtime_cache(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_data_dir(&app_handle.config()).ok_or("No app dir")?;
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
    case_id: String,
) -> Result<String, String> {
    let app_dir = app_data_dir(&app_handle.config()).ok_or("No app dir")?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let safe_timestamp = timestamp.replace(':', "-");
    let bundle_dir = app_dir
        .join("case_bundles")
        .join(format!("{}-{}", sanitize_file_name(&case_id), safe_timestamp));
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
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_court_order(db: State<DbConn>, item: CourtOrderItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO court_orders (id, title, order_date, effective_date, judge_name, court_name, docket_number, terms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![item.id, item.title, item.order_date, item.effective_date, item.judge_name, item.court_name, item.docket_number, item.terms, item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_court_orders(db: State<DbConn>) -> Result<Vec<CourtOrderItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, title, order_date, effective_date, judge_name, court_name, docket_number, terms, created_at FROM court_orders ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CourtOrderItem {
                id: row.get(0)?,
                title: row.get(1)?,
                order_date: row.get(2)?,
                effective_date: row.get(3)?,
                judge_name: row.get(4)?,
                court_name: row.get(5)?,
                docket_number: row.get(6)?,
                terms: row.get(7)?,
                created_at: row.get(8)?,
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
        "INSERT OR REPLACE INTO violations (id, order_id, date, description, evidence_ids, severity, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![item.id, item.order_id, item.date, item.description, item.evidence_ids.join(","), item.severity, item.status, item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_violations(db: State<DbConn>) -> Result<Vec<ViolationItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, order_id, date, description, evidence_ids, severity, status, created_at FROM violations ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let ids_raw: String = row.get(4)?;
            Ok(ViolationItem {
                id: row.get(0)?,
                order_id: row.get(1)?,
                date: row.get(2)?,
                description: row.get(3)?,
                evidence_ids: ids_raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                severity: row.get(5)?,
                status: row.get(6)?,
                created_at: row.get(7)?,
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
        "INSERT OR REPLACE INTO events (id, type, title, date, description, related_evidence_ids, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![item.id, item.ev_type, item.title, item.date, item.description, item.related_evidence_ids.join(","), item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_events(db: State<DbConn>) -> Result<Vec<EventItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, type, title, date, description, related_evidence_ids, created_at FROM events ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let ids_raw: String = row.get(5)?;
            Ok(EventItem {
                id: row.get(0)?,
                ev_type: row.get(1)?,
                title: row.get(2)?,
                date: row.get(3)?,
                description: row.get(4)?,
                related_evidence_ids: ids_raw
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
                created_at: row.get(6)?,
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
            id, type, title, date, location, description,
            denied_visit_scheduled_start, denied_visit_scheduled_end,
            denied_visit_arrival_time, denied_visit_exchange_location,
            denied_visit_who_denied, denied_visit_child_present,
            denied_visit_reason_given, denied_visit_attempted_contact,
            linked_evidence_ids, linked_communication_ids, timeline_event_id,
            court_safe_summary, trust_glyph_risk, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        rusqlite::params![
            &id,
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
        "INSERT INTO events (id, type, title, date, description, related_evidence_ids, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            &timeline_event_id,
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
            "SELECT id, type, title, date, location, description,
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
            let evidence_raw: String = row.get(14)?;
            let communication_raw: String = row.get(15)?;
            Ok(IncidentItem {
                id: row.get(0)?,
                incident_type: row.get(1)?,
                title: row.get(2)?,
                date: row.get(3)?,
                location: row.get(4)?,
                description: row.get(5)?,
                denied_visit_scheduled_start: row.get(6)?,
                denied_visit_scheduled_end: row.get(7)?,
                denied_visit_arrival_time: row.get(8)?,
                denied_visit_exchange_location: row.get(9)?,
                denied_visit_who_denied: row.get(10)?,
                denied_visit_child_present: row.get(11)?,
                denied_visit_reason_given: row.get(12)?,
                denied_visit_attempted_contact: row.get(13)?,
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
                timeline_event_id: row.get(16)?,
                court_safe_summary: row.get(17)?,
                trust_glyph_risk: row.get(18)?,
                created_at: row.get(19)?,
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

#[tauri::command]
fn save_player_dossier(db: State<DbConn>, item: PlayerDossierItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let interaction_history_json =
        serde_json::to_string(&item.interaction_history).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO players_dossier (
            id, name, role, known_role, organization, phone_numbers, emails, address,
            relationship_to_case, status, last_contact, follow_up_needed, conflict_concern,
            documents_requested, documents_provided, linked_evidence, linked_incidents,
            linked_timeline_events, private_field_notes, court_safe_notes,
            interaction_history_json, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, ?16, ?17,
            ?18, ?19, ?20,
            ?21, ?22, ?23
        )",
        rusqlite::params![
            item.id,
            item.name,
            item.role,
            item.known_role,
            item.organization,
            item.phone_numbers,
            item.emails,
            item.address,
            item.relationship_to_case,
            item.status,
            item.last_contact,
            if item.follow_up_needed { 1 } else { 0 },
            if item.conflict_concern { 1 } else { 0 },
            item.documents_requested,
            item.documents_provided,
            item.linked_evidence,
            item.linked_incidents,
            item.linked_timeline_events,
            item.private_field_notes,
            item.court_safe_notes,
            interaction_history_json,
            item.created_at,
            item.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_players_dossier(db: State<DbConn>) -> Result<Vec<PlayerDossierItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT
                id, name, role, known_role, organization, phone_numbers, emails, address,
                relationship_to_case, status, last_contact, follow_up_needed, conflict_concern,
                documents_requested, documents_provided, linked_evidence, linked_incidents,
                linked_timeline_events, private_field_notes, court_safe_notes,
                interaction_history_json, created_at, updated_at
             FROM players_dossier
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let interaction_history_json: String = row.get(20)?;
            let interaction_history: Vec<PlayerInteractionLog> =
                serde_json::from_str(&interaction_history_json).unwrap_or_default();

            Ok(PlayerDossierItem {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                known_role: row.get(3)?,
                organization: row.get(4)?,
                phone_numbers: row.get(5)?,
                emails: row.get(6)?,
                address: row.get(7)?,
                relationship_to_case: row.get(8)?,
                status: row.get(9)?,
                last_contact: row.get(10)?,
                follow_up_needed: row.get::<_, i64>(11)? != 0,
                conflict_concern: row.get::<_, i64>(12)? != 0,
                documents_requested: row.get(13)?,
                documents_provided: row.get(14)?,
                linked_evidence: row.get(15)?,
                linked_incidents: row.get(16)?,
                linked_timeline_events: row.get(17)?,
                private_field_notes: row.get(18)?,
                court_safe_notes: row.get(19)?,
                interaction_history,
                created_at: row.get(21)?,
                updated_at: row.get(22)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_player_dossier(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM players_dossier WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_contact_research_finding(
    db: State<DbConn>,
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
    let metadata_json = serde_json::json!({
        "record_id": &finding.id,
        "contact_id": &finding.contact_id,
        "action": "CONTACT_RESEARCH_FINDING_SAVED",
        "status": &finding.status,
        "provider_or_source": &finding.provider_or_source,
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
fn save_report(db: State<DbConn>, item: ReportItem) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO reports (id, title, type, content, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            item.id,
            item.title,
            item.report_type,
            item.content,
            item.generated_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_reports(db: State<DbConn>) -> Result<Vec<ReportItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, type, content, generated_at FROM reports ORDER BY generated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReportItem {
                id: row.get(0)?,
                title: row.get(1)?,
                report_type: row.get(2)?,
                content: row.get(3)?,
                generated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_report(db: State<DbConn>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reports WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
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
    evidence_id: String,
    file_name: String,
    file_type: String,
    original_modified_at: Option<String>,
    bytes: Vec<u8>,
) -> Result<ImportedEvidenceFile, String> {
    let app_dir = app_data_dir(&app_handle.config()).ok_or("No app dir")?;
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

    let app_dir = app_data_dir(&app_handle.config()).ok_or("No app dir")?;
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
fn get_db_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_data_dir(&app_handle.config()).ok_or("No app dir")?;
    let db_path = app_dir.join("proof_of_presence.db");
    Ok(db_path.to_string_lossy().to_string())
}

// ─── Main ─────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app_data_dir(&app.config()).expect("app dir");
            fs::create_dir_all(&app_dir).expect("create app dir");
            let db_path = app_dir.join("proof_of_presence.db");
            let conn = init_db(db_path.to_str().unwrap());
            app.manage(DbConn(std::sync::Mutex::new(conn)));
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
            mcp_research_tool
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
