#!/usr/bin/env bash
# CI only. Runs inside the API 26 AOSP emulator job.
#  1. Replace the image's stock WebView (com.android.webview) with the pinned,
#     verified AOSP prebuilt fetched by fetch_aosp_webview.sh, and prove it is active.
#  2. Install and launch the POPS debug APK.
#  3. Verify the real interface: Case Overview renders, then navigate
#     Evidence -> Calendar -> Dashboard and verify each page's top-bar title.
# Every step leaves a screenshot and UI dump in $OUT; results go to results.txt.
set -euo pipefail

APP_APK="$1"
WEBVIEW_APK="$2"
OUT="${3:-ui-api26}"
OVERLAY_APK="${4:-}"   # provider-list overlay from build_webview_provider_overlay.sh
PKG="com.proofofpresence.app"
mkdir -p "$OUT"
RESULTS="$OUT/results.txt"
: > "$RESULTS"

log() { echo "$*" | tee -a "$RESULTS"; }
fail() { log "FAIL: $*"; adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true; exit 1; }

wait_for_boot() {
  for _ in $(seq 1 120); do
    [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && return 0
    sleep 2
  done
  fail "emulator did not finish booting"
}

webview_version() {
  adb shell dumpsys webviewupdate | tr -d '\r' | sed -nE 's/.*Current WebView package \(name, version\): \(([^,]+), ([^)]+)\).*/\1 \2/p' | head -1
}

# ---- 1. WebView -------------------------------------------------------------
adb root >/dev/null; sleep 2; adb wait-for-device; wait_for_boot
log "stock_webview: $(webview_version)"
adb shell dumpsys webviewupdate > "$OUT/webviewupdate-before.txt"

adb remount > "$OUT/remount.txt" 2>&1 || fail "adb remount failed: $(cat "$OUT/remount.txt")"
if adb install -r "$WEBVIEW_APK" > "$OUT/webview-install.txt" 2>&1; then
  log "webview_install: adb install -r (update)"
else
  # The image's com.android.webview is signed with a different key: replace the system copy.
  log "webview_install: system replace ($(grep -o 'INSTALL_FAILED_[A-Z_]*' "$OUT/webview-install.txt" | head -1))"
  SYS_APK=$(adb shell pm path com.android.webview | tr -d '\r' | sed 's/^package://' | head -1)
  [ -n "$SYS_APK" ] || fail "stock com.android.webview not found"
  WV_DIR=$(dirname "$SYS_APK")
  adb shell rm -rf "$WV_DIR/oat" "$WV_DIR/lib"
  adb push "$WEBVIEW_APK" "$SYS_APK" > /dev/null
  # The AOSP prebuilt expects the OS build to extract its native libraries, so the
  # loader can't use them from inside the APK. Extract them from the same verified
  # APK into the directory the loader searches first.
  LIB_TMP=$(mktemp -d)
  unzip -q -o "$WEBVIEW_APK" 'lib/x86_64/*' 'lib/x86/*' -d "$LIB_TMP" 2>/dev/null || true
  for ABI in x86_64 x86; do
    if ls "$LIB_TMP/lib/$ABI/"*.so > /dev/null 2>&1; then
      adb shell mkdir -p "$WV_DIR/lib/$ABI"
      for SO in "$LIB_TMP/lib/$ABI/"*.so; do adb push "$SO" "$WV_DIR/lib/$ABI/" > /dev/null; done
      log "webview_libs_$ABI: $(cd "$LIB_TMP/lib/$ABI" && ls *.so | tr '\n' ' ')"
    fi
  done
  adb shell chmod -R 755 "$WV_DIR/lib" 2>/dev/null || true
  adb shell "find $WV_DIR/lib -name '*.so' -exec chmod 644 {} +" 2>/dev/null || true
  adb shell restorecon -R "$WV_DIR" > /dev/null 2>&1 || true
  adb shell ls -lZR "$WV_DIR" | tr -d '\r' > "$OUT/webview-system-files.txt"
fi
if [ -n "$OVERLAY_APK" ]; then
  # Static overlay adding com.android.webview to the image's WebView provider list.
  OVERLAY_DIR=/vendor/overlay
  adb shell "mkdir -p $OVERLAY_DIR" 2>/dev/null || OVERLAY_DIR=/system/vendor/overlay
  adb shell "mkdir -p $OVERLAY_DIR" || fail "cannot create $OVERLAY_DIR"
  adb push "$OVERLAY_APK" "$OVERLAY_DIR/PopsCiWebViewProvider.apk" > /dev/null
  adb shell chmod 755 "$OVERLAY_DIR"
  adb shell chmod 644 "$OVERLAY_DIR/PopsCiWebViewProvider.apk"
  # A directory created over adb gets the generic vendor_file label, which the overlay
  # loader (idmap, system_server) is denied. Apply the policy's own labels.
  adb shell restorecon -R "$OVERLAY_DIR" > /dev/null 2>&1 || true
  if ! adb shell ls -Zd "$OVERLAY_DIR" | grep -q vendor_overlay_file; then
    adb shell chcon u:object_r:vendor_overlay_file:s0 "$OVERLAY_DIR" "$OVERLAY_DIR/PopsCiWebViewProvider.apk"
  fi
  adb shell ls -Zd "$OVERLAY_DIR" "$OVERLAY_DIR/PopsCiWebViewProvider.apk" | tr -d '\r' > "$OUT/overlay-labels.txt"
  log "provider_overlay: $OVERLAY_DIR/PopsCiWebViewProvider.apk ($(tr '\n' ' ' < "$OUT/overlay-labels.txt"))"
fi
adb reboot
adb wait-for-device; wait_for_boot
adb root >/dev/null; sleep 2; adb wait-for-device
adb shell cmd overlay list > "$OUT/overlays.txt" 2>&1 || true

adb shell dumpsys webviewupdate > "$OUT/webviewupdate-after.txt"
ACTIVE=$(webview_version)
log "active_webview: $ACTIVE"
[ "$ACTIVE" = "com.android.webview 109.0.5414.123" ] || fail "pinned WebView is not the active provider"

# ---- 2. Install and launch POPS --------------------------------------------
adb install -r -g "$APP_APK" > "$OUT/app-install.txt" 2>&1 || fail "POPS install failed: $(tail -1 "$OUT/app-install.txt")"
adb logcat -c 2>/dev/null || true
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null

dump() {  # $1 = step name
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
  adb pull /sdcard/ui.xml "$OUT/$1.xml" > /dev/null 2>&1 || true
  adb exec-out screencap -p > "$OUT/$1.png"
}

expect_title() {  # $1 = step, $2 = top-bar title; polls up to ~60 s
  for _ in $(seq 1 20); do
    sleep 3
    dump "$1"
    if [ -s "$OUT/$1.xml" ] && python3 scripts/ci/ui_find.py "$OUT/$1.xml" topbar-title "$2" > /dev/null; then
      log "PASS: $1: top bar shows '$2'"
      return 0
    fi
  done
  if [ -s "$OUT/$1.xml" ] && python3 scripts/ci/ui_find.py "$OUT/$1.xml" contains "update your phone" ; then
    fail "$1: POPS shows its WebView-update screen"
  fi
  fail "$1: top bar never showed '$2'"
}

tap_tab() {  # $1 = step whose dump to read, $2 = tab label
  XY=$(python3 scripts/ci/ui_find.py "$OUT/$1.xml" tap-tab "$2") || fail "tab '$2' not found on screen"
  adb shell input tap $XY
  log "tap: '$2' at $XY"
}

# ---- 3. Interface checks -----------------------------------------------------
expect_title 01-launch "Case Overview"
python3 scripts/ci/ui_find.py "$OUT/01-launch.xml" contains "Quick Incident Log" \
  && log "PASS: 01-launch: Case Overview content rendered (Quick Incident Log)" \
  || fail "01-launch: Case Overview content missing"

tap_tab 01-launch "Evidence";  expect_title 02-evidence "Evidence Vault"
tap_tab 02-evidence "Calendar"; expect_title 03-calendar "Case Calendar"
tap_tab 03-calendar "Dashboard"; expect_title 04-dashboard "Case Overview"

PID=$(adb shell pidof "$PKG" | tr -d '\r' || true)
[ -n "$PID" ] || fail "POPS process not running after navigation"
log "pops_pid: $PID"
adb logcat -d > "$OUT/logcat.txt"
if grep -qE "FATAL EXCEPTION|panicked at" "$OUT/logcat.txt"; then fail "crash in logcat"; fi
log "PASS: no crashes"
log "RESULT: API 26 interface validation passed"
