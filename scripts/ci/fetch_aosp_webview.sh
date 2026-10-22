#!/usr/bin/env bash
# CI only. Fetches the AOSP prebuilt Android System WebView pinned below from Google's
# AOSP git host and proves the bytes are exactly the file committed at that revision.
#
#   Source  : android.googlesource.com/platform/external/chromium-webview
#   Pinned  : tag android-13.0.0_r80 = commit 259ec8d2ad6dd574a7e6de96b317a80de87c227b
#             ("WebView AOSP Integration Request - 109.0.5414.123", minSdk 24)
#   Package : com.android.webview (the WebView provider of AOSP emulator images)
#
# Checks: git blob id of the download == blob id in the pinned commit's tree;
# package name, versionName and minSdk read back from the APK with aapt2.
# Writes webview.apk and webview-provenance.txt to the output directory.
set -euo pipefail

OUT_DIR="${1:-webview}"
COMMIT="259ec8d2ad6dd574a7e6de96b317a80de87c227b"
EXPECTED_PACKAGE="com.android.webview"
EXPECTED_VERSION="109.0.5414.123"
ABI_DIR="prebuilt/x86_64"
BASE="https://android.googlesource.com/platform/external/chromium-webview"

mkdir -p "$OUT_DIR"
APK="$OUT_DIR/webview.apk"

# Blob id of webview.apk as recorded in the pinned commit's tree.
EXPECTED_BLOB=$(curl -sSf "$BASE/+/$COMMIT/$ABI_DIR/?format=JSON" | tail -n +2 \
  | python3 -c 'import json,sys; print(next(e["id"] for e in json.load(sys.stdin)["entries"] if e["name"]=="webview.apk"))')

# Download: the blob as base64 text, falling back to a tar archive of the directory.
if ! curl -sSf "$BASE/+/$COMMIT/$ABI_DIR/webview.apk?format=TEXT" | base64 -d > "$APK" || [ ! -s "$APK" ]; then
  echo "TEXT download unavailable; using the directory archive"
  curl -sSf "$BASE/+archive/$COMMIT/$ABI_DIR.tar.gz" | tar -xzf - -C "$OUT_DIR" webview.apk
fi

ACTUAL_BLOB=$(git hash-object "$APK")
if [ "$ACTUAL_BLOB" != "$EXPECTED_BLOB" ]; then
  echo "WebView APK does not match the pinned commit: blob $ACTUAL_BLOB, expected $EXPECTED_BLOB"
  exit 1
fi

AAPT2=$(find "$ANDROID_HOME/build-tools" -name aapt2 -type f | sort -V | tail -1)
BADGING=$("$AAPT2" dump badging "$APK")
PACKAGE=$(echo "$BADGING" | sed -nE "s/^package: name='([^']+)'.*/\1/p")
VERSION=$(echo "$BADGING" | sed -nE "s/^package: .*versionName='([^']+)'.*/\1/p")
MIN_SDK=$(echo "$BADGING" | sed -nE "s/^(min)?[sS]dkVersion:'([0-9]+)'.*/\2/p" | head -1)
if [ "$PACKAGE" != "$EXPECTED_PACKAGE" ] || [ "$VERSION" != "$EXPECTED_VERSION" ] || [ "$MIN_SDK" -gt 26 ]; then
  echo "Unexpected APK: package=$PACKAGE version=$VERSION minSdk=$MIN_SDK"
  exit 1
fi

APKSIGNER=$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort -V | tail -1)
{
  echo "source: $BASE"
  echo "commit: $COMMIT (tag android-13.0.0_r80)"
  echo "path: $ABI_DIR/webview.apk"
  echo "git_blob: $ACTUAL_BLOB (matches pinned tree)"
  echo "sha256: $(sha256sum "$APK" | cut -d' ' -f1)"
  echo "size_bytes: $(stat -c%s "$APK")"
  echo "package: $PACKAGE"
  echo "versionName: $VERSION"
  echo "minSdk: $MIN_SDK"
  echo "native_libraries (zip method, size):"
  unzip -v "$APK" 'lib/*' 2>/dev/null | awk '/\.so$/ {print "  " $8 "  " $2 "  " $1}' || true
  echo "signer:"
  "$APKSIGNER" verify --print-certs "$APK" 2>/dev/null | grep -E "certificate (DN|SHA-256)" | sed 's/^/  /' || echo "  (apksigner unavailable)"
} | tee "$OUT_DIR/webview-provenance.txt"
