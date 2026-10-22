# POPS Mobile (Tauri 2 — Android & iOS)

Branch: `mobile-tauri-v2`. `main` and the desktop workflow are unchanged.

The mobile apps are the **same POPS application**: same React UI, same Rust commands,
same SQLite schema, same evidence hashing / chain-of-custody / audit ledger, same
Lexicon governance. Nothing was rewritten, and no new auth or storage was introduced.

## What changed

| Area | Change |
|---|---|
| Tauri | 1.8.3 → 2.x (`tauri migrate`). Allowlist → `src-tauri/capabilities/migrated.json`. Plugins: fs, dialog, shell, notification |
| Rust entry | `src-tauri/src/main.rs` → `lib.rs` with `#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()`; `main.rs` calls it |
| Vault path | `tauri::api::path::app_data_dir` → `app.path().app_data_dir()`. Mobile always uses `<app data>/Vault_System` (same layout); desktop resolution order unchanged |
| reqwest | rustls instead of OpenSSL (no cross-compiled OpenSSL for mobile) |
| ORB services | `local_agent.rs`: on mobile, llama.cpp/TPC/STT/TTS probes and WSL OCR return `desktop_only` instead of timing out. New `platform_capabilities` command |
| ORB UI | `PopsAssistant.tsx` reads capabilities: mobile = guided mode (existing `makeCoreResponse`), lists what works on the device, no service polling, full-screen sheet |
| Dictation | `DictationButton.tsx` explains desktop-only unless `VITE_STT_ENDPOINT` is set |
| Navigation | ≤760px: existing `Sidebar` becomes a drawer; `MobileNav.tsx` adds top bar (menu / section / ORB) and bottom bar (Dashboard, Contacts, Calendar, Evidence, More) |
| Styles | `src/styles/pops-mobile.css` (safe areas, 44px targets, single-column forms). Uses existing tokens |
| JS imports | `@tauri-apps/api/tauri` → `@tauri-apps/api/core`; dialog/fs → plugins |
| iOS | `src-tauri/Info.ios.plist` camera/photo/mic usage strings |
| Dev server | `vite.config.ts` honours `TAURI_DEV_HOST` for device dev |
| CI | `.github/workflows/mobile-build.yml` |

Doctrine pages, Lexicon JSON, and all page content were not edited.

## Local commands

```bash
npm install
npm run tauri dev                 # desktop (unchanged)
npx tauri icon public/popsbadge.png
npx tauri android init            # needs Android Studio SDK + NDK, JDK 17
npx tauri android dev             # emulator / USB device
npx tauri android build           # APK + AAB (unsigned)
npx tauri ios init                # macOS + Xcode only
npx tauri ios dev
npx tauri ios build --export-method app-store-connect
```

## Platform requirements remaining

- **Android**: JDK 17, Android SDK + NDK (`NDK_HOME`), rust targets `aarch64/armv7/i686/x86_64-linux-android`. Release signing keystore for Play Store.
- **iOS**: macOS + Xcode, Apple Developer account, `APPLE_DEVELOPMENT_TEAM`. For CI IPA: secrets `APPLE_DEVELOPMENT_TEAM`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8`.
- **Desktop-only on mobile**: TPC/llama.cpp chat, WSL OCR, Qwen TTS, faster-whisper dictation, R-drive substrate research. They can be enabled later by pointing to a reachable endpoint.
- **Data**: each device has its own local SQLite vault. Moving a desktop vault to a phone uses the existing Data Backup export; there is no sync.

## Evidence capture (mobile additions)

- **Capture Photo** (Evidence Vault and ORB): original bytes go through `import_evidence_file` → `save_evidence` → `verify_evidence_integrity`. No re-encoding.
- **Attach location** (opt-in): the device GPS goes into `evidence_metadata` (`gps_lat`/`gps_lon`, accuracy in `exif_json`) via `submit_evidence`, which adds an `EVIDENCE_METADATA_SUBMITTED` chain row.
- **Evidence Detail map**: coordinates come from the local vault. OpenStreetMap tiles load only after the user taps "Show map".
- **Reports**: the Evidence Summary (Evidence Index) and Attorney Packet include capture locations, via the read-only `get_evidence_locations` command.
- **Android CI** adds the `CAMERA`, `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` permissions to the generated manifest. It also builds an installable **debug APK** (aarch64 + x86_64) alongside the unsigned release outputs.

## Full Case Bundle: capture locations

`export_full_case_bundle` now also writes `capture_locations.json`, built from the same query (`query_evidence_locations`) that Reports uses. Each entry has the evidence id, file hash, GPS, accuracy, capture time and device. `manifest.json` lists the file and gives `capture_location_count`. `evidence_index.json` is unchanged.

## Android release signing (Play Store)

1. Create an upload keystore once and keep it safe. Losing it blocks updates.
   ```bash
   keytool -genkey -v -keystore pops-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pops-upload
   base64 -w0 pops-upload.jks > pops-upload.jks.b64   # macOS: base64 -i pops-upload.jks
   ```
2. In GitHub, go to Settings → Secrets and variables → Actions and add:
   `ANDROID_KEY_BASE64` (contents of the .b64 file), `ANDROID_KEY_ALIAS` (`pops-upload`), `ANDROID_KEY_PASSWORD`.
3. On the next CI run, `scripts/ci/android_signing.py` adds a release `signingConfig` to the generated `app/build.gradle.kts`. The AAB in the `pops-android` artifact is then signed and ready for Play Console upload. Enrol in Play App Signing when you create the app.

## Vault Transfer (Settings → Vault Transfer)

This moves a whole vault between devices, for example from desktop to phone. The package is a `.popsvault` file (zip, format `pops-vault-transfer/1`):
- `manifest.json`: every entry's SHA-256 and size, plus a package hash over the sorted entries
- `database/proof_of_presence.db`: a consistent `VACUUM INTO` snapshot
- the vault folders: evidence_originals, communication_exports, case_bundles, exports, dossiers, child_support_ledger, operational_records, browser_records

Restore order:
1. Check the package hash.
2. Extract every entry to staging and re-hash it. Any mismatch aborts, and nothing on the device changes.
3. Run SQLite `integrity_check`.
4. Re-hash each evidence original against its recorded sha256. Mismatches are flagged, not hidden.
5. Rewrite the Windows/macOS/Linux vault paths for this device.
6. Save a `pre-restore-<time>.db` snapshot.
7. Copy the files and swap in the database with the SQLite backup API.
8. Add one `VAULT_TRANSFER_RESTORED` chain-of-custody row per evidence item, plus one hash-linked audit-ledger entry.

Android `content://` picks are opened through `tauri-plugin-fs`. Rust tests cover the round trip, a tampered entry, an altered manifest, path traversal, and cross-OS path remapping.

## iOS signing (CI)

Add these secrets: `APPLE_DEVELOPMENT_TEAM` (the 10-character Team ID), `APPLE_API_ISSUER`, `APPLE_API_KEY` (the Key ID), and `APPLE_API_KEY_P8` (the contents of the .p8 file). Create the key in App Store Connect → Users and Access → Integrations → App Store Connect API with the App Manager role.

Register the bundle ID `com.proofofpresence.app` in the Apple Developer portal. To upload builds to TestFlight automatically, set the repository variable `IOS_UPLOAD_TESTFLIGHT=true`.

## Court & Appointment Reminders (Phase 1: local reminder engine)

Case Calendar → **Reminders**. Code: `src-tauri/src/reminders.rs` (engine), `src/utils/reminderRuntime.ts` (device scheduling), `src/pages/Reminders.tsx`, `src/components/ReminderBanner.tsx`.

- **Vault law:** tables `reminder_appointments`, `reminder_slots` and `reminder_settings` live in `Vault_System/database/proof_of_presence.db`. Every create, confirm, revise, cancel, schedule attempt, delivery and acknowledgment is mirrored to `browser_records/reminder_*` and chained into `audit_ledger`. Vault Transfer carries reminders to Android and iOS automatically.
- **Court time zone:** the venue's wall-clock time and IANA zone (chrono-tz, bundled and offline) are stored with each appointment. Clock-change gaps are rejected; repeated hours warn.
- **Default court sequence:** 7d, 3d, 24h, 3h, 1h before (adjustable per appointment and as a default). Court dates are always critical.
- **Phone:** once you confirm an appointment, its reminders are handed to the OS scheduler (`Schedule.at`, allowed while idle), so they fire with POPS closed and with no internet. Android re-arms them after a reboot (the plugin's boot receiver). iOS allows at most 64 pending notifications, so POPS keeps the nearest 60 (court first) and refills them as earlier ones pass.
- **Acknowledgment:** only the "Seen it" button (on the notification, the in-app banner or the Reminders page) counts. Delivery is never treated as acknowledgment.
- **Escalation:** each critical reminder has follow-up alerts 10 and 30 minutes later. They're scheduled up front, so they work offline, and are cancelled once you tap "Seen it".
- **Device time-zone change:** POPS detects it, records it in the audit ledger, shows a banner and re-syncs reminders.
- **Revisions are never silent:** editing an appointment supersedes the old reminders (kept for the record) and cancels them on the device.
- **Desktop:** reminders alert only while POPS is open (the notification plugin has no desktop scheduler).
- **Android permissions (added in CI):** `USE_EXACT_ALARM` (Android 13+), `SCHEDULE_EXACT_ALARM` (Android 12, maxSdk 32), plus the plugin's `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`. Play Console requires the exact-alarm declaration ("calendar / reminder app").
- **Limits (shown in the app):** no phone app can guarantee that every alert is seen. Battery savers, Do Not Disturb, a phone that's switched off or notifications turned off can stop alerts.

## Older devices

- Minimum: Android 7.0 (API 24) and iOS 15 (Tauri v2 defaults). The CI emulator smoke test now runs on API 24 and API 33 and records the WebView version.
- `index.html` checks for a Chrome 87+ web engine before POPS loads. On an outdated Android System WebView it shows "update Android System WebView" instead of a blank screen.

## Capture metadata (C1)

After a photo or file is sealed, `record_capture_metadata` (`src-tauri/src/capture_metadata.rs`) reads the **stored** original. It refuses if the bytes no longer match the recorded SHA-256, then records two things in `evidence_capture_metadata`. The original bytes are never modified.

- **EXIF facts as found:** `DateTimeOriginal`, `OffsetTimeOriginal` and GPS, plus camera make/model, software and the EXIF modify time. Each fact has a status. Absent, blank, incomplete (for example, a missing hemisphere) or invalid values are recorded as such, with their raw form, and are never reconstructed. A tag stored with a non-standard type is recorded as invalid, with its value as found, never as missing. A capture time without a recorded offset stays local time, with no zone assumed.
- **Acquisition path,** decided in Rust from the platform, the requested source and the stored file name:

| Path | When | Original camera bytes |
|---|---|---|
| `android_camera_capture_intent` | Camera button, and the file has the name (`JPEG_yyyyMMdd_HHmmss_<digits>.jpg`) and a creation time (at most 15 minutes before recording) of the file Pops! asks the camera app to write | indicated: the WebView doesn't report which app delivered the file, and other camera apps use the same naming, so this is not proof |
| `android_camera_requested_picker_fallback` | Camera button, but `wry` fell back to the file picker, or the file is named like a capture file but its time doesn't match this capture | not established |
| `android_content_picker` | Gallery/file button (`ACTION_GET_CONTENT`); location may have been removed by Android | not established |
| `desktop_file_selection` | Desktop file import | not established (file as read from disk) |
| `ios_file_chooser` | iOS (not yet characterized) | unknown |

`established` is reserved for a path where the platform itself reports which component delivered the file. No current path does.

These facts are kept apart from Pops!'s own GPS reading (`evidence_metadata`) and the import time (`evidence.imported_at`). Each evidence record's capture metadata is written once, atomically with a custody row and a hash-linked audit entry. The camera rules describe `wry` 0.57.0's Android file chooser, and a test fails if `wry` changes so they get re-verified. EXIF values can be edited before import; they are supporting context, not proof of presence.

## Device Sync (Phase 2: desktop ↔ phone)

Settings → **Device Sync**. Code: `src-tauri/src/sync.rs`, `src/pages/DeviceSync.tsx`.

- **Desktop is authoritative.** Phones send their new appointments, edits and "Seen it" confirmations. The desktop returns its schedule.
- **Pairing:** on the desktop, Create pairing code; on the phone, paste the `POPS1.…` code. Each phone gets its own 256-bit secret and can be revoked.
- **Security:** every message is end-to-end encrypted and authenticated (ChaCha20-Poly1305, key derived from the pairing secret), bound to the device id and a timestamp (5-minute replay window). Wrong or revoked devices are refused.
- **Conflicts are never overwritten:** if both sides changed the same appointment since the last agreed version, a conflict is stored on that side and shown on Device Sync with both versions. You pick which one to keep, and the decision syncs on the next exchange.
- **When:** phones sync on app open, when returning to the app, every 5 minutes while open, and with Sync now. Reminders already scheduled on the phone keep working with no desktop or internet.
- **Same Wi-Fi:** the desktop listens on port **47615** while POPS is open (allow it through Windows Firewall).
- **Away from home (secure gateway):** add an ingress rule to your existing Cloudflare Tunnel (`spruked-prod`) **without touching the website routes**, for example:
  ```yaml
  - hostname: sync.popsproof.com
    service: http://<windows-host-ip-from-WSL>:47615   # e.g. the WSL gateway 172.19.80.1
  ```
  Then enter `https://sync.popsproof.com` as the secure gateway address before creating the pairing code. The path `/pops-sync/v1/exchange` is the only endpoint, and it accepts only encrypted, paired messages.
- **Audit:** pairing, every exchange, conflicts and resolutions are recorded in the audit ledger (`sync_event`).

## Google Calendar + free email reminders (desktop)

Settings → Device Sync → **Google Calendar**. Code: `src-tauri/src/google_calendar.rs`.

1. Google Cloud Console (free) → create a project → enable **Google Calendar API** → OAuth consent screen (External; add yourself as a test user) → Credentials → **OAuth client ID → Desktop app**. Copy the client ID.
2. In POPS Desktop, paste the client ID → **Connect Google Calendar** → approve in the browser (PKCE, loopback on 127.0.0.1).
3. **Sync to Google** copies confirmed appointments (court time zone kept; up to 5 popup reminders from your intervals) and removes cancelled ones.
- **Email reminders:** tick "Also send me email reminders". Google Calendar itself emails you 24 hours before. No email service and no fees.
- **Privacy:** only the title, location and time are sent. Case notes never are. The client ID and Google sign-in token are kept in the app config folder, **not in the vault**, so Vault Transfer never copies them.
- **Never overwritten from Google:** if an event was moved in Google Calendar, POPS reports it and keeps its own time.
- **Phones:** events show up in the phone's Google Calendar app automatically. POPS on the phone gets the schedule through Device Sync.
- **Before public release:** Google requires OAuth app verification for the `calendar.events` scope once you go beyond 100 test users.
