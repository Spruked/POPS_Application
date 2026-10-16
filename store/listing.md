# POPS store listing (Google Play + App Store)

Assets are in `store/assets/`. To regenerate them, run `python3 store/generate_assets.py` against a running `vite preview` on port 4173.

## App identity
- **App name:** P.O.P.S. – Proof of Presence
- **Package / bundle ID:** `com.proofofpresence.app`
- **Category:** Productivity (Play) · Productivity (App Store; secondary: Utilities)
- **Website:** https://www.popsproof.com
- **Privacy policy URL:** https://www.popsproof.com/privacy (required by both stores; the text below can be published there)
- **Support email:** use the address on popsproof.com

## Short description (Play, max 80 chars)
Local-first case records and evidence vault with SHA-256 chain of custody.

## App Store subtitle (max 30 chars)
Private evidence & case vault

## Full description (Play max 4000 · App Store max 4000)
P.O.P.S. (Proof of Presence) helps parents keep an organized, verifiable record of their case. Everything stays on their own device.

PRIVATE BY DESIGN
• Your records, evidence and notes stay in the app's private storage on your device. There are no accounts, cloud uploads or tracking.
• Location is only recorded when you turn on "Attach location" for a photo.

EVIDENCE YOU CAN STAND BEHIND
• Capture Photo opens the camera and seals the original image unaltered with a SHA-256 fingerprint.
• Every save, verification and transfer is written to a chain-of-custody log and a hash-linked audit ledger.
• Re-verify any item at any time to prove it hasn't changed.

YOUR WHOLE CASE IN ONE PLACE
• Dashboard: case overview, deadlines and alerts
• Contacts & dossiers for everyone involved
• Case calendar for visitation, exchanges and hearings
• Legal: court orders, violations and child-support ledger
• Events & incidents timeline
• Members & access records
• Reports: Evidence Index, Timeline and Attorney Packet, including capture locations
• ORB assistant: guided help for every workflow, including one-tap photo capture

MOVE BETWEEN DESKTOP AND PHONE
• Vault Transfer packages your full vault and re-checks every file fingerprint before restoring it on another device.

P.O.P.S. is a record-keeping tool. It does not provide legal advice.

## App Store keywords (max 100 chars)
evidence,custody,coparenting,records,chain of custody,legal,journal,vault,documentation,court

## What's new (first release)
First mobile release of P.O.P.S. It brings the full desktop case vault to your phone, with camera evidence capture, optional location, maps and Vault Transfer.

## Content rating questionnaire (Play / App Store age rating)
- Violence, sexual content, profanity, gambling, drugs: **None**
- User-generated content shared with others: **No** (everything stays on the device)
- Suggested rating: **Everyone / 4+**. Choose 17+ on the App Store only if you prefer, given the legal subject matter.

## Google Play Data safety form
- **Data collected: None.** POPS does not send personal data off the device.
- **Data shared: None.**
- **Location:** approximate and precise location are accessed only on the device, when the user opts in for a photo. They are stored locally, never transmitted, and are therefore not "collected" under Play's definition.
- **Photos:** taken by the user and stored locally only.
- **Map tiles:** when the user taps "Show map", the device requests map images from OpenStreetMap. Mention this in the privacy policy.
- **Encryption in transit:** N/A (no POPS server). **Deletion:** the user can delete records in the app, or uninstall to remove everything.

## Apple App Privacy ("nutrition label")
- **Data Not Collected.** Same reasoning as above.
- Export compliance: `ITSAppUsesNonExemptEncryption = false` is already set in `Info.ios.plist`.

## Permission explanations (already in the app)
- **Camera:** "Capture photos as preserved evidence records"
- **Photos:** "Import photos into your evidence vault"
- **Location:** "Record where evidence photos were taken"
- **Microphone:** "Dictate notes into your case records"

## Asset checklist
| Store | Asset | File |
|---|---|---|
| Play | App icon 512×512 PNG | `assets/play-icon-512.png` |
| Play | Feature graphic 1024×500 | `assets/play-feature-graphic-1024x500.png` |
| Play | Phone screenshots 1080×1920 (2–8) | `assets/play-phone-*.png` |
| App Store | App icon 1024×1024 (no alpha) | `assets/appstore-icon-1024.png` |
| App Store | 6.9" screenshots 1320×2868 | `assets/appstore-6.9-*.png` |
| App Store | 6.5" screenshots 1284×2778 | `assets/appstore-6.5-*.png` |
