#!/usr/bin/env python3
"""Wire release signing into the Tauri-generated Android project (CI only).

Tauri regenerates src-tauri/gen/android on `tauri android init`, so CI patches
app/build.gradle.kts after init. The signingConfig reads keystore.properties,
which CI writes from repository secrets; nothing secret is committed.
"""
import pathlib
import sys

GRADLE = pathlib.Path("src-tauri/gen/android/app/build.gradle.kts")

SIGNING_BLOCK = """    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
"""


def main() -> int:
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else GRADLE
    text = path.read_text()
    if 'signingConfigs.getByName("release")' in text:
        print("signing already configured")
        return 0

    for imp in ("import java.io.FileInputStream", "import java.util.Properties"):
        if imp not in text:
            text = imp + "\n" + text

    anchor = "    buildTypes {"
    if anchor not in text:
        print("ERROR: buildTypes block not found in", path)
        return 1
    text = text.replace(anchor, SIGNING_BLOCK + anchor, 1)

    release = 'getByName("release") {'
    if release not in text:
        print("ERROR: release buildType not found in", path)
        return 1
    text = text.replace(
        release, release + '\n            signingConfig = signingConfigs.getByName("release")', 1
    )

    path.write_text(text)
    print("release signing configured in", path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
