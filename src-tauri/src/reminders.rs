//! POPS Communication & Reminder Runtime — Phase 1 (local reminder engine).
//!
//! Vault law: SQLite in `Vault_System/database` is the single source of truth.
//! Every appointment/slot change is mirrored to `browser_records/` and chained
//! into `audit_ledger` through `audit_browser_record`. Reminder tables live in the
//! same database, so Vault Transfer carries them to Android/iOS unchanged.
//!
//! The engine is deterministic: no LLM, voice service, network or desktop is
//! required to compute, schedule or acknowledge reminders.

use chrono::{DateTime, Duration, LocalResult, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use tauri::State;

use std::path::Path;

use super::{audit_browser_record, sha256_hex, DbConn, VaultRoot};

pub const DEFAULT_COURT_OFFSETS: [i64; 5] = [10080, 4320, 1440, 180, 60];
pub const DEFAULT_APPOINTMENT_OFFSETS: [i64; 2] = [1440, 120];
pub const DEFAULT_ESCALATION_MINUTES: [i64; 2] = [10, 30];

pub fn init_reminder_tables(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reminder_appointments (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            local_start TEXT NOT NULL,
            time_zone TEXT NOT NULL,
            start_utc TEXT NOT NULL,
            critical INTEGER NOT NULL DEFAULT 0,
            offsets_json TEXT NOT NULL,
            status TEXT NOT NULL,
            source TEXT NOT NULL,
            linked_record_id TEXT,
            revision INTEGER NOT NULL DEFAULT 1,
            record_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reminder_appt_start ON reminder_appointments(start_utc);
        CREATE TABLE IF NOT EXISTS reminder_slots (
            id TEXT PRIMARY KEY,
            appointment_id TEXT NOT NULL,
            appointment_revision INTEGER NOT NULL,
            slot_kind TEXT NOT NULL,
            parent_slot_id TEXT,
            offset_minutes INTEGER NOT NULL,
            fire_at_utc TEXT NOT NULL,
            label TEXT NOT NULL,
            critical INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL,
            notification_id INTEGER NOT NULL,
            acknowledged_at TEXT,
            ack_source TEXT,
            last_event TEXT,
            last_event_at TEXT,
            FOREIGN KEY(appointment_id) REFERENCES reminder_appointments(id)
        );
        CREATE INDEX IF NOT EXISTS idx_reminder_slots_fire ON reminder_slots(fire_at_utc, state);
        CREATE INDEX IF NOT EXISTS idx_reminder_slots_appt ON reminder_slots(appointment_id);
        CREATE TABLE IF NOT EXISTS reminder_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );",
    )
}

// ─── Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderAppointment {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub case_id: String,
    /// court | attorney | appointment | deadline | other
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub notes: String,
    /// Wall-clock time at the venue, `YYYY-MM-DDTHH:MM`.
    pub local_start: String,
    /// IANA zone of the venue (court's local time zone), e.g. `America/Denver`.
    pub time_zone: String,
    #[serde(default)]
    pub start_utc: String,
    #[serde(default)]
    pub critical: bool,
    /// Minutes before start. Empty = defaults for the kind.
    #[serde(default)]
    pub offsets: Vec<i64>,
    /// draft | confirmed | cancelled
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub linked_record_id: Option<String>,
    #[serde(default)]
    pub revision: i64,
    #[serde(default)]
    pub record_hash: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSlot {
    pub id: String,
    pub appointment_id: String,
    pub appointment_revision: i64,
    /// reminder | escalation
    pub slot_kind: String,
    pub parent_slot_id: Option<String>,
    pub offset_minutes: i64,
    pub fire_at_utc: String,
    pub label: String,
    pub critical: bool,
    /// pending | os_scheduled | schedule_failed | fired | acknowledged | not_needed | superseded | cancelled | skipped_past
    pub state: String,
    pub notification_id: i32,
    pub acknowledged_at: Option<String>,
    pub ack_source: Option<String>,
    pub last_event: Option<String>,
    pub last_event_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSettings {
    pub court_offsets: Vec<i64>,
    pub appointment_offsets: Vec<i64>,
    pub escalation_enabled: bool,
    pub escalation_minutes: Vec<i64>,
    pub last_device_time_zone: Option<String>,
}

impl Default for ReminderSettings {
    fn default() -> Self {
        Self {
            court_offsets: DEFAULT_COURT_OFFSETS.to_vec(),
            appointment_offsets: DEFAULT_APPOINTMENT_OFFSETS.to_vec(),
            escalation_enabled: true,
            escalation_minutes: DEFAULT_ESCALATION_MINUTES.to_vec(),
            last_device_time_zone: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub appointment: ReminderAppointment,
    pub slots: Vec<ReminderSlot>,
    /// OS notification ids that must be cancelled on this device.
    pub cancel_notification_ids: Vec<i32>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AckResult {
    pub slot: ReminderSlot,
    pub cancel_notification_ids: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeZoneCheck {
    pub changed: bool,
    pub previous: Option<String>,
    pub current: String,
}

// ─── Pure logic (unit tested) ──────────────────────────────────────

/// Venue wall-clock time + IANA zone → UTC. DST gaps are rejected; for an
/// ambiguous (repeated) hour the earlier instant is used and a warning returned.
pub fn local_to_utc(local: &str, zone: &str) -> Result<(DateTime<Utc>, Option<String>), String> {
    let tz: Tz = zone.parse().map_err(|_| format!("Unknown time zone: {zone}"))?;
    let naive = NaiveDateTime::parse_from_str(local, "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(local, "%Y-%m-%dT%H:%M:%S"))
        .map_err(|_| format!("Invalid local date/time: {local}"))?;
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => Ok((dt.with_timezone(&Utc), None)),
        LocalResult::Ambiguous(early, _) => Ok((
            early.with_timezone(&Utc),
            Some(format!("{local} occurs twice in {zone} (clock change). The earlier time was used; confirm with the court.")),
        )),
        LocalResult::None => Err(format!("{local} does not exist in {zone} (clock change). Check the time with the court.")),
    }
}

pub fn offset_label(kind: &str, minutes: i64) -> String {
    let court = kind == "court";
    match minutes {
        10080 if court => "Advance notice (7 days)".into(),
        4320 if court => "Preparation check (3 days)".into(),
        1440 if court => "Court tomorrow (24 hours)".into(),
        180 if court => "Departure preparation (3 hours)".into(),
        60 if court => "Final reminder (1 hour)".into(),
        m if m % 1440 == 0 => format!("{} day(s) before", m / 1440),
        m if m % 60 == 0 => format!("{} hour(s) before", m / 60),
        m => format!("{m} minutes before"),
    }
}

/// Deterministic, positive 31-bit OS notification id for a slot id.
pub fn notification_id_for(slot_id: &str) -> i32 {
    let h = sha256_hex(slot_id.as_bytes());
    (u32::from_str_radix(&h[..8], 16).unwrap_or(1) & 0x7fff_ffff).max(1) as i32
}

fn normalized_offsets(mut offsets: Vec<i64>) -> Vec<i64> {
    offsets.retain(|m| *m > 0 && *m <= 60 * 24 * 90);
    offsets.sort_unstable_by(|a, b| b.cmp(a));
    offsets.dedup();
    offsets
}

/// Builds reminder + escalation slots for a confirmed appointment.
pub fn build_slots(
    appt: &ReminderAppointment,
    start_utc: DateTime<Utc>,
    escalation: &[i64],
    now: DateTime<Utc>,
) -> Vec<ReminderSlot> {
    let mut slots = Vec::new();
    for offset in normalized_offsets(appt.offsets.clone()) {
        let fire = start_utc - Duration::minutes(offset);
        let id = format!("{}:r{}:{}", appt.id, appt.revision, offset);
        let state = if fire <= now { "skipped_past" } else { "pending" };
        slots.push(ReminderSlot {
            notification_id: notification_id_for(&id),
            id: id.clone(),
            appointment_id: appt.id.clone(),
            appointment_revision: appt.revision,
            slot_kind: "reminder".into(),
            parent_slot_id: None,
            offset_minutes: offset,
            fire_at_utc: fire.to_rfc3339(),
            label: offset_label(&appt.kind, offset),
            critical: appt.critical,
            state: state.into(),
            acknowledged_at: None,
            ack_source: None,
            last_event: None,
            last_event_at: None,
        });
        if appt.critical && state == "pending" {
            for esc in escalation.iter().filter(|m| **m > 0) {
                let esc_fire = fire + Duration::minutes(*esc);
                if esc_fire >= start_utc {
                    continue;
                }
                let esc_id = format!("{id}:e{esc}");
                slots.push(ReminderSlot {
                    notification_id: notification_id_for(&esc_id),
                    id: esc_id,
                    appointment_id: appt.id.clone(),
                    appointment_revision: appt.revision,
                    slot_kind: "escalation".into(),
                    parent_slot_id: Some(id.clone()),
                    offset_minutes: offset,
                    fire_at_utc: esc_fire.to_rfc3339(),
                    label: format!("Not yet acknowledged: {}", offset_label(&appt.kind, offset)),
                    critical: true,
                    state: "pending".into(),
                    acknowledged_at: None,
                    ack_source: None,
                    last_event: None,
                    last_event_at: None,
                });
            }
        }
    }
    slots.sort_by(|a, b| a.fire_at_utc.cmp(&b.fire_at_utc));
    slots
}

fn appointment_hash(a: &ReminderAppointment) -> String {
    let core = serde_json::json!({
        "id": a.id, "kind": a.kind, "title": a.title, "location": a.location,
        "local_start": a.local_start, "time_zone": a.time_zone, "start_utc": a.start_utc,
        "critical": a.critical, "offsets": a.offsets, "status": a.status, "revision": a.revision,
    });
    sha256_hex(core.to_string().as_bytes())
}

// ─── Storage helpers ───────────────────────────────────────────────

fn load_settings(conn: &rusqlite::Connection) -> ReminderSettings {
    conn.query_row(
        "SELECT value_json FROM reminder_settings WHERE key = 'settings'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|v| serde_json::from_str(&v).ok())
    .unwrap_or_default()
}

fn store_settings(conn: &rusqlite::Connection, s: &ReminderSettings) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO reminder_settings (key, value_json, updated_at) VALUES ('settings', ?1, ?2)",
        rusqlite::params![serde_json::to_string(s).map_err(|e| e.to_string())?, Utc::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn row_to_appointment(r: &rusqlite::Row) -> rusqlite::Result<ReminderAppointment> {
    let offsets_json: String = r.get(10)?;
    Ok(ReminderAppointment {
        id: r.get(0)?,
        case_id: r.get(1)?,
        kind: r.get(2)?,
        title: r.get(3)?,
        location: r.get(4)?,
        notes: r.get(5)?,
        local_start: r.get(6)?,
        time_zone: r.get(7)?,
        start_utc: r.get(8)?,
        critical: r.get::<_, i64>(9)? != 0,
        offsets: serde_json::from_str(&offsets_json).unwrap_or_default(),
        status: r.get(11)?,
        source: r.get(12)?,
        linked_record_id: r.get(13)?,
        revision: r.get(14)?,
        record_hash: r.get(15)?,
        created_at: r.get(16)?,
        updated_at: r.get(17)?,
    })
}

const APPT_COLS: &str = "id, case_id, kind, title, location, notes, local_start, time_zone, start_utc, critical,
    offsets_json, status, source, linked_record_id, revision, record_hash, created_at, updated_at";
const SLOT_COLS: &str = "id, appointment_id, appointment_revision, slot_kind, parent_slot_id, offset_minutes,
    fire_at_utc, label, critical, state, notification_id, acknowledged_at, ack_source, last_event, last_event_at";

fn row_to_slot(r: &rusqlite::Row) -> rusqlite::Result<ReminderSlot> {
    Ok(ReminderSlot {
        id: r.get(0)?,
        appointment_id: r.get(1)?,
        appointment_revision: r.get(2)?,
        slot_kind: r.get(3)?,
        parent_slot_id: r.get(4)?,
        offset_minutes: r.get(5)?,
        fire_at_utc: r.get(6)?,
        label: r.get(7)?,
        critical: r.get::<_, i64>(8)? != 0,
        state: r.get(9)?,
        notification_id: r.get(10)?,
        acknowledged_at: r.get(11)?,
        ack_source: r.get(12)?,
        last_event: r.get(13)?,
        last_event_at: r.get(14)?,
    })
}

fn get_appointment(conn: &rusqlite::Connection, id: &str) -> Result<Option<ReminderAppointment>, String> {
    let sql = format!("SELECT {APPT_COLS} FROM reminder_appointments WHERE id = ?1");
    match conn.query_row(&sql, [id], row_to_appointment) {
        Ok(a) => Ok(Some(a)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn slots_where(conn: &rusqlite::Connection, clause: &str, params: &[&dyn rusqlite::ToSql]) -> Result<Vec<ReminderSlot>, String> {
    let sql = format!("SELECT {SLOT_COLS} FROM reminder_slots {clause}");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params, row_to_slot).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn get_slot(conn: &rusqlite::Connection, id: &str) -> Result<ReminderSlot, String> {
    slots_where(conn, "WHERE id = ?1", &[&id])?
        .into_iter()
        .next()
        .ok_or_else(|| format!("Reminder not found: {id}"))
}

fn set_slot_state(conn: &rusqlite::Connection, id: &str, state: &str, event: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE reminder_slots SET state = ?2, last_event = ?3, last_event_at = ?4 WHERE id = ?1",
        rusqlite::params![id, state, event, Utc::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn audit(conn: &rusqlite::Connection, vault: &Path, record_type: &str, id: &str, payload: &impl Serialize, action: &str) -> Result<(), String> {
    let payload = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    audit_browser_record(conn, vault, record_type, id, &payload, action).map(|_| ())
}

/// Live (not yet resolved) slots for an appointment, used for supersede/cancel.
fn open_slots(conn: &rusqlite::Connection, appointment_id: &str) -> Result<Vec<ReminderSlot>, String> {
    slots_where(
        conn,
        "WHERE appointment_id = ?1 AND state IN ('pending','os_scheduled','schedule_failed','fired')",
        &[&appointment_id],
    )
}

// ─── Commands ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_reminder_settings(db: State<DbConn>) -> Result<ReminderSettings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(load_settings(&conn))
}

#[tauri::command]
pub fn save_reminder_settings(db: State<DbConn>, vault: State<VaultRoot>, settings: ReminderSettings) -> Result<ReminderSettings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut s = settings;
    s.court_offsets = normalized_offsets(s.court_offsets);
    s.appointment_offsets = normalized_offsets(s.appointment_offsets);
    s.escalation_minutes.retain(|m| *m > 0 && *m <= 240);
    if s.court_offsets.is_empty() {
        return Err("Court reminders need at least one interval.".into());
    }
    s.last_device_time_zone = load_settings(&conn).last_device_time_zone;
    store_settings(&conn, &s)?;
    audit(&conn, &vault.0, "reminder_settings", "settings", &s, "REMINDER_SETTINGS_SAVED")?;
    Ok(s)
}

#[tauri::command]
pub fn save_reminder_appointment(db: State<DbConn>, vault: State<VaultRoot>, item: ReminderAppointment) -> Result<SaveResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    save_appointment_impl(&conn, &vault.0, item, Utc::now())
}

pub fn save_appointment_impl(conn: &rusqlite::Connection, vault: &Path, item: ReminderAppointment, now: DateTime<Utc>) -> Result<SaveResult, String> {
    let conn = conn;
    let settings = load_settings(&conn);
    let mut appt = item;
    if appt.title.trim().is_empty() {
        return Err("A title is required.".into());
    }
    let kinds = ["court", "attorney", "appointment", "deadline", "other"];
    if !kinds.contains(&appt.kind.as_str()) {
        return Err(format!("Unknown appointment kind: {}", appt.kind));
    }
    let (start_utc, warning) = local_to_utc(&appt.local_start, &appt.time_zone)?;
    let previous = if appt.id.trim().is_empty() { None } else { get_appointment(&conn, &appt.id)? };
    if appt.id.trim().is_empty() {
        appt.id = uuid::Uuid::new_v4().to_string();
    }
    if appt.case_id.trim().is_empty() {
        appt.case_id = "primary".into();
    }
    if appt.source.trim().is_empty() {
        appt.source = "user_entered".into();
    }
    if appt.kind == "court" {
        appt.critical = true;
    }
    if appt.offsets.is_empty() {
        appt.offsets = if appt.kind == "court" { settings.court_offsets.clone() } else { settings.appointment_offsets.clone() };
    }
    appt.offsets = normalized_offsets(appt.offsets);
    if appt.status != "confirmed" && appt.status != "cancelled" {
        appt.status = "draft".into();
    }
    appt.start_utc = start_utc.to_rfc3339();
    appt.revision = previous.as_ref().map(|p| p.revision + 1).unwrap_or(1);
    appt.created_at = previous.as_ref().map(|p| p.created_at.clone()).unwrap_or_else(|| now.to_rfc3339());
    appt.updated_at = now.to_rfc3339();
    appt.record_hash = appointment_hash(&appt);

    conn.execute(
        &format!("INSERT OR REPLACE INTO reminder_appointments ({APPT_COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)"),
        rusqlite::params![
            appt.id, appt.case_id, appt.kind, appt.title, appt.location, appt.notes, appt.local_start, appt.time_zone,
            appt.start_utc, appt.critical as i64, serde_json::to_string(&appt.offsets).map_err(|e| e.to_string())?,
            appt.status, appt.source, appt.linked_record_id, appt.revision, appt.record_hash, appt.created_at, appt.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    // Any earlier revision's open slots are superseded, never silently deleted.
    let mut cancel_ids = Vec::new();
    for slot in open_slots(&conn, &appt.id)? {
        set_slot_state(&conn, &slot.id, "superseded", "appointment_revised")?;
        cancel_ids.push(slot.notification_id);
    }

    let mut slots = Vec::new();
    if appt.status == "confirmed" {
        let escalation = if settings.escalation_enabled { settings.escalation_minutes.clone() } else { vec![] };
        slots = build_slots(&appt, start_utc, &escalation, now);
        for s in &slots {
            conn.execute(
                &format!("INSERT OR REPLACE INTO reminder_slots ({SLOT_COLS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)"),
                rusqlite::params![
                    s.id, s.appointment_id, s.appointment_revision, s.slot_kind, s.parent_slot_id, s.offset_minutes,
                    s.fire_at_utc, s.label, s.critical as i64, s.state, s.notification_id, s.acknowledged_at,
                    s.ack_source, "computed", now.to_rfc3339()
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let action = match (previous.is_some(), appt.status.as_str()) {
        (_, "cancelled") => "REMINDER_APPOINTMENT_CANCELLED",
        (_, "confirmed") => "REMINDER_APPOINTMENT_CONFIRMED",
        (true, _) => "REMINDER_APPOINTMENT_REVISED",
        (false, _) => "REMINDER_APPOINTMENT_CREATED",
    };
    let payload = serde_json::json!({ "appointment": &appt, "previous_hash": previous.as_ref().map(|p| p.record_hash.clone()), "slots": &slots, "superseded_notification_ids": &cancel_ids });
    audit(&conn, vault, "reminder_appointment", &appt.id, &payload, action)?;

    let mut warnings: Vec<String> = warning.into_iter().collect();
    if appt.status == "confirmed" && slots.iter().all(|s| s.state != "pending") {
        warnings.push("Every reminder time for this appointment has already passed.".into());
    }
    Ok(SaveResult { appointment: appt, slots, cancel_notification_ids: cancel_ids, warnings })
}

#[tauri::command]
pub fn cancel_reminder_appointment(db: State<DbConn>, vault: State<VaultRoot>, id: String, reason: String) -> Result<SaveResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    cancel_appointment_impl(&conn, &vault.0, &id, &reason)
}

pub fn cancel_appointment_impl(conn: &rusqlite::Connection, vault: &Path, id: &str, reason: &str) -> Result<SaveResult, String> {
    let mut appt = get_appointment(conn, id)?.ok_or("Appointment not found")?;
    let mut cancel_ids = Vec::new();
    for slot in open_slots(conn, id)? {
        set_slot_state(conn, &slot.id, "cancelled", "appointment_cancelled")?;
        cancel_ids.push(slot.notification_id);
    }
    appt.status = "cancelled".into();
    appt.revision += 1;
    appt.updated_at = Utc::now().to_rfc3339();
    appt.record_hash = appointment_hash(&appt);
    conn.execute(
        "UPDATE reminder_appointments SET status = ?2, revision = ?3, updated_at = ?4, record_hash = ?5 WHERE id = ?1",
        rusqlite::params![appt.id, appt.status, appt.revision, appt.updated_at, appt.record_hash],
    )
    .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "appointment": &appt, "reason": reason, "cancelled_notification_ids": &cancel_ids });
    audit(conn, vault, "reminder_appointment", id, &payload, "REMINDER_APPOINTMENT_CANCELLED")?;
    Ok(SaveResult { appointment: appt, slots: vec![], cancel_notification_ids: cancel_ids, warnings: vec![] })
}

#[tauri::command]
pub fn get_reminder_appointments(db: State<DbConn>) -> Result<Vec<ReminderAppointment>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {APPT_COLS} FROM reminder_appointments ORDER BY start_utc ASC");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_appointment).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Slots of the current revision of every non-cancelled appointment.
#[tauri::command]
pub fn get_reminder_slots(db: State<DbConn>, appointment_id: Option<String>) -> Result<Vec<ReminderSlot>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    match appointment_id {
        Some(id) => slots_where(&conn, "WHERE appointment_id = ?1 ORDER BY fire_at_utc", &[&id]),
        None => slots_where(
            &conn,
            "WHERE state NOT IN ('superseded','cancelled') ORDER BY fire_at_utc",
            &[],
        ),
    }
}

/// Device-side delivery events: os_scheduled | schedule_failed | fired | os_delivered.
#[tauri::command]
pub fn record_reminder_event(db: State<DbConn>, vault: State<VaultRoot>, slot_id: String, event: String, detail: Option<String>) -> Result<ReminderSlot, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let slot = get_slot(&conn, &slot_id)?;
    let next_state = match event.as_str() {
        "os_scheduled" => "os_scheduled",
        "schedule_failed" => "schedule_failed",
        "fired" | "os_delivered" => "fired",
        other => return Err(format!("Unknown reminder event: {other}")),
    };
    // Never move a resolved slot backwards.
    let resolved = ["acknowledged", "not_needed", "superseded", "cancelled", "skipped_past"];
    if !resolved.contains(&slot.state.as_str()) && !(slot.state == "fired" && next_state == "os_scheduled") {
        set_slot_state(&conn, &slot_id, next_state, &event)?;
    }
    let payload = serde_json::json!({ "slot_id": slot_id, "event": event, "detail": detail, "previous_state": slot.state, "at": Utc::now().to_rfc3339() });
    audit(&conn, &vault.0, "reminder_slot", &slot_id, &payload, &format!("REMINDER_{}", event.to_ascii_uppercase()))?;
    get_slot(&conn, &slot_id)
}

/// "Seen it". Notification delivery alone never counts as acknowledgment.
#[tauri::command]
pub fn acknowledge_reminder(db: State<DbConn>, vault: State<VaultRoot>, slot_id: String, source: String) -> Result<AckResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    acknowledge_impl(&conn, &vault.0, &slot_id, &source)
}

pub fn acknowledge_impl(conn: &rusqlite::Connection, vault: &Path, slot_id: &str, source: &str) -> Result<AckResult, String> {
    let conn = conn;
    let slot = get_slot(&conn, &slot_id)?;
    let root_id = slot.parent_slot_id.clone().unwrap_or_else(|| slot.id.clone());
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE reminder_slots SET state = 'acknowledged', acknowledged_at = ?2, ack_source = ?3, last_event = 'acknowledged', last_event_at = ?2
         WHERE id = ?1",
        rusqlite::params![root_id, now, source],
    )
    .map_err(|e| e.to_string())?;
    let mut cancel_ids = Vec::new();
    for esc in slots_where(&conn, "WHERE parent_slot_id = ?1", &[&root_id])? {
        if esc.id == slot.id {
            conn.execute(
                "UPDATE reminder_slots SET state = 'acknowledged', acknowledged_at = ?2, ack_source = ?3 WHERE id = ?1",
                rusqlite::params![esc.id, now, source],
            )
            .map_err(|e| e.to_string())?;
        } else if ["pending", "os_scheduled", "schedule_failed", "fired"].contains(&esc.state.as_str()) {
            set_slot_state(&conn, &esc.id, "not_needed", "parent_acknowledged")?;
        }
        cancel_ids.push(esc.notification_id);
    }
    cancel_ids.push(slot.notification_id);
    let payload = serde_json::json!({ "slot_id": slot_id, "root_slot_id": root_id, "source": source, "acknowledged_at": now, "cancelled_notification_ids": &cancel_ids });
    audit(conn, vault, "reminder_slot", &root_id, &payload, "REMINDER_ACKNOWLEDGED")?;
    Ok(AckResult { slot: get_slot(&conn, &root_id)?, cancel_notification_ids: cancel_ids })
}

/// Due and not yet acknowledged (for the desktop runner and in-app banner).
#[tauri::command]
pub fn get_due_reminders(db: State<DbConn>) -> Result<Vec<ReminderSlot>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    slots_where(
        &conn,
        "WHERE fire_at_utc <= ?1 AND state IN ('pending','os_scheduled','schedule_failed','fired') ORDER BY fire_at_utc",
        &[&now],
    )
}

#[tauri::command]
pub fn record_device_time_zone(db: State<DbConn>, vault: State<VaultRoot>, time_zone: String) -> Result<TimeZoneCheck, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    if time_zone.parse::<Tz>().is_err() {
        return Err(format!("Unknown time zone: {time_zone}"));
    }
    let mut settings = load_settings(&conn);
    let previous = settings.last_device_time_zone.clone();
    let changed = previous.as_deref().is_some_and(|p| p != time_zone);
    if previous.as_deref() != Some(time_zone.as_str()) {
        settings.last_device_time_zone = Some(time_zone.clone());
        store_settings(&conn, &settings)?;
        let payload = serde_json::json!({ "previous": previous, "current": time_zone, "at": Utc::now().to_rfc3339() });
        let action = if changed { "DEVICE_TIME_ZONE_CHANGED" } else { "DEVICE_TIME_ZONE_RECORDED" };
        audit(&conn, &vault.0, "reminder_settings", "device_time_zone", &payload, action)?;
    }
    Ok(TimeZoneCheck { changed, previous, current: time_zone })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn court(offsets: Vec<i64>) -> ReminderAppointment {
        ReminderAppointment {
            id: "a1".into(), case_id: "primary".into(), kind: "court".into(), title: "Status hearing".into(),
            location: String::new(), notes: String::new(), local_start: "2026-11-20T09:00".into(),
            time_zone: "America/Denver".into(), start_utc: String::new(), critical: true, offsets,
            status: "confirmed".into(), source: "test".into(), linked_record_id: None, revision: 1,
            record_hash: String::new(), created_at: String::new(), updated_at: String::new(),
        }
    }

    #[test]
    fn court_local_time_converts_with_venue_zone() {
        let (utc, warn) = local_to_utc("2026-11-20T09:00", "America/Denver").unwrap();
        assert_eq!(utc.to_rfc3339(), "2026-11-20T16:00:00+00:00"); // MST = UTC-7
        assert!(warn.is_none());
        let (summer, _) = local_to_utc("2026-07-20T09:00", "America/Denver").unwrap();
        assert_eq!(summer.to_rfc3339(), "2026-07-20T15:00:00+00:00"); // MDT = UTC-6
    }

    #[test]
    fn dst_gap_is_rejected_and_overlap_warns() {
        assert!(local_to_utc("2026-03-08T02:30", "America/Denver").is_err());
        let (_, warn) = local_to_utc("2026-11-01T01:30", "America/Denver").unwrap();
        assert!(warn.is_some());
        assert!(local_to_utc("2026-11-20T09:00", "Mars/Olympus").is_err());
    }

    #[test]
    fn default_court_sequence_with_escalations() {
        let appt = court(DEFAULT_COURT_OFFSETS.to_vec());
        let (start, _) = local_to_utc(&appt.local_start, &appt.time_zone).unwrap();
        let now = start - Duration::days(30);
        let slots = build_slots(&appt, start, &DEFAULT_ESCALATION_MINUTES, now);
        let reminders: Vec<_> = slots.iter().filter(|s| s.slot_kind == "reminder").collect();
        assert_eq!(reminders.len(), 5);
        assert_eq!(reminders[0].label, "Advance notice (7 days)");
        assert_eq!(reminders[4].label, "Final reminder (1 hour)");
        // 1-hour reminder: +10 and +30 min escalations still before start.
        let final_esc = slots.iter().filter(|s| s.parent_slot_id.as_deref() == Some(reminders[4].id.as_str())).count();
        assert_eq!(final_esc, 2);
        assert!(slots.windows(2).all(|w| w[0].fire_at_utc <= w[1].fire_at_utc));
        let ids: std::collections::HashSet<_> = slots.iter().map(|s| s.notification_id).collect();
        assert_eq!(ids.len(), slots.len());
        assert!(slots.iter().all(|s| s.notification_id > 0));
    }

    #[test]
    fn past_reminders_are_skipped_not_scheduled() {
        let appt = court(DEFAULT_COURT_OFFSETS.to_vec());
        let (start, _) = local_to_utc(&appt.local_start, &appt.time_zone).unwrap();
        let now = start - Duration::hours(2);
        let slots = build_slots(&appt, start, &DEFAULT_ESCALATION_MINUTES, now);
        let pending: Vec<_> = slots.iter().filter(|s| s.slot_kind == "reminder" && s.state == "pending").collect();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].offset_minutes, 60);
    }

    #[test]
    fn offsets_are_cleaned_and_ordered() {
        assert_eq!(normalized_offsets(vec![60, 0, -5, 1440, 60, 180]), vec![1440, 180, 60]);
    }

    fn test_db() -> (rusqlite::Connection, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("pops-reminder-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("browser_records")).unwrap();
        let conn = crate::init_db(":memory:");
        (conn, root)
    }

    fn count(conn: &rusqlite::Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn confirm_revise_acknowledge_cancel_are_audited_and_never_silently_overwritten() {
        let (conn, root) = test_db();
        let now = Utc::now();
        let start = now + Duration::days(10);
        let tz = "America/Denver";
        let local = start.with_timezone(&tz.parse::<Tz>().unwrap()).format("%Y-%m-%dT%H:%M").to_string();
        let mut item = court(vec![]);
        item.id = String::new();
        item.local_start = local;
        let saved = save_appointment_impl(&conn, &root, item, now).unwrap();
        assert_eq!(saved.appointment.offsets, DEFAULT_COURT_OFFSETS.to_vec());
        assert!(saved.appointment.critical);
        let first_ids: Vec<i32> = saved.slots.iter().map(|s| s.notification_id).collect();
        assert_eq!(saved.slots.iter().filter(|s| s.slot_kind == "reminder").count(), 5);

        // Revision: old slots superseded (kept), their OS ids returned for cancellation.
        let mut revised = saved.appointment.clone();
        revised.location = "Courtroom 4B".into();
        let r2 = save_appointment_impl(&conn, &root, revised, now).unwrap();
        assert_eq!(r2.appointment.revision, 2);
        assert_eq!(r2.cancel_notification_ids.len(), first_ids.len());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reminder_slots WHERE state = 'superseded'"), first_ids.len() as i64);

        // Acknowledging a reminder resolves its escalations.
        let final_slot = r2.slots.iter().find(|s| s.slot_kind == "reminder" && s.offset_minutes == 60).unwrap();
        let esc = r2.slots.iter().find(|s| s.parent_slot_id.as_deref() == Some(final_slot.id.as_str())).unwrap();
        let ack = acknowledge_impl(&conn, &root, &esc.id, "test").unwrap();
        assert_eq!(ack.slot.id, final_slot.id);
        assert_eq!(ack.slot.state, "acknowledged");
        assert!(ack.cancel_notification_ids.contains(&esc.notification_id));
        assert_eq!(count(&conn, &format!("SELECT COUNT(*) FROM reminder_slots WHERE parent_slot_id = '{}' AND state IN ('pending','os_scheduled')", final_slot.id)), 0);

        // Cancel keeps the appointment row and records the reason.
        let c = cancel_appointment_impl(&conn, &root, &r2.appointment.id, "Rescheduled").unwrap();
        assert_eq!(c.appointment.status, "cancelled");
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM reminder_appointments"), 1);

        // Every step is chained into the audit ledger and mirrored in the vault.
        let actions: Vec<String> = conn.prepare("SELECT action FROM audit_ledger ORDER BY created_at").unwrap()
            .query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        for a in ["REMINDER_APPOINTMENT_CONFIRMED", "REMINDER_ACKNOWLEDGED", "REMINDER_APPOINTMENT_CANCELLED"] {
            assert!(actions.iter().any(|x| x == a), "missing {a} in {actions:?}");
        }
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM audit_ledger WHERE ledger_entry_hash IS NULL"), 0);
        assert!(root.join("browser_records").join("reminder_appointment").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn tables_create_idempotently() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_reminder_tables(&conn).unwrap();
        init_reminder_tables(&conn).unwrap();
        assert_eq!(load_settings(&conn), ReminderSettings::default());
    }
}
