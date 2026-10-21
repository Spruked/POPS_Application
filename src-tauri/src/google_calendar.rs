//! Google Calendar (desktop) — pushes confirmed POPS appointments to the user's own
//! Google Calendar. Free: OAuth "installed app" client with PKCE and a loopback redirect.
//!
//! - The Google OAuth client id and refresh token are kept in the app config folder,
//!   NOT in the vault, so Vault Transfer never copies Google credentials.
//! - Event links and every push are recorded in the vault and audit ledger.
//! - Optional email reminders use Google Calendar's own email alerts (no email service, no fees).
//! - Phones see the events in their Google Calendar app; POPS phones get the schedule via Device Sync.
//! - POPS never overwrites from Google. If an event's time was changed in Google, it's reported.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64URL, Engine};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use super::reminders::{self, ReminderAppointment};
use super::{audit_browser_record, DbConn, VaultRoot};

const SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const AUTH: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN: &str = "https://oauth2.googleapis.com/token";
const API: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcalConfig { pub client_id: String, pub refresh_token: Option<String>, pub email_reminders: bool, pub connected_at: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcalStatus { pub client_id_set: bool, pub connected: bool, pub email_reminders: bool, pub connected_at: Option<String>, pub linked_events: i64 }

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcalSyncResult { pub created: usize, pub updated: usize, pub deleted: usize, pub unchanged: usize, pub changed_in_google: Vec<String>, pub errors: Vec<String> }

pub fn init_gcal_tables(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS gcal_links (appointment_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, synced_hash TEXT NOT NULL, synced_start TEXT NOT NULL, synced_at TEXT NOT NULL);")
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("google_calendar.json"))
}

fn load(app: &AppHandle) -> GcalConfig {
    config_path(app).ok().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn store(app: &AppHandle, c: &GcalConfig) -> Result<(), String> {
    let p = config_path(app)?;
    std::fs::write(&p, serde_json::to_vec_pretty(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600)); }
    Ok(())
}

fn audit(app: &AppHandle, id: &str, payload: serde_json::Value, action: &str) {
    let db = app.state::<DbConn>();
    let vault = app.state::<VaultRoot>();
    let guard = db.0.lock();
    if let Ok(conn) = guard.as_ref() {
        let _ = audit_browser_record(conn, &vault.0, "google_calendar", id, &payload.to_string(), action);
    }
}

/// Google event body for an appointment. Case notes are never sent to Google.
pub fn event_body(a: &ReminderAppointment, email_reminders: bool) -> serde_json::Value {
    let start: DateTime<Utc> = DateTime::parse_from_rfc3339(&a.start_utc).map(|d| d.with_timezone(&Utc)).unwrap_or_else(|_| Utc::now());
    let kind = match a.kind.as_str() { "court" => "Court", "attorney" => "Attorney", "deadline" => "Deadline", _ => "Appointment" };
    let mut overrides: Vec<serde_json::Value> = Vec::new();
    if email_reminders {
        overrides.push(serde_json::json!({ "method": "email", "minutes": 1440 }));
    }
    for m in a.offsets.iter().filter(|m| **m <= 40320) {
        if overrides.len() >= 5 { break; }
        overrides.push(serde_json::json!({ "method": "popup", "minutes": m }));
    }
    serde_json::json!({
        "summary": format!("{kind}: {}", a.title),
        "location": a.location,
        "description": "Scheduled in POPS. Open POPS for details and to confirm reminders.",
        "start": { "dateTime": start.to_rfc3339(), "timeZone": a.time_zone },
        "end": { "dateTime": (start + Duration::hours(1)).to_rfc3339(), "timeZone": a.time_zone },
        "reminders": { "useDefault": false, "overrides": overrides },
        "extendedProperties": { "private": { "popsAppointmentId": a.id } },
    })
}

#[tauri::command]
pub fn gcal_status(app: AppHandle) -> Result<GcalStatus, String> {
    let c = load(&app);
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let linked: i64 = conn.query_row("SELECT COUNT(*) FROM gcal_links", [], |r| r.get(0)).unwrap_or(0);
    drop(conn);
    Ok(GcalStatus { client_id_set: !c.client_id.is_empty(), connected: c.refresh_token.is_some(), email_reminders: c.email_reminders, connected_at: c.connected_at, linked_events: linked })
}

#[tauri::command]
pub fn gcal_configure(app: AppHandle, client_id: Option<String>, email_reminders: Option<bool>) -> Result<GcalStatus, String> {
    let mut c = load(&app);
    if let Some(id) = client_id { c.client_id = id.trim().to_string(); }
    if let Some(e) = email_reminders { c.email_reminders = e; }
    store(&app, &c)?;
    audit(&app, "config", serde_json::json!({ "client_id_set": !c.client_id.is_empty(), "email_reminders": c.email_reminders }), "GCAL_CONFIGURED");
    gcal_status(app)
}

#[tauri::command]
pub fn gcal_disconnect(app: AppHandle) -> Result<GcalStatus, String> {
    let mut c = load(&app);
    c.refresh_token = None;
    c.connected_at = None;
    store(&app, &c)?;
    audit(&app, "config", serde_json::json!({}), "GCAL_DISCONNECTED");
    gcal_status(app)
}

/// Desktop OAuth: system browser + one-shot loopback listener on 127.0.0.1 (PKCE, state check).
#[tauri::command]
pub async fn gcal_connect(app: AppHandle) -> Result<GcalStatus, String> {
    let mut c = load(&app);
    if c.client_id.is_empty() { return Err("Add your Google OAuth client ID first.".into()); }
    let mut raw = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw);
    let verifier = B64URL.encode(raw);
    let challenge = B64URL.encode(Sha256::digest(verifier.as_bytes()));
    rand::thread_rng().fill_bytes(&mut raw);
    let state = B64URL.encode(&raw[..16]);
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let redirect = format!("http://127.0.0.1:{}/oauth/callback", listener.local_addr().map_err(|e| e.to_string())?.port());
    let url = reqwest::Url::parse_with_params(AUTH, &[("client_id", c.client_id.as_str()), ("redirect_uri", &redirect), ("response_type", "code"), ("scope", SCOPE), ("code_challenge", &challenge), ("code_challenge_method", "S256"), ("state", &state), ("access_type", "offline"), ("prompt", "consent")]).map_err(|e| e.to_string())?;
    #[allow(deprecated)]
    tauri_plugin_shell::ShellExt::shell(&app).open(url.as_str(), None).map_err(|e| format!("Could not open the browser: {e}"))?;
    let expected = state.clone();
    let code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        listener.set_nonblocking(false).ok();
        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        let line = String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("").to_string();
        let path = line.split_whitespace().nth(1).unwrap_or("");
        let q = reqwest::Url::parse(&format!("http://localhost{path}")).map_err(|e| e.to_string())?;
        let get = |k: &str| q.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.to_string());
        let ok = get("state").as_deref() == Some(expected.as_str()) && get("code").is_some();
        let page = if ok { "POPS is connected to Google Calendar. You can close this tab." } else { "Google Calendar connection failed. Return to POPS and try again." };
        let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html><body style=\"font-family:sans-serif;padding:40px\"><h2>{page}</h2></body></html>");
        if !ok { return Err(get("error").unwrap_or_else(|| "state mismatch".into())); }
        Ok(get("code").unwrap())
    }).await.map_err(|e| e.to_string())??;
    let tok: serde_json::Value = reqwest::Client::new().post(TOKEN).form(&[("client_id", c.client_id.as_str()), ("code", &code), ("code_verifier", &verifier), ("grant_type", "authorization_code"), ("redirect_uri", &redirect)]).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let refresh = tok["refresh_token"].as_str().ok_or_else(|| format!("Google did not return a refresh token: {}", tok["error_description"].as_str().or(tok["error"].as_str()).unwrap_or("unknown error")))?;
    c.refresh_token = Some(refresh.to_string());
    c.connected_at = Some(Utc::now().to_rfc3339());
    store(&app, &c)?;
    audit(&app, "config", serde_json::json!({ "scope": SCOPE }), "GCAL_CONNECTED");
    gcal_status(app)
}

async fn access_token(c: &GcalConfig) -> Result<String, String> {
    let refresh = c.refresh_token.as_deref().ok_or("Connect Google Calendar first.")?;
    let tok: serde_json::Value = reqwest::Client::new().post(TOKEN).form(&[("client_id", c.client_id.as_str()), ("refresh_token", refresh), ("grant_type", "refresh_token")]).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    tok["access_token"].as_str().map(String::from).ok_or_else(|| "Google sign-in expired. Reconnect Google Calendar.".into())
}

/// Pushes confirmed appointments; deletes cancelled ones; reports edits made in Google.
#[tauri::command]
pub async fn gcal_sync(app: AppHandle) -> Result<GcalSyncResult, String> {
    let c = load(&app);
    let token = access_token(&c).await?;
    let (appts, links) = {
        let db = app.state::<DbConn>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let appts: Vec<ReminderAppointment> = reminders::appointments_updated_since(&conn, None)?;
        let mut stmt = conn.prepare("SELECT appointment_id, event_id, synced_hash, synced_start FROM gcal_links").map_err(|e| e.to_string())?;
        let links: std::collections::HashMap<String, (String, String, String)> = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?)))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
        (appts, links)
    };
    let client = reqwest::Client::new();
    let mut res = GcalSyncResult::default();
    let now = Utc::now().to_rfc3339();
    let mut writes: Vec<(String, Option<(String, String, String)>)> = Vec::new();
    for a in appts {
        let link = links.get(&a.id);
        let future = a.start_utc.as_str() > now.as_str();
        let outcome: Result<(), String> = async {
            match (a.status.as_str(), link) {
                ("cancelled", Some((eid, _, _))) => {
                    client.delete(format!("{API}/{eid}")).bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
                    writes.push((a.id.clone(), None));
                    res.deleted += 1;
                }
                ("confirmed", Some((eid, hash, synced_start))) => {
                    let ev: serde_json::Value = client.get(format!("{API}/{eid}")).bearer_auth(&token).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
                    let g_start = ev["start"]["dateTime"].as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|d| d.with_timezone(&Utc).to_rfc3339());
                    if g_start.as_deref().is_some_and(|g| g != synced_start) {
                        res.changed_in_google.push(format!("\"{}\" was moved in Google Calendar to {}. POPS kept its own time; update it in POPS if the court changed it.", a.title, g_start.unwrap()));
                    } else if hash != &a.record_hash {
                        client.put(format!("{API}/{eid}")).bearer_auth(&token).json(&event_body(&a, c.email_reminders)).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
                        writes.push((a.id.clone(), Some((eid.clone(), a.record_hash.clone(), a.start_utc.clone()))));
                        res.updated += 1;
                    } else {
                        res.unchanged += 1;
                    }
                }
                ("confirmed", None) if future => {
                    let ev: serde_json::Value = client.post(API).bearer_auth(&token).json(&event_body(&a, c.email_reminders)).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
                    let eid = ev["id"].as_str().ok_or("Google returned no event id")?.to_string();
                    writes.push((a.id.clone(), Some((eid, a.record_hash.clone(), a.start_utc.clone()))));
                    res.created += 1;
                }
                _ => {}
            }
            Ok(())
        }.await;
        if let Err(e) = outcome { res.errors.push(format!("{}: {e}", a.title)); }
    }
    {
        let db = app.state::<DbConn>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        for (id, link) in &writes {
            match link {
                Some((eid, hash, start)) => conn.execute("INSERT OR REPLACE INTO gcal_links (appointment_id, event_id, synced_hash, synced_start, synced_at) VALUES (?1,?2,?3,?4,?5)", rusqlite::params![id, eid, hash, start, Utc::now().to_rfc3339()]),
                None => conn.execute("DELETE FROM gcal_links WHERE appointment_id = ?1", [id]),
            }.map_err(|e| e.to_string())?;
        }
    }
    audit(&app, "sync", serde_json::to_value(&res).unwrap_or_default(), "GCAL_SYNC_COMPLETED");
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_body_keeps_court_zone_limits_overrides_and_hides_notes() {
        let a: ReminderAppointment = serde_json::from_value(serde_json::json!({ "id": "a1", "kind": "court", "title": "Status hearing", "location": "Courtroom 4B", "notes": "PRIVATE CASE NOTES", "localStart": "2026-11-20T09:00", "timeZone": "America/Denver", "startUtc": "2026-11-20T16:00:00+00:00", "offsets": [10080, 4320, 1440, 180, 60] })).unwrap();
        let ev = event_body(&a, true);
        assert_eq!(ev["start"]["timeZone"], "America/Denver");
        assert_eq!(ev["summary"], "Court: Status hearing");
        let o = ev["reminders"]["overrides"].as_array().unwrap();
        assert_eq!(o.len(), 5);
        assert_eq!(o[0]["method"], "email");
        assert!(!ev.to_string().contains("PRIVATE CASE NOTES"));
    }
}
