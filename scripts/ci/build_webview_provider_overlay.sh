#!/usr/bin/env bash
# CI only. Builds a static runtime resource overlay (RRO) for the API 26 AOSP emulator
# image so its WebView provider list includes the AOSP package com.android.webview.
#
# Why: that emulator image's framework accepts only com.google.android.webview as a
# provider, which is not installed on the image (it boots with no usable WebView).
# The only verifiable WebView we install is the AOSP build, com.android.webview.
# This overlay changes nothing but that provider list, on the test emulator only.
# It is authored here (no third-party binary, no framework decompiling or patching).
set -euo pipefail

OUT_DIR="${1:-webview}"
WORK=$(mktemp -d)
mkdir -p "$WORK/res/xml" "$OUT_DIR"

cat > "$WORK/AndroidManifest.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.proofofpresence.ci.webviewprovider">
    <overlay android:targetPackage="android" android:isStatic="true" android:priority="999" />
    <application android:hasCode="false" />
</manifest>
XML

# Same list the image ships, plus the AOSP WebView.
cat > "$WORK/res/xml/config_webview_packages.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<webviewproviders>
    <webviewprovider description="Android WebView (AOSP prebuilt, CI)" packageName="com.android.webview" availableByDefault="true" />
    <webviewprovider description="Android WebView" packageName="com.google.android.webview" availableByDefault="true" isFallback="true" />
</webviewproviders>
XML

ANDROID_JAR="$ANDROID_HOME/platforms/android-26/android.jar"
if [ ! -f "$ANDROID_JAR" ]; then
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-26" > /dev/null
fi
BT=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)

"$BT/aapt2" compile --dir "$WORK/res" -o "$WORK/res.zip"
"$BT/aapt2" link -o "$WORK/overlay-unsigned.apk" -I "$ANDROID_JAR" --manifest "$WORK/AndroidManifest.xml" "$WORK/res.zip"
keytool -genkeypair -keystore "$WORK/ci.jks" -storepass android -keypass android -alias ci \
  -dname "CN=POPS CI emulator overlay" -keyalg RSA -keysize 2048 -validity 2 > /dev/null 2>&1
"$BT/apksigner" sign --ks "$WORK/ci.jks" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT_DIR/webview-provider-overlay.apk" "$WORK/overlay-unsigned.apk"
cp "$WORK/res/xml/config_webview_packages.xml" "$OUT_DIR/webview-provider-overlay.xml"
echo "overlay: $OUT_DIR/webview-provider-overlay.apk (sha256 $(sha256sum "$OUT_DIR/webview-provider-overlay.apk" | cut -d' ' -f1))"
