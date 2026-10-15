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
