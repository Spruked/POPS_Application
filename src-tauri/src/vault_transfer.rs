//! Vault Transfer: move a whole POPS vault (SQLite records + preserved originals)
//! between devices, e.g. desktop -> phone, with integrity checks at every step.
//!
//! Package format `pops-vault-transfer/1` (a zip with the `.popsvault` extension):
//!   manifest.json                      entries with SHA-256 + size, package hash
//!   database/proof_of_presence.db      consistent snapshot (VACUUM INTO)
//!   <vault dir>/...                    evidence originals, exports, dossiers, ...
//!
//! Restore order: verify the package hash -> extract every entry into staging,
//! re-hashing each one against the manifest (abort on any mismatch) -> SQLite
//! integrity_check -> re-hash each evidence original against its recorded sha256
//! -> rewrite vault paths for this device -> snapshot the current vault ->
//! swap in the database (SQLite backup API) -> append chain-of-custody and
//! audit-ledger entries.

use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

/// Accepts plain paths and Android `content://` URIs from the system pickers.
fn file_path(raw: &str) -> Result<FilePath, String> {
    raw.parse::<FilePath>().map_err(|e| format!("Invalid file location {raw}: {e:?}"))
}

use super::{
    get_previous_ledger_hash, insert_evidence_chain, ledger_entry_hash, sha256_hex, vault_database_dir, DbConn,
    VaultRoot,
};

pub const FORMAT: &str = "pops-vault-transfer/1";
const MANIFEST_ENTRY: &str = "manifest.json";
const DB_ENTRY: &str = "database/proof_of_presence.db";
/// Vault folders carried in a transfer. Caches and temp folders are rebuilt locally.
pub const INCLUDED_DIRS: &[&str] = &[
    "evidence_originals",
    "communication_exports",
    "case_bundles",
    "exports",
    "dossiers",
    "child_support_ledger",
    "operational_records",
    "browser_records",
];
/// Tables with absolute vault paths that must be rewritten for the receiving device.
const PATH_COLUMNS: &[(&str, &str, &str)] = &[
    ("evidence", "id", "file_path"),
    ("evidence_metadata", "evidence_id", "file_path"),
    ("communication_records", "id", "file_path"),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TransferEntry {
    pub path: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferManifest {
    pub format: String,
    pub created_at: String,
    pub source_platform: String,
    pub app_version: String,
    pub evidence_count: i64,
    pub chain_entry_count: i64,
    pub entries: Vec<TransferEntry>,
    pub package_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferSummary {
    pub destination: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub evidence_count: i64,
    pub package_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInspection {
    pub created_at: String,
    pub source_platform: String,
    pub app_version: String,
    pub evidence_count: i64,
    pub chain_entry_count: i64,
    pub file_count: usize,
    pub total_bytes: u64,
    pub package_hash: String,
    pub package_hash_valid: bool,
    pub current_evidence_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub package_hash: String,
    pub files_restored: usize,
    pub evidence_count: i64,
    pub originals_verified: usize,
    pub originals_mismatched: Vec<String>,
    pub originals_missing: Vec<String>,
    pub pre_restore_snapshot: String,
}

/// Hash over the sorted entry list; any edit to the manifest entries changes it.
pub fn package_hash(entries: &[TransferEntry]) -> String {
    let mut lines: Vec<String> = entries
        .iter()
        .map(|e| format!("{}\n{}\n{}\n", e.path, e.sha256, e.size))
        .collect();
    lines.sort();
    sha256_hex(lines.concat().as_bytes())
}

/// Reject absolute paths and `..` so a package can never write outside staging.
fn safe_relative(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if path.is_empty()
        || candidate
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!("Unsafe path in transfer package: {path}"));
    }
    Ok(candidate.to_path_buf())
}

/// Maps a stored absolute path (from any OS) to this device's vault root by
/// locating the first known vault folder segment.
pub fn remap_vault_path(stored: &str, new_root: &Path) -> Option<String> {
    let normalized = stored.replace('\\', "/");
    let segments: Vec<&str> = normalized.split('/').filter(|s| !s.is_empty()).collect();
    let index = segments.iter().position(|s| INCLUDED_DIRS.contains(s))?;
    let mut path = new_root.to_path_buf();
    for segment in &segments[index..] {
        path.push(segment);
    }
    Some(path.to_string_lossy().to_string())
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<(PathBuf, String)>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .components()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("/");
            out.push((path, relative));
        }
    }
    Ok(())
}

/// Copies `reader` into `writer` while hashing; returns (sha256, bytes).
fn copy_hashed(reader: &mut impl Read, writer: &mut impl Write) -> Result<(String, u64), String> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        writer.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        total += read as u64;
    }
    Ok((format!("{:x}", hasher.finalize()), total))
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    copy_hashed(&mut file, &mut std::io::sink()).map(|(hash, _)| hash)
}

fn count(conn: &rusqlite::Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
        .unwrap_or(0)
}

fn timestamp_slug() -> String {
    chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string()
}

fn snapshot_database(conn: &rusqlite::Connection, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_file(target);
    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().to_string()])
        .map_err(|e| format!("Database snapshot failed: {e}"))?;
    Ok(())
}

/// Builds the transfer package at `writer`. Shared by the command and tests.
pub fn write_package<W: Write + std::io::Seek>(
    conn: &rusqlite::Connection,
    vault_root: &Path,
    writer: W,
    source_platform: &str,
    app_version: &str,
) -> Result<(TransferManifest, W), String> {
    let snapshot = vault_root
        .join("temp_exports")
        .join(format!("transfer-{}.db", timestamp_slug()));
    snapshot_database(conn, &snapshot)?;

    let mut zip = zip::ZipWriter::new(writer);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    let mut entries = Vec::new();

    let mut files = vec![(snapshot.clone(), DB_ENTRY.to_string())];
    for dir in INCLUDED_DIRS {
        collect_files(vault_root, &vault_root.join(dir), &mut files)?;
    }

    let result = (|| {
        for (path, relative) in &files {
            zip.start_file(relative.as_str(), options).map_err(|e| e.to_string())?;
            let mut source = fs::File::open(path).map_err(|e| e.to_string())?;
            let (sha256, size) = copy_hashed(&mut source, &mut zip)?;
            entries.push(TransferEntry { path: relative.clone(), sha256, size });
        }
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        let manifest = TransferManifest {
            format: FORMAT.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            source_platform: source_platform.to_string(),
            app_version: app_version.to_string(),
            evidence_count: count(conn, "evidence"),
            chain_entry_count: count(conn, "evidence_chain"),
            package_hash: package_hash(&entries),
            entries: entries.clone(),
        };
        zip.start_file(MANIFEST_ENTRY, options).map_err(|e| e.to_string())?;
        zip.write_all(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?.as_bytes())
            .map_err(|e| e.to_string())?;
        let writer = zip.finish().map_err(|e| e.to_string())?;
        Ok((manifest, writer))
    })();
    let _ = fs::remove_file(&snapshot);
    result
}

fn read_manifest<R: Read + std::io::Seek>(archive: &mut zip::ZipArchive<R>) -> Result<TransferManifest, String> {
    let mut raw = String::new();
    archive
        .by_name(MANIFEST_ENTRY)
        .map_err(|_| "Not a POPS vault transfer package (manifest.json missing).".to_string())?
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;
    let manifest: TransferManifest =
        serde_json::from_str(&raw).map_err(|e| format!("Unreadable transfer manifest: {e}"))?;
    if manifest.format != FORMAT {
        return Err(format!("Unsupported transfer format: {}", manifest.format));
    }
    Ok(manifest)
}

/// Extracts and verifies every entry into `staging`. Any mismatch aborts.
pub fn extract_verified<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    manifest: &TransferManifest,
    staging: &Path,
) -> Result<(), String> {
    if package_hash(&manifest.entries) != manifest.package_hash {
        return Err("Transfer manifest failed its package hash check; the package was altered.".into());
    }
    if !manifest.entries.iter().any(|e| e.path == DB_ENTRY) {
        return Err("Transfer package has no database snapshot.".into());
    }
    for entry in &manifest.entries {
        let relative = safe_relative(&entry.path)?;
        let target = staging.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut source = archive
            .by_name(&entry.path)
            .map_err(|_| format!("Missing from package: {}", entry.path))?;
        let mut output = fs::File::create(&target).map_err(|e| e.to_string())?;
        let (sha256, size) = copy_hashed(&mut source, &mut output)?;
        if sha256 != entry.sha256 || size != entry.size {
            return Err(format!(
                "Integrity check failed for {}: expected {} ({} bytes), got {} ({} bytes).",
                entry.path, entry.sha256, entry.size, sha256, size
            ));
        }
    }
    Ok(())
}

/// Integrity-checks the staged database, re-hashes originals and rewrites paths
/// for `vault_root`. Returns (verified, mismatched, missing).
pub fn prepare_staged_database(
    staged_db: &rusqlite::Connection,
    staging: &Path,
    vault_root: &Path,
) -> Result<(usize, Vec<String>, Vec<String>), String> {
    let check: String = staged_db
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if check != "ok" {
        return Err(format!("Database snapshot failed SQLite integrity_check: {check}"));
    }
    // A package from an earlier Pops! version gets the current schema before anything
    // reads it or it replaces this device's database.
    crate::try_migrate_schema(staged_db).map_err(|e| format!("Transfer package rejected: {e}"))?;
    // The restore entry is appended to the incoming ledger after the swap; refuse a
    // forked or broken chain now, before anything on this device is replaced.
    get_previous_ledger_hash(staged_db).map_err(|e| format!("Transfer package rejected: {e}"))?;

    let mut verified = 0;
    let mut mismatched = Vec::new();
    let mut missing = Vec::new();
    {
        let mut stmt = staged_db
            .prepare("SELECT id, file_path, sha256 FROM evidence WHERE file_path IS NOT NULL AND file_path != ''")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, stored, expected) = row.map_err(|e| e.to_string())?;
            match remap_vault_path(&stored, staging).map(PathBuf::from) {
                Some(path) if path.exists() => {
                    if hash_file(&path)? == expected {
                        verified += 1;
                    } else {
                        mismatched.push(id);
                    }
                }
                _ => missing.push(id),
            }
        }
    }

    for (table, key, column) in PATH_COLUMNS {
        let rows: Vec<(String, String)> = {
            let mut stmt = staged_db
                .prepare(&format!("SELECT {key}, {column} FROM {table} WHERE {column} IS NOT NULL"))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?;
            mapped.collect::<Result<_, _>>().map_err(|e| e.to_string())?
        };
        for (id, stored) in rows {
            if let Some(updated) = remap_vault_path(&stored, vault_root) {
                staged_db
                    .execute(&format!("UPDATE {table} SET {column} = ?1 WHERE {key} = ?2"), [&updated, &id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok((verified, mismatched, missing))
}

fn copy_tree(from: &Path, to: &Path) -> Result<usize, String> {
    let mut files = Vec::new();
    collect_files(from, from, &mut files)?;
    for (path, relative) in &files {
        let target = to.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(path, &target).map_err(|e| e.to_string())?;
    }
    Ok(files.len())
}

fn open_package(app: &AppHandle, source: &str) -> Result<zip::ZipArchive<fs::File>, String> {
    let mut options = OpenOptions::new();
    options.read(true);
    let file = app
        .fs()
        .open(file_path(source)?, options)
        .map_err(|e| format!("Could not open transfer package: {e}"))?;
    zip::ZipArchive::new(file).map_err(|e| format!("Not a valid transfer package: {e}"))
}

#[tauri::command]
pub async fn export_vault_transfer(app: AppHandle, destination: String) -> Result<TransferSummary, String> {
    let vault_root = app.state::<VaultRoot>().0.clone();
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    let file = app
        .fs()
        .open(file_path(&destination)?, options)
        .map_err(|e| format!("Could not create transfer package: {e}"))?;
    let version = app.package_info().version.to_string();
    let db = app.state::<DbConn>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let (manifest, _) = write_package(&conn, &vault_root, file, std::env::consts::OS, &version)?;
    Ok(TransferSummary {
        destination,
        file_count: manifest.entries.len(),
        total_bytes: manifest.entries.iter().map(|e| e.size).sum(),
        evidence_count: manifest.evidence_count,
        package_hash: manifest.package_hash,
    })
}

#[tauri::command]
pub async fn inspect_vault_transfer(app: AppHandle, source: String) -> Result<TransferInspection, String> {
    let mut archive = open_package(&app, &source)?;
    let manifest = read_manifest(&mut archive)?;
    let current_evidence_count = {
        let db = app.state::<DbConn>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        count(&conn, "evidence")
    };
    Ok(TransferInspection {
        package_hash_valid: package_hash(&manifest.entries) == manifest.package_hash,
        file_count: manifest.entries.len(),
        total_bytes: manifest.entries.iter().map(|e| e.size).sum(),
        created_at: manifest.created_at,
        source_platform: manifest.source_platform,
        app_version: manifest.app_version,
        evidence_count: manifest.evidence_count,
        chain_entry_count: manifest.chain_entry_count,
        package_hash: manifest.package_hash,
        current_evidence_count,
    })
}

#[tauri::command]
pub async fn restore_vault_transfer(app: AppHandle, source: String) -> Result<RestoreReport, String> {
    let vault_root = app.state::<VaultRoot>().0.clone();
    let mut archive = open_package(&app, &source)?;
    let manifest = read_manifest(&mut archive)?;
    let staging = vault_root.join("temp_exports").join(format!("restore-{}", timestamp_slug()));
    let result = restore_from_archive(&app, &mut archive, &manifest, &staging, &vault_root);
    let _ = fs::remove_dir_all(&staging);
    result
}

fn restore_from_archive(
    app: &AppHandle,
    archive: &mut zip::ZipArchive<fs::File>,
    manifest: &TransferManifest,
    staging: &Path,
    vault_root: &Path,
) -> Result<RestoreReport, String> {
    let staged = stage_restore(archive, manifest, staging, vault_root)?;
    let db = app.state::<DbConn>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    apply_restore(&mut conn, staged, manifest, staging, vault_root)
}

/// A verified, path-rewritten package database waiting to be applied.
pub struct StagedRestore {
    db: rusqlite::Connection,
    verified: usize,
    mismatched: Vec<String>,
    missing: Vec<String>,
}

/// Extracts and verifies the package into `staging` and prepares its database.
/// Touches nothing in the live vault.
pub fn stage_restore<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    manifest: &TransferManifest,
    staging: &Path,
    vault_root: &Path,
) -> Result<StagedRestore, String> {
    extract_verified(archive, manifest, staging)?;
    let db = rusqlite::Connection::open(staging.join(DB_ENTRY)).map_err(|e| e.to_string())?;
    let (verified, mismatched, missing) = prepare_staged_database(&db, staging, vault_root)?;
    Ok(StagedRestore { db, verified, mismatched, missing })
}

// ─── Non-destructive restore guard (G3) ───────────────────────────────

/// Device bookkeeping that a restore replaces: this device's own ledger, settings and
/// pairings. It is kept in the pre-restore snapshot, whose SHA-256 the restore entry
/// records. Every other table holds user records and is protected, including tables
/// added later (fail-safe default).
const DEVICE_STATE_TABLES: &[&str] = &["audit_ledger", "reminder_settings", "sync_peers", "sync_state", "gcal_links"];

/// Rows that schema setup creates on every install. They are not user records while
/// untouched (their timestamps differ per device, so they never match a package).
fn untouched_seed_filter(table: &str) -> &'static str {
    match table {
        "case_matters" => {
            "NOT (id = 'primary' AND parent_case_id IS NULL AND case_type = 'primary_custody'
                  AND title = 'Primary Custody / Family Case' AND case_number = '' AND court_name = ''
                  AND judge_name = '' AND status = 'active' AND lifecycle_stage = 'filing'
                  AND opened_date = '' AND closed_date = '' AND next_deadline = '' AND next_hearing_date = ''
                  AND order_ids_json = '[]' AND evidence_ids_json = '[]' AND event_ids_json = '[]'
                  AND document_ids_json = '[]' AND notes = '' AND created_at = updated_at)"
        }
        _ => "1",
    }
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Refuses a restore that would lose anything the user recorded on this device:
/// a user-record row the package does not contain identically, or an existing
/// original file the package would overwrite with different bytes.
/// Runs before any snapshot, file copy or database swap.
pub fn ensure_restore_is_non_destructive(
    live: &rusqlite::Connection,
    staged_db_path: &Path,
    staging: &Path,
    vault_root: &Path,
) -> Result<(), String> {
    live.execute("ATTACH DATABASE ?1 AS incoming", [staged_db_path.to_string_lossy().to_string()])
        .map_err(|e| e.to_string())?;
    let lost = (|| -> Result<Vec<(String, i64)>, String> {
        let tables: Vec<String> = live
            .prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .and_then(|mut s| s.query_map([], |r| r.get(0))?.collect())
            .map_err(|e| e.to_string())?;
        let mut lost = Vec::new();
        for table in tables.iter().filter(|t| !DEVICE_STATE_TABLES.contains(&t.as_str())) {
            let columns = |schema: &str| -> Result<Vec<String>, String> {
                live.prepare("SELECT name FROM pragma_table_info(?1, ?2)")
                    .and_then(|mut s| s.query_map([table.as_str(), schema], |r| r.get(0))?.collect())
                    .map_err(|e| e.to_string())
            };
            let live_columns = columns("main")?;
            let incoming_columns = columns("incoming")?;
            let filter = untouched_seed_filter(table);
            let t = quote_ident(table);
            let count: i64 = if live_columns.iter().all(|c| incoming_columns.contains(c)) {
                let cols = live_columns.iter().map(|c| quote_ident(c)).collect::<Vec<_>>().join(", ");
                live.query_row(
                    &format!("SELECT COUNT(*) FROM (SELECT {cols} FROM main.{t} WHERE {filter} EXCEPT SELECT {cols} FROM incoming.{t})"),
                    [],
                    |r| r.get(0),
                )
            } else {
                // The package cannot hold these rows at all (older format or missing table).
                live.query_row(&format!("SELECT COUNT(*) FROM main.{t} WHERE {filter}"), [], |r| r.get(0))
            }
            .map_err(|e| e.to_string())?;
            if count > 0 {
                lost.push((table.clone(), count));
            }
        }
        Ok(lost)
    })();
    let _ = live.execute("DETACH DATABASE incoming", []);
    let lost = lost?;
    if !lost.is_empty() {
        let detail = lost.iter().map(|(t, n)| format!("{t}: {n}")).collect::<Vec<_>>().join(", ");
        return Err(format!(
            "Restore refused: this device holds {} record(s) that the package does not contain or that differ from it ({detail}). Restoring would remove them from this vault. Nothing was changed. Vault Transfer restores only into a new or matching vault.",
            lost.iter().map(|(_, n)| n).sum::<i64>()
        ));
    }

    let mut staged_files = Vec::new();
    for dir in INCLUDED_DIRS {
        collect_files(staging, &staging.join(dir), &mut staged_files)?;
    }
    for (path, relative) in &staged_files {
        let existing = vault_root.join(relative);
        if existing.is_file() && hash_file(&existing)? != hash_file(path)? {
            return Err(format!(
                "Restore refused: the package would overwrite {relative} on this device with different content. Nothing was changed."
            ));
        }
    }
    Ok(())
}

/// Applies a staged restore to the live vault. Refuses before changing anything if the
/// restore would be destructive; otherwise snapshots, copies originals, swaps the
/// database and records the restore.
pub fn apply_restore(
    conn: &mut rusqlite::Connection,
    staged: StagedRestore,
    manifest: &TransferManifest,
    staging: &Path,
    vault_root: &Path,
) -> Result<RestoreReport, String> {
    let StagedRestore { db: staged_db, verified, mismatched, missing } = staged;
    ensure_restore_is_non_destructive(conn, &staging.join(DB_ENTRY), staging, vault_root)?;

    // Keep the device's current vault database before anything is replaced.
    let pre_restore = vault_database_dir(vault_root).join(format!("pre-restore-{}.db", timestamp_slug()));
    snapshot_database(&conn, &pre_restore)?;

    let mut files_restored = 0;
    for dir in INCLUDED_DIRS {
        let staged_dir = staging.join(dir);
        if staged_dir.exists() {
            files_restored += copy_tree(&staged_dir, &vault_root.join(dir))?;
        }
    }

    {
        let backup = rusqlite::backup::Backup::new(&staged_db, &mut *conn).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(256, std::time::Duration::from_millis(0), None)
            .map_err(|e| format!("Database restore failed: {e}"))?;
    }
    drop(staged_db);

    record_restore(&conn, manifest, verified, &mismatched, &missing, &pre_restore)?;

    Ok(RestoreReport {
        package_hash: manifest.package_hash.clone(),
        files_restored: files_restored + 1,
        evidence_count: count(&conn, "evidence"),
        originals_verified: verified,
        originals_mismatched: mismatched,
        originals_missing: missing,
        pre_restore_snapshot: pre_restore.to_string_lossy().to_string(),
    })
}

/// Chain-of-custody row per evidence item plus one hash-linked audit-ledger entry.
pub fn record_restore(
    conn: &rusqlite::Connection,
    manifest: &TransferManifest,
    verified: usize,
    mismatched: &[String],
    missing: &[String],
    pre_restore: &Path,
) -> Result<(), String> {
    let evidence: Vec<(String, String)> = {
        let mut stmt = conn.prepare("SELECT id, sha256 FROM evidence").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    for (id, hash) in &evidence {
        let status = if mismatched.contains(id) {
            "HASH_MISMATCH"
        } else if missing.contains(id) {
            "ORIGINAL_NOT_IN_PACKAGE"
        } else {
            "VERIFIED"
        };
        insert_evidence_chain(
            conn,
            id,
            "VAULT_TRANSFER_RESTORED",
            hash,
            serde_json::json!({
                "evidence_id": id,
                "action": "VAULT_TRANSFER_RESTORED",
                "integrity": status,
                "package_hash": &manifest.package_hash,
                "source_platform": &manifest.source_platform,
                "package_created_at": &manifest.created_at,
            })
            .to_string(),
        )?;
    }

    let created_at = chrono::Utc::now().to_rfc3339();
    let record_id = format!("vault-transfer-{}", &manifest.package_hash[..12.min(manifest.package_hash.len())]);
    let metadata_json = serde_json::json!({
        "action": "VAULT_TRANSFER_RESTORED",
        "package_hash": &manifest.package_hash,
        "source_platform": &manifest.source_platform,
        "package_created_at": &manifest.created_at,
        "files": manifest.entries.len(),
        "evidence_count": evidence.len(),
        "originals_verified": verified,
        "originals_mismatched": mismatched,
        "originals_missing": missing,
        "pre_restore_snapshot": pre_restore.to_string_lossy(),
        // Pins the replaced device bookkeeping (ledger, settings, pairings) verifiably.
        "pre_restore_snapshot_sha256": hash_file(pre_restore).ok(),
    })
    .to_string();
    let previous = get_previous_ledger_hash(conn)?;
    let ledger_hash = ledger_entry_hash(
        &record_id,
        "VAULT_TRANSFER_RESTORED",
        &manifest.package_hash,
        &created_at,
        &metadata_json,
        previous.as_deref(),
    );
    conn.execute(
        "INSERT INTO audit_ledger (
            id, record_id, action, payload_hash, hash, created_at, metadata_json,
            previous_ledger_hash, ledger_entry_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            &record_id,
            "VAULT_TRANSFER_RESTORED",
            &manifest.package_hash,
            &manifest.package_hash,
            &created_at,
            &metadata_json,
            &previous,
            &ledger_hash,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pops-transfer-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A desktop-style vault with two originals: one intact, one whose recorded hash
    /// does not match (simulates a source-side inconsistency that must be flagged).
    fn desktop_vault() -> (PathBuf, rusqlite::Connection) {
        let root = temp_dir("src").join("Vault_System");
        crate::ensure_vault_system_layout(&root).unwrap();
        let conn = crate::init_db(root.join("database").join("proof_of_presence.db").to_str().unwrap());
        for (id, bytes, recorded) in [("ev1", b"original-photo".as_slice(), None), ("ev2", b"second-file".as_slice(), Some("deadbeef"))] {
            let dir = root.join("evidence_originals").join(id);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("file.jpg"), bytes).unwrap();
            let hash = recorded.map(str::to_string).unwrap_or_else(|| sha256_hex(bytes));
            let windows_path = format!("C:\\Users\\pops\\Vault_System\\evidence_originals\\{id}\\file.jpg");
            conn.execute(
                "INSERT INTO evidence (id, type, title, file_path, sha256, created_at) VALUES (?1, 'photo', ?1, ?2, ?3, '2026-10-14T10:00:00Z')",
                rusqlite::params![id, windows_path, hash],
            )
            .unwrap();
        }
        (root, conn)
    }

    fn package(conn: &rusqlite::Connection, root: &Path) -> (TransferManifest, Vec<u8>) {
        let (manifest, cursor) = write_package(conn, root, Cursor::new(Vec::new()), "windows", "1.0.0").unwrap();
        (manifest, cursor.into_inner())
    }

    #[test]
    fn restoring_a_pre_s0_or_pre_c1_vault_brings_it_to_the_current_schema() {
        let (root, conn) = desktop_vault();
        // Make the source look like a vault from before S0: no withdrawal columns.
        conn.execute_batch("ALTER TABLE evidence DROP COLUMN withdrawn_at; ALTER TABLE evidence DROP COLUMN withdrawn_reason; DROP TABLE evidence_capture_metadata;").unwrap();
        let (_, bytes) = package(&conn, &root);
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let read = read_manifest(&mut archive).unwrap();
        let staging = temp_dir("staging-pre-s0");
        extract_verified(&mut archive, &read, &staging).unwrap();
        let staged = rusqlite::Connection::open(staging.join(DB_ENTRY)).unwrap();
        prepare_staged_database(&staged, &staging, &temp_dir("phone-pre-s0").join("Vault_System")).unwrap();

        let live: i64 = staged
            .query_row("SELECT COUNT(*) FROM evidence WHERE withdrawn_at IS NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!(live, 2);
        // And from before C1: the capture-metadata table exists again.
        let c1: i64 = staged.query_row("SELECT COUNT(*) FROM evidence_capture_metadata", [], |r| r.get(0)).unwrap();
        assert_eq!(c1, 0);
    }

    #[test]
    fn round_trip_verifies_originals_and_remaps_paths() {
        let (root, conn) = desktop_vault();
        let (manifest, bytes) = package(&conn, &root);
        assert_eq!(manifest.evidence_count, 2);
        assert!(manifest.entries.iter().any(|e| e.path == DB_ENTRY));
        assert!(manifest.entries.iter().any(|e| e.path == "evidence_originals/ev1/file.jpg"));
        assert_eq!(package_hash(&manifest.entries), manifest.package_hash);

        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let read = read_manifest(&mut archive).unwrap();
        let staging = temp_dir("staging");
        extract_verified(&mut archive, &read, &staging).unwrap();

        let phone_root = temp_dir("phone").join("Vault_System");
        let staged = rusqlite::Connection::open(staging.join(DB_ENTRY)).unwrap();
        let (verified, mismatched, missing) = prepare_staged_database(&staged, &staging, &phone_root).unwrap();
        assert_eq!(verified, 1);
        assert_eq!(mismatched, vec!["ev2".to_string()]);
        assert!(missing.is_empty());

        let path: String = staged.query_row("SELECT file_path FROM evidence WHERE id = 'ev1'", [], |r| r.get(0)).unwrap();
        assert_eq!(PathBuf::from(&path), phone_root.join("evidence_originals").join("ev1").join("file.jpg"));

        record_restore(&staged, &read, verified, &mismatched, &missing, Path::new("/tmp/pre.db")).unwrap();
        let chain: i64 = staged
            .query_row("SELECT COUNT(*) FROM evidence_chain WHERE action = 'VAULT_TRANSFER_RESTORED'", [], |r| r.get(0))
            .unwrap();
        let flagged: i64 = staged
            .query_row("SELECT COUNT(*) FROM evidence_chain WHERE metadata_json LIKE '%HASH_MISMATCH%'", [], |r| r.get(0))
            .unwrap();
        let audit: i64 = staged
            .query_row("SELECT COUNT(*) FROM audit_ledger WHERE action = 'VAULT_TRANSFER_RESTORED' AND ledger_entry_hash IS NOT NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!((chain, flagged, audit), (2, 1, 1));
    }

    #[test]
    fn tampered_entry_aborts_restore() {
        let (root, conn) = desktop_vault();
        let (mut manifest, bytes) = package(&conn, &root);
        let entry = manifest.entries.iter_mut().find(|e| e.path == "evidence_originals/ev1/file.jpg").unwrap();
        entry.sha256 = "0".repeat(64);
        manifest.package_hash = package_hash(&manifest.entries); // attacker recomputes the manifest hash
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let err = extract_verified(&mut archive, &manifest, &temp_dir("tamper")).unwrap_err();
        assert!(err.contains("Integrity check failed"), "{err}");
    }

    // ─── G3: restore is never destructive ──────────────────────────────

    /// A full vault as the app creates it: every module's tables plus the seeded default case.
    fn g3_vault(name: &str) -> (PathBuf, rusqlite::Connection) {
        let root = temp_dir(name).join("Vault_System");
        crate::ensure_vault_system_layout(&root).unwrap();
        let conn = crate::init_db(root.join("database").join("proof_of_presence.db").to_str().unwrap());
        crate::reminders::init_reminder_tables(&conn).unwrap();
        crate::sync::init_sync_tables(&conn).unwrap();
        crate::google_calendar::init_gcal_tables(&conn).unwrap();
        (root, conn)
    }

    /// What a freshly installed app writes on first launch before the user does anything.
    fn g3_first_launch(conn: &rusqlite::Connection) {
        conn.execute(
            "INSERT INTO reminder_settings (key, value_json, updated_at) VALUES ('settings', '{\"last_device_time_zone\":\"America/Chicago\"}', '2026-10-21T20:00:00+00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO audit_ledger (id, record_id, action, payload_hash, hash, created_at, metadata_json, previous_ledger_hash, ledger_entry_hash)
             VALUES ('tz', 'device_time_zone', 'DEVICE_TIME_ZONE_RECORDED', 'p', 'p', '2026-10-21T20:00:00+00:00', '{}', NULL, 'h')",
            [],
        )
        .unwrap();
    }

    fn g3_evidence(conn: &rusqlite::Connection, root: &Path, id: &str, bytes: &[u8]) {
        let dir = root.join("evidence_originals").join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("photo.jpg"), bytes).unwrap();
        let path = dir.join("photo.jpg").to_string_lossy().to_string();
        conn.execute(
            "INSERT INTO evidence (id, type, title, file_path, sha256, created_at) VALUES (?1, 'photo', ?1, ?2, ?3, '2026-10-14T10:00:00+00:00')",
            rusqlite::params![id, path, sha256_hex(bytes)],
        )
        .unwrap();
        insert_evidence_chain(conn, id, "EVIDENCE_SAVED", &sha256_hex(bytes), "{}".into()).unwrap();
    }

    /// Runs the real restore path (stage_restore + apply_restore) from `src` into `dst`.
    fn g3_restore(src: &rusqlite::Connection, src_root: &Path, dst: &mut rusqlite::Connection, dst_root: &Path) -> Result<RestoreReport, String> {
        let (manifest, cursor) = write_package(src, src_root, Cursor::new(Vec::new()), "windows", "1.0.0").unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(cursor.into_inner())).unwrap();
        let staging = dst_root.join("temp_exports").join(format!("restore-{}", uuid::Uuid::new_v4()));
        let staged = stage_restore(&mut archive, &manifest, &staging, dst_root)?;
        apply_restore(dst, staged, &manifest, &staging, dst_root)
    }

    fn g3_count(conn: &rusqlite::Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    fn g3_snapshots(root: &Path) -> usize {
        fs::read_dir(vault_database_dir(root))
            .unwrap()
            .filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().starts_with("pre-restore-"))
            .count()
    }

    #[test]
    fn g3_restore_into_freshly_launched_device_succeeds_and_pins_replaced_state() {
        let (desk_root, desk) = g3_vault("g3-desk");
        g3_evidence(&desk, &desk_root, "d1", b"desktop photo");
        let (phone_root, mut phone) = g3_vault("g3-phone");
        g3_first_launch(&phone);

        let report = g3_restore(&desk, &desk_root, &mut phone, &phone_root).expect("fresh device must accept a restore");
        assert_eq!(report.evidence_count, 1);
        assert_eq!(report.originals_verified, 1);
        let snapshot_hash: Option<String> = phone
            .query_row(
                "SELECT json_extract(metadata_json, '$.pre_restore_snapshot_sha256') FROM audit_ledger WHERE action = 'VAULT_TRANSFER_RESTORED'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(snapshot_hash.as_deref(), Some(hash_file(Path::new(&report.pre_restore_snapshot)).unwrap().as_str()));
    }

    #[test]
    fn g3_refuses_when_device_has_evidence_the_package_lacks_and_changes_nothing() {
        let (desk_root, desk) = g3_vault("g3-desk2");
        g3_evidence(&desk, &desk_root, "d1", b"desktop photo");
        let (phone_root, mut phone) = g3_vault("g3-phone2");
        g3_first_launch(&phone);
        g3_evidence(&phone, &phone_root, "p1", b"phone-only capture");

        let err = g3_restore(&desk, &desk_root, &mut phone, &phone_root).unwrap_err();
        assert!(err.contains("Restore refused") && err.contains("evidence: 1") && err.contains("evidence_chain: 1"), "{err}");
        // Nothing changed: no snapshot, no copied originals, the phone's records intact.
        assert_eq!(g3_snapshots(&phone_root), 0);
        assert!(!phone_root.join("evidence_originals").join("d1").exists());
        assert_eq!(g3_count(&phone, "SELECT COUNT(*) FROM evidence WHERE id = 'p1'"), 1);
        assert_eq!(g3_count(&phone, "SELECT COUNT(*) FROM evidence WHERE id = 'd1'"), 0);
    }

    #[test]
    fn g3_refuses_when_a_shared_record_was_edited_on_the_device() {
        let (desk_root, desk) = g3_vault("g3-desk3");
        g3_evidence(&desk, &desk_root, "d1", b"desktop photo");
        let (phone_root, mut phone) = g3_vault("g3-phone3");
        g3_restore(&desk, &desk_root, &mut phone, &phone_root).unwrap();

        // The phone now holds its own custody rows for the restore; edit a title as well.
        phone.execute("UPDATE evidence SET title = 'Edited on phone' WHERE id = 'd1'", []).unwrap();
        let err = g3_restore(&desk, &desk_root, &mut phone, &phone_root).unwrap_err();
        assert!(err.contains("evidence: 1"), "{err}");
        assert_eq!(g3_count(&phone, "SELECT COUNT(*) FROM evidence WHERE title = 'Edited on phone'"), 1);
    }

    #[test]
    fn g3_refuses_when_the_default_case_was_edited_but_ignores_the_untouched_seed() {
        let (desk_root, desk) = g3_vault("g3-desk4");
        let (phone_root, mut phone) = g3_vault("g3-phone4");
        phone
            .execute("UPDATE case_matters SET case_number = '24-DR-1187', updated_at = '2026-10-21T21:00:00+00:00' WHERE id = 'primary'", [])
            .unwrap();
        let err = g3_restore(&desk, &desk_root, &mut phone, &phone_root).unwrap_err();
        assert!(err.contains("case_matters: 1"), "{err}");
    }

    #[test]
    fn g3_refuses_to_overwrite_an_original_with_different_bytes() {
        let (desk_root, desk) = g3_vault("g3-desk5");
        g3_evidence(&desk, &desk_root, "x1", b"desktop bytes");
        let (phone_root, mut phone) = g3_vault("g3-phone5");
        let orphan = phone_root.join("evidence_originals").join("x1");
        fs::create_dir_all(&orphan).unwrap();
        fs::write(orphan.join("photo.jpg"), b"different bytes on the phone").unwrap();

        let err = g3_restore(&desk, &desk_root, &mut phone, &phone_root).unwrap_err();
        assert!(err.contains("would overwrite evidence_originals/x1/photo.jpg"), "{err}");
        assert_eq!(fs::read(orphan.join("photo.jpg")).unwrap(), b"different bytes on the phone");
    }

    #[test]
    fn g3_refuses_records_the_package_cannot_represent() {
        let (desk_root, desk) = g3_vault("g3-desk6");
        desk.execute_batch("DROP TABLE reminder_appointments").unwrap(); // older package format
        let (phone_root, mut phone) = g3_vault("g3-phone6");
        phone
            .execute(
                "INSERT INTO reminder_appointments (id, case_id, kind, title, location, notes, local_start, time_zone, start_utc, critical, offsets_json, status, source, revision, record_hash, created_at, updated_at)
                 VALUES ('a1','primary','court','Hearing','','','2026-11-20T09:00','America/Chicago','2026-11-20T15:00:00Z',1,'[]','confirmed','test',1,'h','2026-10-21T00:00:00Z','2026-10-21T00:00:00Z')",
                [],
            )
            .unwrap();
        let err = g3_restore(&desk, &desk_root, &mut phone, &phone_root).unwrap_err();
        assert!(err.contains("reminder_appointments: 1"), "{err}");
    }

    #[test]
    fn altered_manifest_fails_package_hash() {
        let (root, conn) = desktop_vault();
        let (mut manifest, bytes) = package(&conn, &root);
        manifest.entries.pop();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let err = extract_verified(&mut archive, &manifest, &temp_dir("altered")).unwrap_err();
        assert!(err.contains("package hash"), "{err}");
    }

    #[test]
    fn rejects_unsafe_paths_and_remaps_any_os() {
        assert!(safe_relative("../etc/passwd").is_err());
        assert!(safe_relative("/abs/file").is_err());
        assert!(safe_relative("evidence_originals/a/b.jpg").is_ok());
        let root = Path::new("/data/user/0/com.proofofpresence.app/Vault_System");
        assert_eq!(
            remap_vault_path("D:\\POPS\\Vault_System\\dossiers\\contacts\\x.json", root),
            Some(root.join("dossiers").join("contacts").join("x.json").to_string_lossy().to_string())
        );
        assert_eq!(remap_vault_path("/somewhere/else/file.txt", root), None);
    }

    // ─── Ledger continuity across devices (G1) ─────────────────────────────

    /// Appends one audit-ledger row exactly as the app's writers do
    /// (get_previous_ledger_hash + ledger_entry_hash), with an explicit device clock.
    fn append_ledger_at(conn: &rusqlite::Connection, record_id: &str, action: &str, created_at: &str) -> String {
        let payload_hash = sha256_hex(format!("{record_id}:{action}").as_bytes());
        let metadata = serde_json::json!({ "record_id": record_id, "action": action }).to_string();
        let previous = get_previous_ledger_hash(conn).unwrap();
        let entry = ledger_entry_hash(record_id, action, &payload_hash, created_at, &metadata, previous.as_deref());
        conn.execute(
            "INSERT INTO audit_ledger (id, record_id, action, payload_hash, hash, created_at, metadata_json, previous_ledger_hash, ledger_entry_hash)
             VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), record_id, action, payload_hash, created_at, metadata, previous, entry],
        )
        .unwrap();
        entry
    }

    fn ledger_status(conn: &rusqlite::Connection) -> (String, usize) {
        let status = crate::verify_audit_ledger_conn(conn).unwrap();
        (status.status, status.checked_rows)
    }

    fn vault_at(name: &str) -> (PathBuf, rusqlite::Connection) {
        let root = temp_dir(name).join("Vault_System");
        crate::ensure_vault_system_layout(&root).unwrap();
        let conn = crate::init_db(root.join("database").join("proof_of_presence.db").to_str().unwrap());
        (root, conn)
    }

    /// Evidence stored the way import_evidence_file + save_evidence store it.
    fn add_evidence(conn: &rusqlite::Connection, root: &Path, stored_root: &str, sep: char, id: &str, bytes: &[u8]) -> String {
        let dir = root.join("evidence_originals").join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("photo.jpg"), bytes).unwrap();
        let hash = sha256_hex(bytes);
        let stored = format!("{stored_root}{sep}evidence_originals{sep}{id}{sep}photo.jpg");
        conn.execute(
            "INSERT INTO evidence (id, type, title, file_path, sha256, created_at) VALUES (?1, 'photo', ?1, ?2, ?3, '2026-10-14T10:00:00+00:00')",
            rusqlite::params![id, stored, hash],
        )
        .unwrap();
        insert_evidence_chain(conn, id, "EVIDENCE_SAVED", &hash, serde_json::json!({ "evidence_id": id }).to_string()).unwrap();
        hash
    }

    /// Full restore as restore_from_archive performs it (package -> verified extract ->
    /// staged rewrite -> pre-restore snapshot -> file copy -> SQLite backup swap -> record_restore).
    fn transfer(src: &rusqlite::Connection, src_root: &Path, platform: &str, dst_root: &Path, dst: &mut rusqlite::Connection) {
        let (manifest, bytes) = {
            let (m, cursor) = write_package(src, src_root, Cursor::new(Vec::new()), platform, "1.0.0").unwrap();
            (m, cursor.into_inner())
        };
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let staging = temp_dir("g1-staging");
        extract_verified(&mut archive, &manifest, &staging).unwrap();
        let staged = rusqlite::Connection::open(staging.join(DB_ENTRY)).unwrap();
        let (verified, mismatched, missing) = prepare_staged_database(&staged, &staging, dst_root).unwrap();
        let pre_restore = vault_database_dir(dst_root).join("pre-restore-test.db");
        snapshot_database(dst, &pre_restore).unwrap();
        for dir in INCLUDED_DIRS {
            if staging.join(dir).exists() {
                copy_tree(&staging.join(dir), &dst_root.join(dir)).unwrap();
            }
        }
        rusqlite::backup::Backup::new(&staged, dst)
            .unwrap()
            .run_to_completion(256, std::time::Duration::from_millis(0), None)
            .unwrap();
        drop(staged);
        record_restore(dst, &manifest, verified, &mismatched, &missing, &pre_restore).unwrap();
    }

    fn custody_rows(conn: &rusqlite::Connection, id: &str) -> Vec<(String, String, String, String)> {
        conn.prepare("SELECT id, action, hash, metadata_json FROM evidence_chain WHERE evidence_id = ?1 AND action != 'VAULT_TRANSFER_RESTORED' ORDER BY id")
            .unwrap()
            .query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn desktop_to_android_round_trip_keeps_identity_custody_and_ledger() {
        let (desk_root, desk) = vault_at("g1-desk");
        let hash = add_evidence(&desk, &desk_root, "C:\\Users\\pops\\Vault_System", '\\', "lx1abc_aaaa", b"desktop-photo");
        append_ledger_at(&desk, "rec-1", "OPERATIONAL_RECORD_SAVED", "2026-10-14T10:00:00+00:00");
        append_ledger_at(&desk, "rec-2", "REPORT_SAVED", "2026-10-14T11:00:00+00:00");
        assert_eq!(ledger_status(&desk), ("VERIFIED".into(), 2));
        let custody = custody_rows(&desk, "lx1abc_aaaa");

        let (phone_root, mut phone) = vault_at("g1-phone");
        transfer(&desk, &desk_root, "windows", &phone_root, &mut phone);

        let (sha, path): (String, String) = phone
            .query_row("SELECT sha256, file_path FROM evidence WHERE id = 'lx1abc_aaaa'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(sha, hash);
        assert!(Path::new(&path).starts_with(&phone_root), "{path}");
        assert_eq!(sha256_hex(&fs::read(&path).unwrap()), hash);
        assert_eq!(custody_rows(&phone, "lx1abc_aaaa"), custody);
        assert_eq!(ledger_status(&phone), ("VERIFIED".into(), 3));
    }

    #[test]
    fn android_to_desktop_round_trip_keeps_capture_metadata_and_ledger() {
        let android_root = "/data/user/0/com.proofofpresence.app/Vault_System";
        let (phone_root, phone) = vault_at("g1-phone2");
        let hash = add_evidence(&phone, &phone_root, android_root, '/', "m9cam_cccc", b"camera-bytes");
        phone
            .execute(
                "INSERT INTO evidence_metadata (evidence_id, document_id, file_hash, file_path, exif_json, gps_lat, gps_lon, device_identity, timestamp_utc)
                 VALUES ('m9cam_cccc', 'm9cam_cccc', ?1, ?2, '{\"accuracy_m\":8}', 37.0842, -94.5133, 'POPS android', '2026-10-21T17:00:00+00:00')",
                rusqlite::params![hash, format!("{android_root}/evidence_originals/m9cam_cccc/photo.jpg")],
            )
            .unwrap();
        append_ledger_at(&phone, "rem-1", "REMINDER_SAVED", "2026-10-21T17:00:05+00:00");
        let custody = custody_rows(&phone, "m9cam_cccc");

        let (desk_root, mut desk) = vault_at("g1-desk2");
        transfer(&phone, &phone_root, "android", &desk_root, &mut desk);

        let (lat, lon, device, meta_path): (f64, f64, String, String) = desk
            .query_row("SELECT gps_lat, gps_lon, device_identity, file_path FROM evidence_metadata WHERE evidence_id = 'm9cam_cccc'", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .unwrap();
        assert_eq!((lat, lon, device.as_str()), (37.0842, -94.5133, "POPS android"));
        assert!(Path::new(&meta_path).starts_with(&desk_root), "{meta_path}");
        let sha: String = desk.query_row("SELECT sha256 FROM evidence WHERE id = 'm9cam_cccc'", [], |r| r.get(0)).unwrap();
        assert_eq!(sha, hash);
        assert_eq!(custody_rows(&desk, "m9cam_cccc"), custody);
        assert_eq!(ledger_status(&desk), ("VERIFIED".into(), 2));
    }

    #[test]
    fn restore_rejects_forked_incoming_ledger_before_touching_the_device() {
        let (desk_root, desk) = vault_at("g1-fork-desk");
        add_evidence(&desk, &desk_root, "C:\\POPS\\Vault_System", '\\', "fk1_hhhh", b"z");
        let genesis = append_ledger_at(&desk, "rec-1", "REPORT_SAVED", "2026-10-14T10:00:00+00:00");
        append_ledger_at(&desk, "rec-2", "REPORT_SAVED", "2026-10-14T11:00:00+00:00");
        let fork = ledger_entry_hash("rec-x", "REPORT_SAVED", "p", "2026-10-14T12:00:00+00:00", "{}", Some(&genesis));
        desk.execute(
            "INSERT INTO audit_ledger (id, record_id, action, payload_hash, hash, created_at, metadata_json, previous_ledger_hash, ledger_entry_hash)
             VALUES ('fork', 'rec-x', 'REPORT_SAVED', 'p', 'p', '2026-10-14T12:00:00+00:00', '{}', ?1, ?2)",
            rusqlite::params![genesis, fork],
        )
        .unwrap();

        let (manifest, cursor) = write_package(&desk, &desk_root, Cursor::new(Vec::new()), "windows", "1.0.0").unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(cursor.into_inner())).unwrap();
        let staging = temp_dir("g1-fork-staging");
        extract_verified(&mut archive, &manifest, &staging).unwrap();
        let staged = rusqlite::Connection::open(staging.join(DB_ENTRY)).unwrap();

        let (phone_root, phone) = vault_at("g1-fork-phone");
        let err = prepare_staged_database(&staged, &staging, &phone_root).unwrap_err();
        assert!(err.contains("Transfer package rejected") && err.contains("not linear"), "{err}");
        let phone_evidence: i64 = phone.query_row("SELECT COUNT(*) FROM evidence", [], |r| r.get(0)).unwrap();
        assert_eq!(phone_evidence, 0);
    }

    /// Regression for G1: the sending desktop's clock is two minutes ahead of the phone.
    /// The restore entry and the phone's next entry carry earlier wall-clock times than the
    /// desktop's last entry; the ledger must still verify and stay a single linear chain.
    #[test]
    fn two_minute_clock_skew_between_devices_still_verifies() {
        let (desk_root, desk) = vault_at("g1-skew-desk");
        add_evidence(&desk, &desk_root, "C:\\POPS\\Vault_System", '\\', "sk1_dddd", b"x");
        append_ledger_at(&desk, "rec-1", "REPORT_SAVED", "2026-10-14T10:00:00+00:00");
        let desktop_ahead = (chrono::Utc::now() + chrono::Duration::seconds(120)).to_rfc3339();
        let desktop_tip = append_ledger_at(&desk, "rec-2", "REPORT_SAVED", &desktop_ahead);
        assert_eq!(ledger_status(&desk), ("VERIFIED".into(), 2));

        let (phone_root, mut phone) = vault_at("g1-skew-phone");
        transfer(&desk, &desk_root, "windows", &phone_root, &mut phone);
        let restore_prev: Option<String> = phone
            .query_row("SELECT previous_ledger_hash FROM audit_ledger WHERE action = 'VAULT_TRANSFER_RESTORED'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(restore_prev.as_deref(), Some(desktop_tip.as_str()));
        assert_eq!(ledger_status(&phone), ("VERIFIED".into(), 3));

        // The phone keeps working on its own (slower) clock after the restore.
        append_ledger_at(&phone, "rem-1", "REMINDER_SAVED", &chrono::Utc::now().to_rfc3339());
        assert_eq!(ledger_status(&phone), ("VERIFIED".into(), 4));
        let forks: i64 = phone
            .query_row(
                "SELECT COUNT(*) FROM (SELECT previous_ledger_hash FROM audit_ledger WHERE previous_ledger_hash IS NOT NULL GROUP BY previous_ledger_hash HAVING COUNT(*) > 1)",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(forks, 0, "ledger forked");
    }
}
