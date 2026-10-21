# POPS on iPhone — Step by Step

Apple requires two things before any app can go on an iPhone:
1. A **Mac** to build it (GitHub supplies one for free in the cloud).
2. An **active** Apple Developer account to sign it. Wait until Apple confirms your payment.

## Step 1 — Put this code on GitHub
1. Unzip `POPS_iOS_Source.zip`.
2. Upload it to your repo `Spruked/POPS_Application` on the branch `mobile-tauri-v2`. The easiest way is GitHub Desktop: open the folder, then Commit, then Push.
   - The `.github/workflows/mobile-build.yml` file needs a token or login with the **workflow** permission. GitHub Desktop or the web upload handles this for you.

## Step 2 — Collect your Apple details (after your account is active)
1. **Team ID**: developer.apple.com → Account → Membership details → *Team ID* (10 characters).
2. **App Store Connect API key**: appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API → "+".
   - Name it `POPS CI` and give it the **App Manager** role.
   - Write down the **Key ID** and the **Issuer ID** shown at the top of the page.
   - Download the **.p8 file**. You can only download it once.
3. **Create the app record**: App Store Connect → Apps → "+" → New App.
   - Platform: iOS.
   - Bundle ID: the `identifier` value in `src-tauri/tauri.conf.json`.

## Step 3 — Add these secrets to GitHub
Go to Repo → Settings → Secrets and variables → Actions → **New repository secret**, and add:

| Name | Value |
|---|---|
| `APPLE_DEVELOPMENT_TEAM` | Your Team ID |
| `APPLE_API_KEY` | Key ID |
| `APPLE_API_ISSUER` | Issuer ID |
| `APPLE_API_KEY_P8` | Open the .p8 file in Notepad and paste the entire contents |

Then open the **Variables** tab → New variable → `IOS_UPLOAD_TESTFLIGHT` = `true`.

## Step 4 — Build
Go to Repo → **Actions** → "Mobile Build" → **Run workflow** → choose branch `mobile-tauri-v2`. The build takes about 20 minutes.

## Step 5 — Install on your iPhone
1. On your iPhone, install **TestFlight** from the App Store.
2. In App Store Connect → your app → TestFlight, add yourself as an **Internal Tester**.
3. Open TestFlight on the phone and tap **Install** next to POPS.

## What to test
- Reminders: create a court date, receive the alert, then tap **Seen it**.
- Device Sync: pair the phone with the desktop app.
- Google Calendar sync from the desktop app.
