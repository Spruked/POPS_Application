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
    extract_verified(archive, manifest, staging)?;
    let staged_db = rusqlite::Connection::open(staging.join(DB_ENTRY)).map_err(|e| e.to_string())?;
    let (verified, mismatched, missing) = prepare_staged_database(&staged_db, staging, vault_root)?;

    let db = app.state::<DbConn>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;

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
        let backup = rusqlite::backup::Backup::new(&staged_db, &mut conn).map_err(|e| e.to_string())?;
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
}
