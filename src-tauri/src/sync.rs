//! POPS desktop <-> phone sync (Phase 2).
//!
//! - The desktop is the authoritative schedule. Phones pair once with a code.
//! - Every message is end-to-end encrypted and authenticated with ChaCha20-Poly1305,
//!   using a key derived from the pairing secret, and bound to the peer id and a timestamp
//!   (5-minute replay window). This holds on the LAN, and through Cloudflare Tunnel
//!   the TLS layer is added on top.
//! - A change made on both sides since the last agreed version is never overwritten:
//!   it becomes a `sync_conflicts` row that the user resolves.
//! - Vault law: tables live in the vault database; every accept, conflict and
//!   resolution is chained into `audit_ledger`.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{aead::{Aead, KeyInit, Payload}, ChaCha20Poly1305, Nonce};
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use super::reminders::{self, ReminderAppointment};
use super::{audit_browser_record, DbConn, VaultRoot};

pub const SYNC_PORT: u16 = 47615;
const PATH: &str = "/pops-sync/v1/exchange";
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn init_sync_tables(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sync_peers (
            id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, secret_b64 TEXT NOT NULL,
            urls_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, last_sync_at TEXT,
            last_cursor TEXT, revoked INTEGER NOT NULL DEFAULT 0);
         CREATE TABLE IF NOT EXISTS sync_state (
            appointment_id TEXT PRIMARY KEY, synced_hash TEXT NOT NULL, synced_at TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS sync_conflicts (
            id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, side TEXT NOT NULL,
            local_json TEXT NOT NULL, remote_json TEXT NOT NULL, detected_at TEXT NOT NULL,
            resolved_at TEXT, resolution TEXT);",
    )
}

// ─── Wire types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneChange { pub appointment: ReminderAppointment, pub base_hash: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AckItem { pub slot_id: String, pub source: String }

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRequest { pub since: Option<String>, pub changes: Vec<PhoneChange>, pub acks: Vec<AckItem> }

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeResponse { pub server_time: String, pub appointments: Vec<ReminderAppointment>, pub accepted: Vec<String>, pub conflicts: Vec<String>, pub acks_applied: usize }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope { v: u8, peer_id: String, ts: i64, nonce: String, ct: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCode { pub v: u8, pub peer_id: String, pub secret: String, pub urls: Vec<String>, pub desktop_name: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPeer { pub id: String, pub role: String, pub name: String, pub urls: Vec<String>, pub created_at: String, pub last_sync_at: Option<String>, pub revoked: bool }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict { pub id: String, pub appointment_id: String, pub side: String, pub local: ReminderAppointment, pub remote: ReminderAppointment, pub detected_at: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome { pub url: String, pub received: usize, pub applied: usize, pub sent: usize, pub accepted: usize, pub conflicts: usize, pub acks_sent: usize, pub cancel_notification_ids: Vec<i32> }

// ─── Crypto ────────────────────────────────────────────────────────

fn cipher(secret_b64: &str) -> Result<ChaCha20Poly1305, String> {
    let secret = B64.decode(secret_b64).map_err(|_| "Bad pairing secret")?;
    let key = Sha256::digest([b"pops-sync-v1".as_slice(), &secret].concat());
    ChaCha20Poly1305::new_from_slice(&key).map_err(|e| e.to_string())
}

pub fn seal(peer_id: &str, secret_b64: &str, plaintext: &[u8]) -> Result<String, String> {
    let ts = Utc::now().timestamp();
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let aad = format!("{peer_id}|{ts}");
    let ct = cipher(secret_b64)?
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad: aad.as_bytes() })
        .map_err(|_| "encrypt failed")?;
    serde_json::to_string(&Envelope { v: 1, peer_id: peer_id.into(), ts, nonce: B64.encode(nonce), ct: B64.encode(ct) }).map_err(|e| e.to_string())
}

/// Returns (peer_id, plaintext). `secret_for` looks up the pairing secret of a non-revoked peer.
pub fn open(body: &str, secret_for: impl Fn(&str) -> Option<String>) -> Result<(String, Vec<u8>), String> {
    let env: Envelope = serde_json::from_str(body).map_err(|_| "Malformed sync message")?;
    if (Utc::now().timestamp() - env.ts).abs() > 300 {
        return Err("Sync message expired. Check that both devices show the correct time.".into());
    }
    let secret = secret_for(&env.peer_id).ok_or("Unknown or revoked device. Pair again.")?;
    let nonce = B64.decode(&env.nonce).map_err(|_| "Malformed nonce")?;
    if nonce.len() != 12 {
        return Err("Malformed nonce".into());
    }
    let ct = B64.decode(&env.ct).map_err(|_| "Malformed payload")?;
    let aad = format!("{}|{}", env.peer_id, env.ts);
    let pt = cipher(&secret)?
        .decrypt(Nonce::from_slice(&nonce), Payload { msg: &ct, aad: aad.as_bytes() })
        .map_err(|_| "Sync message failed authentication")?;
    Ok((env.peer_id, pt))
}

// ─── Storage helpers ───────────────────────────────────────────────

fn audit(conn: &rusqlite::Connection, vault: &Path, id: &str, payload: serde_json::Value, action: &str) -> Result<(), String> {
    audit_browser_record(conn, vault, "sync_event", id, &payload.to_string(), action).map(|_| ())
}

fn peer_secret(conn: &rusqlite::Connection, id: &str) -> Option<String> {
    conn.query_row("SELECT secret_b64 FROM sync_peers WHERE id = ?1 AND revoked = 0", [id], |r| r.get(0)).ok()
}

fn synced_hash(conn: &rusqlite::Connection, id: &str) -> Option<String> {
    conn.query_row("SELECT synced_hash FROM sync_state WHERE appointment_id = ?1", [id], |r| r.get(0)).ok()
}

fn mark_synced(conn: &rusqlite::Connection, id: &str, hash: &str) -> Result<(), String> {
    conn.execute("INSERT OR REPLACE INTO sync_state (appointment_id, synced_hash, synced_at) VALUES (?1, ?2, ?3)", rusqlite::params![id, hash, Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
    Ok(())
}

fn record_conflict(conn: &rusqlite::Connection, vault: &Path, side: &str, local: &ReminderAppointment, remote: &ReminderAppointment) -> Result<(), String> {
    let open: i64 = conn.query_row("SELECT COUNT(*) FROM sync_conflicts WHERE appointment_id = ?1 AND resolved_at IS NULL AND remote_json LIKE ?2", rusqlite::params![local.id, format!("%{}%", remote.record_hash)], |r| r.get(0)).unwrap_or(0);
    if open > 0 {
        return Ok(());
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO sync_conflicts (id, appointment_id, side, local_json, remote_json, detected_at) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![id, local.id, side, serde_json::to_string(local).unwrap(), serde_json::to_string(remote).unwrap(), Utc::now().to_rfc3339()],
    ).map_err(|e| e.to_string())?;
    audit(conn, vault, &id, serde_json::json!({ "appointment_id": local.id, "side": side, "local_hash": local.record_hash, "remote_hash": remote.record_hash }), "SYNC_CONFLICT_DETECTED")
}

// ─── Exchange logic (pure DB, unit tested) ─────────────────────────

/// Desktop side: apply phone changes and acks, return the authoritative schedule.
pub fn handle_exchange(conn: &rusqlite::Connection, vault: &Path, peer_id: &str, req: ExchangeRequest) -> Result<ExchangeResponse, String> {
    let mut resp = ExchangeResponse { server_time: Utc::now().to_rfc3339(), ..Default::default() };
    for change in req.changes {
        let current = reminders::appointment_by_id(conn, &change.appointment.id)?;
        let unchanged_on_desktop = match (&current, &change.base_hash) {
            (None, _) => true,
            (Some(c), Some(base)) => &c.record_hash == base,
            (Some(_), None) => false,
        };
        if current.as_ref().is_some_and(|c| c.record_hash == change.appointment.record_hash) {
            continue;
        }
        if unchanged_on_desktop {
            let mut item = change.appointment.clone();
            item.source = format!("phone_sync:{peer_id}");
            let saved = reminders::save_appointment_impl(conn, vault, item, Utc::now())?;
            mark_synced(conn, &saved.appointment.id, &saved.appointment.record_hash)?;
            resp.accepted.push(saved.appointment.id);
        } else {
            record_conflict(conn, vault, "desktop", current.as_ref().unwrap(), &change.appointment)?;
            resp.conflicts.push(change.appointment.id.clone());
        }
    }
    for ack in req.acks {
        if reminders::slot_is_open(conn, &ack.slot_id) {
            reminders::acknowledge_impl(conn, vault, &ack.slot_id, &format!("sync:{peer_id}:{}", ack.source))?;
            resp.acks_applied += 1;
        }
    }
    resp.appointments = reminders::appointments_updated_since(conn, req.since.as_deref())?;
    for a in &resp.appointments {
        if !resp.conflicts.contains(&a.id) {
            mark_synced(conn, &a.id, &a.record_hash)?;
        }
    }
    audit(conn, vault, peer_id, serde_json::json!({ "accepted": resp.accepted, "conflicts": resp.conflicts, "acks_applied": resp.acks_applied, "sent": resp.appointments.len() }), "SYNC_EXCHANGE_SERVED")?;
    Ok(resp)
}

/// Phone side: build the request from local changes since the last agreed versions.
pub fn build_request(conn: &rusqlite::Connection, since: Option<String>) -> Result<ExchangeRequest, String> {
    let mut changes = Vec::new();
    for a in reminders::appointments_updated_since(conn, None)? {
        let base = synced_hash(conn, &a.id);
        // Anything that differs from the last version both sides agreed on is a local change.
        if base.as_deref() != Some(a.record_hash.as_str()) {
            changes.push(PhoneChange { appointment: a, base_hash: base });
        }
    }
    let acks = reminders::slots_acknowledged_since(conn, since.as_deref())?
        .into_iter()
        .map(|s| AckItem { slot_id: s.id, source: s.ack_source.unwrap_or_default() })
        .collect();
    Ok(ExchangeRequest { since, changes, acks })
}

/// Phone side: apply the desktop's authoritative versions; flag true conflicts.
pub fn apply_response(conn: &rusqlite::Connection, vault: &Path, peer_id: &str, resp: &ExchangeResponse) -> Result<(usize, Vec<i32>), String> {
    let mut applied = 0;
    let mut cancel_ids = Vec::new();
    for remote in &resp.appointments {
        let local = reminders::appointment_by_id(conn, &remote.id)?;
        let base = synced_hash(conn, &remote.id);
        let take_remote = match &local {
            None => true,
            Some(l) if l.record_hash == remote.record_hash => { mark_synced(conn, &remote.id, &remote.record_hash)?; false }
            Some(l) => resp.accepted.contains(&remote.id) || base.as_deref() == Some(l.record_hash.as_str()),
        };
        if take_remote {
            let mut r = remote.clone();
            r.source = if r.source.starts_with("desktop_sync") { r.source.clone() } else { format!("desktop_sync:{}", r.source) };
            // Source is not part of the record hash, so the desktop's hash still verifies.
            let res = reminders::apply_remote_appointment(conn, vault, &r, peer_id)?;
            cancel_ids.extend(res.cancel_notification_ids);
            mark_synced(conn, &remote.id, &remote.record_hash)?;
            applied += 1;
        } else if let Some(l) = &local {
            if l.record_hash != remote.record_hash && !resp.conflicts.contains(&remote.id) {
                record_conflict(conn, vault, "phone", l, remote)?;
            }
        }
    }
    Ok((applied, cancel_ids))
}

// ─── HTTP server (desktop) ─────────────────────────────────────────

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
}

fn read_request(stream: &mut TcpStream) -> Result<(String, String), String> {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(15))).ok();
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let header_end = loop {
        let n = stream.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 { return Err("connection closed".into()); }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") { break i + 4; }
        if buf.len() > 16_384 { return Err("headers too large".into()); }
    };
    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let request_line = head.lines().next().unwrap_or("").to_string();
    let len: usize = head.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse().unwrap_or(0))).unwrap_or(0);
    if len > 4 * 1024 * 1024 { return Err("body too large".into()); }
    while buf.len() < header_end + len {
        let n = stream.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        buf.extend_from_slice(&chunk[..n]);
    }
    Ok((request_line, String::from_utf8_lossy(&buf[header_end..(header_end + len).min(buf.len())]).to_string()))
}

fn serve_connection(app: &AppHandle, mut stream: TcpStream) {
    let (line, body) = match read_request(&mut stream) { Ok(v) => v, Err(_) => return };
    if !line.starts_with(&format!("POST {PATH}")) {
        return respond(&mut stream, "404 Not Found", "{\"error\":\"not found\"}");
    }
    let db = app.state::<DbConn>();
    let vault = app.state::<VaultRoot>();
    let result = (|| -> Result<String, String> {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let (peer, pt) = open(&body, |id| peer_secret(&conn, id))?;
        let req: ExchangeRequest = serde_json::from_slice(&pt).map_err(|_| "Malformed request")?;
        let resp = handle_exchange(&conn, &vault.0, &peer, req)?;
        conn.execute("UPDATE sync_peers SET last_sync_at = ?2 WHERE id = ?1", rusqlite::params![peer, Utc::now().to_rfc3339()]).ok();
        let secret = peer_secret(&conn, &peer).ok_or("revoked")?;
        seal(&peer, &secret, serde_json::to_string(&resp).map_err(|e| e.to_string())?.as_bytes())
    })();
    match result {
        Ok(sealed) => respond(&mut stream, "200 OK", &sealed),
        Err(e) => respond(&mut stream, "403 Forbidden", &serde_json::json!({ "error": e }).to_string()),
    }
}

fn lan_urls() -> Vec<String> {
    let ip = std::net::UdpSocket::bind("0.0.0.0:0").and_then(|s| { s.connect("8.8.8.8:80")?; s.local_addr() }).map(|a| a.ip().to_string()).ok();
    ip.into_iter().map(|ip| format!("http://{ip}:{SYNC_PORT}{PATH}")).collect()
}

// ─── Commands ──────────────────────────────────────────────────────

#[tauri::command]
pub fn sync_start_server(app: AppHandle) -> Result<Vec<String>, String> {
    if SERVER_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(lan_urls());
    }
    let listener = TcpListener::bind(("0.0.0.0", SYNC_PORT)).map_err(|e| { SERVER_RUNNING.store(false, Ordering::SeqCst); format!("Could not open sync port {SYNC_PORT}: {e}") })?;
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || serve_connection(&app, stream));
        }
    });
    Ok(lan_urls())
}

#[tauri::command]
pub fn sync_create_pairing(db: State<DbConn>, vault: State<VaultRoot>, device_name: String, remote_url: Option<String>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut secret = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut secret);
    let peer_id = uuid::Uuid::new_v4().to_string();
    let mut urls = Vec::new();
    if let Some(r) = remote_url.filter(|r| r.starts_with("https://")) {
        urls.push(format!("{}{PATH}", r.trim_end_matches('/')));
    }
    urls.extend(lan_urls());
    let code = PairingCode { v: 1, peer_id: peer_id.clone(), secret: B64.encode(secret), urls: urls.clone(), desktop_name: "POPS Desktop".into() };
    conn.execute("INSERT INTO sync_peers (id, role, name, secret_b64, urls_json, created_at) VALUES (?1,'phone',?2,?3,'[]',?4)", rusqlite::params![peer_id, device_name, code.secret, Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
    audit(&conn, &vault.0, &peer_id, serde_json::json!({ "device_name": device_name, "urls": urls }), "SYNC_PAIRING_CREATED")?;
    Ok(format!("POPS1.{}", B64.encode(serde_json::to_vec(&code).map_err(|e| e.to_string())?)))
}

#[tauri::command]
pub fn sync_join_pairing(db: State<DbConn>, vault: State<VaultRoot>, code: String) -> Result<SyncPeer, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let raw = code.trim().strip_prefix("POPS1.").ok_or("This is not a POPS pairing code")?;
    let pc: PairingCode = serde_json::from_slice(&B64.decode(raw).map_err(|_| "Pairing code is damaged")?).map_err(|_| "Pairing code is damaged")?;
    conn.execute("INSERT OR REPLACE INTO sync_peers (id, role, name, secret_b64, urls_json, created_at) VALUES (?1,'desktop',?2,?3,?4,?5)", rusqlite::params![pc.peer_id, pc.desktop_name, pc.secret, serde_json::to_string(&pc.urls).unwrap(), Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
    audit(&conn, &vault.0, &pc.peer_id, serde_json::json!({ "desktop": pc.desktop_name, "urls": pc.urls }), "SYNC_PAIRING_JOINED")?;
    Ok(SyncPeer { id: pc.peer_id, role: "desktop".into(), name: pc.desktop_name, urls: pc.urls, created_at: Utc::now().to_rfc3339(), last_sync_at: None, revoked: false })
}

#[tauri::command]
pub fn sync_list_peers(db: State<DbConn>) -> Result<Vec<SyncPeer>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, role, name, urls_json, created_at, last_sync_at, revoked FROM sync_peers ORDER BY created_at").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(SyncPeer { id: r.get(0)?, role: r.get(1)?, name: r.get(2)?, urls: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(), created_at: r.get(4)?, last_sync_at: r.get(5)?, revoked: r.get::<_, i64>(6)? != 0 })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_revoke_peer(db: State<DbConn>, vault: State<VaultRoot>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE sync_peers SET revoked = 1 WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    audit(&conn, &vault.0, &id, serde_json::json!({ "revoked": id }), "SYNC_PEER_REVOKED")
}

/// Phone: exchange with the paired desktop (remote tunnel URL first, then same Wi-Fi).
#[tauri::command]
pub async fn sync_now(app: AppHandle) -> Result<SyncOutcome, String> {
    let (peer, secret, urls, cursor, sealed, req_counts) = {
        let db = app.state::<DbConn>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let (id, secret, urls_json, cursor): (String, String, String, Option<String>) = conn
            .query_row("SELECT id, secret_b64, urls_json, last_cursor FROM sync_peers WHERE role = 'desktop' AND revoked = 0 ORDER BY created_at DESC LIMIT 1", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(|_| "This phone is not paired with a desktop yet.")?;
        let req = build_request(&conn, cursor.clone())?;
        let counts = (req.changes.len(), req.acks.len());
        let sealed = seal(&id, &secret, serde_json::to_string(&req).map_err(|e| e.to_string())?.as_bytes())?;
        (id, secret, serde_json::from_str::<Vec<String>>(&urls_json).unwrap_or_default(), cursor, sealed, counts)
    };
    let _ = cursor;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let mut last_err = "No desktop address in the pairing code.".to_string();
    for url in urls {
        let body = match client.post(&url).body(sealed.clone()).send().await {
            Ok(r) if r.status().is_success() => r.text().await.map_err(|e| e.to_string())?,
            Ok(r) => { last_err = format!("{url}: {}", r.text().await.unwrap_or_default()); continue; }
            Err(e) => { last_err = format!("{url}: {e}"); continue; }
        };
        let (_, pt) = open(&body, |_| Some(secret.clone()))?;
        let resp: ExchangeResponse = serde_json::from_slice(&pt).map_err(|_| "Malformed desktop response")?;
        let db = app.state::<DbConn>();
        let vault = app.state::<VaultRoot>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let (applied, cancel_ids) = apply_response(&conn, &vault.0, &peer, &resp)?;
        conn.execute("UPDATE sync_peers SET last_sync_at = ?2, last_cursor = ?3 WHERE id = ?1", rusqlite::params![peer, Utc::now().to_rfc3339(), resp.server_time]).map_err(|e| e.to_string())?;
        audit(&conn, &vault.0, &peer, serde_json::json!({ "url": url, "received": resp.appointments.len(), "applied": applied, "accepted": resp.accepted, "conflicts": resp.conflicts }), "SYNC_EXCHANGE_COMPLETED")?;
        return Ok(SyncOutcome { url, received: resp.appointments.len(), applied, sent: req_counts.0, accepted: resp.accepted.len(), conflicts: resp.conflicts.len(), acks_sent: req_counts.1, cancel_notification_ids: cancel_ids });
    }
    Err(format!("Could not reach the desktop. {last_err}"))
}

#[tauri::command]
pub fn sync_get_conflicts(db: State<DbConn>) -> Result<Vec<SyncConflict>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, appointment_id, side, local_json, remote_json, detected_at FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY detected_at").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?))).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (id, appointment_id, side, l, rj, detected_at) = row.map_err(|e| e.to_string())?;
        out.push(SyncConflict { id, appointment_id, side, local: serde_json::from_str(&l).map_err(|e| e.to_string())?, remote: serde_json::from_str(&rj).map_err(|e| e.to_string())?, detected_at });
    }
    Ok(out)
}

/// keep = "local" keeps this device's version; "remote" adopts the other device's version.
#[tauri::command]
pub fn sync_resolve_conflict(db: State<DbConn>, vault: State<VaultRoot>, id: String, keep: String) -> Result<Vec<i32>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    resolve_conflict_impl(&conn, &vault.0, &id, &keep)
}

pub fn resolve_conflict_impl(conn: &rusqlite::Connection, vault: &Path, id: &str, keep: &str) -> Result<Vec<i32>, String> {
    let (local_json, remote_json): (String, String) = conn.query_row("SELECT local_json, remote_json FROM sync_conflicts WHERE id = ?1 AND resolved_at IS NULL", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|_| "Conflict not found or already resolved")?;
    let chosen: ReminderAppointment = serde_json::from_str(if keep == "remote" { &remote_json } else { &local_json }).map_err(|e| e.to_string())?;
    let current = reminders::appointment_by_id(conn, &chosen.id)?;
    let mut cancel = Vec::new();
    // A fresh revision of the chosen version, so the next sync carries the decision to the other device.
    let mut item = chosen.clone();
    item.source = format!("conflict_resolution:{keep}");
    if let Some(c) = &current { item.revision = c.revision; }
    let saved = reminders::save_appointment_impl(conn, vault, item, Utc::now())?;
    cancel.extend(saved.cancel_notification_ids);
    if keep == "remote" { mark_synced(conn, &saved.appointment.id, &saved.appointment.record_hash)?; }
    conn.execute("UPDATE sync_conflicts SET resolved_at = ?2, resolution = ?3 WHERE id = ?1", rusqlite::params![id, Utc::now().to_rfc3339(), keep]).map_err(|e| e.to_string())?;
    audit(conn, vault, id, serde_json::json!({ "appointment_id": chosen.id, "kept": keep, "new_hash": saved.appointment.record_hash }), "SYNC_CONFLICT_RESOLVED")?;
    Ok(cancel)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn db() -> (rusqlite::Connection, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("pops-sync-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("browser_records")).unwrap();
        (crate::init_db(":memory:"), root)
    }

    fn court(title: &str) -> ReminderAppointment {
        let local = (Utc::now() + Duration::days(9)).format("%Y-%m-%dT09:00").to_string();
        serde_json::from_value(serde_json::json!({ "kind": "court", "title": title, "localStart": local, "timeZone": "America/Denver", "status": "confirmed" })).unwrap()
    }

    #[test]
    fn http_request_parsing_over_a_real_socket() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let body = "x".repeat(20_000); // larger than one read chunk
        let sent = body.clone();
        let client = std::thread::spawn(move || {
            let mut s = TcpStream::connect(addr).unwrap();
            write!(s, "POST {PATH} HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\n\r\n{sent}", sent.len()).unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        });
        let (mut stream, _) = listener.accept().unwrap();
        let (line, got) = read_request(&mut stream).unwrap();
        assert!(line.starts_with(&format!("POST {PATH}")));
        assert_eq!(got, body);
        respond(&mut stream, "200 OK", "{\"ok\":true}");
        drop(stream);
        let reply = client.join().unwrap();
        assert!(reply.starts_with("HTTP/1.1 200 OK") && reply.ends_with("{\"ok\":true}"));
    }

    #[test]
    fn sealed_messages_roundtrip_and_reject_tampering() {
        let secret = B64.encode([7u8; 32]);
        let sealed = seal("peer-1", &secret, b"hello").unwrap();
        let (peer, pt) = open(&sealed, |_| Some(secret.clone())).unwrap();
        assert_eq!((peer.as_str(), pt.as_slice()), ("peer-1", b"hello".as_slice()));
        assert!(open(&sealed, |_| Some(B64.encode([8u8; 32]))).is_err());
        let mut env: serde_json::Value = serde_json::from_str(&sealed).unwrap();
        env["peerId"] = "peer-2".into();
        assert!(open(&env.to_string(), |_| Some(secret.clone())).is_err());
        assert!(open(&sealed, |_| None).is_err());
    }

    #[test]
    fn phone_desktop_sync_accepts_applies_and_flags_conflicts() {
        let (desk, droot) = db();
        let (phone, proot) = db();
        // Desktop creates a court date; phone receives it with identical slots.
        let d1 = reminders::save_appointment_impl(&desk, &droot, court("Status hearing"), Utc::now()).unwrap();
        let resp = handle_exchange(&desk, &droot, "p1", build_request(&phone, None).unwrap()).unwrap();
        assert_eq!(resp.appointments.len(), 1);
        let (applied, _) = apply_response(&phone, &proot, "p1", &resp).unwrap();
        assert_eq!(applied, 1);
        let p1 = reminders::appointment_by_id(&phone, &d1.appointment.id).unwrap().unwrap();
        assert_eq!(p1.record_hash, d1.appointment.record_hash);
        let ids = |c: &rusqlite::Connection| -> Vec<String> { c.prepare("SELECT id FROM reminder_slots WHERE state='pending' ORDER BY id").unwrap().query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap() };
        assert_eq!(ids(&desk), ids(&phone));

        // Phone creates an attorney meeting; desktop accepts it.
        let mut att = court("Attorney meeting");
        att.kind = "attorney".into();
        reminders::save_appointment_impl(&phone, &proot, att, Utc::now()).unwrap();
        let req = build_request(&phone, Some(resp.server_time.clone())).unwrap();
        assert_eq!(req.changes.len(), 1);
        let resp2 = handle_exchange(&desk, &droot, "p1", req).unwrap();
        assert_eq!(resp2.accepted.len(), 1);
        apply_response(&phone, &proot, "p1", &resp2).unwrap();
        assert!(build_request(&phone, Some(resp2.server_time.clone())).unwrap().changes.is_empty());

        // Both edit the court date: desktop flags a conflict and keeps its own version.
        let mut desk_edit = reminders::appointment_by_id(&desk, &d1.appointment.id).unwrap().unwrap();
        desk_edit.location = "Courtroom 4B".into();
        reminders::save_appointment_impl(&desk, &droot, desk_edit, Utc::now()).unwrap();
        let mut phone_edit = reminders::appointment_by_id(&phone, &d1.appointment.id).unwrap().unwrap();
        phone_edit.location = "Courtroom 2A".into();
        reminders::save_appointment_impl(&phone, &proot, phone_edit, Utc::now()).unwrap();
        let resp3 = handle_exchange(&desk, &droot, "p1", build_request(&phone, Some(resp2.server_time.clone())).unwrap()).unwrap();
        assert_eq!(resp3.conflicts, vec![d1.appointment.id.clone()]);
        assert_eq!(reminders::appointment_by_id(&desk, &d1.appointment.id).unwrap().unwrap().location, "Courtroom 4B");
        apply_response(&phone, &proot, "p1", &resp3).unwrap();
        assert_eq!(reminders::appointment_by_id(&phone, &d1.appointment.id).unwrap().unwrap().location, "Courtroom 2A");
        let open: i64 = desk.query_row("SELECT COUNT(*) FROM sync_conflicts WHERE resolved_at IS NULL", [], |r| r.get(0)).unwrap();
        assert_eq!(open, 1);

        // Phone acknowledges a reminder; the acknowledgment reaches the desktop.
        let slot: String = phone.query_row("SELECT id FROM reminder_slots WHERE state='pending' AND slot_kind='reminder' AND appointment_id != ?1 LIMIT 1", [&d1.appointment.id], |r| r.get(0)).unwrap();
        reminders::acknowledge_impl(&phone, &proot, &slot, "notification_action").unwrap();
        let resp4 = handle_exchange(&desk, &droot, "p1", build_request(&phone, Some(resp3.server_time.clone())).unwrap()).unwrap();
        assert_eq!(resp4.acks_applied, 1);
        let st: String = desk.query_row("SELECT state FROM reminder_slots WHERE id = ?1", [&slot], |r| r.get(0)).unwrap();
        assert_eq!(st, "acknowledged");
        let audited: i64 = desk.query_row("SELECT COUNT(*) FROM audit_ledger WHERE action IN ('SYNC_CONFLICT_DETECTED','SYNC_EXCHANGE_SERVED')", [], |r| r.get(0)).unwrap();
        assert!(audited >= 2);
        let _ = (std::fs::remove_dir_all(droot), std::fs::remove_dir_all(proot));
    }
}
