#!/usr/bin/env python3
"""Generate Google Play + App Store listing assets from the real POPS UI.

Usage:  npm run build && npx vite preview --port 4173 &
        python3 store/generate_assets.py [--chromium /usr/bin/chromium]

Screens are the production frontend running with demo case data supplied
through a mocked Tauri bridge (no real records are used).
"""
import argparse
import asyncio
import pathlib

from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "assets"
BADGE = ROOT.parent / "public" / "popsbadge.png"
BASE = "http://localhost:4173"

SIZES = {
    "play-phone": (360, 640),        # x3 = 1080x1920
    "appstore-6.9": (440, 956),      # x3 = 1320x2868
    "appstore-6.5": (428, 926),      # x3 = 1284x2778
}

MOCK = r"""
const now = new Date().toISOString();
const EV = [
 {id:'ev1', caseId:'primary', type:'photo', title:'Exchange at Civic Center library', description:'Arrived 4:55 PM for the scheduled 5:00 PM exchange. Waited 40 minutes.', date:'2026-10-14', filePath:'/vault/evidence_originals/ev1/IMG_2041.jpg', sha256:'bfc45d6d9c6034e7a5b8f051e520d484eb889b38d9c162f280896cc4dea199a4', tags:['camera-capture','location-attached','exchange'], fileName:'IMG_2041.jpg', fileSize:2483112, fileType:'image/jpeg', trustGlyphRisk:'low', sourceDescription:'Captured with the device camera in POPS (android). Original preserved unaltered and sealed with SHA-256 at import.', createdAt:'2026-10-14T23:02:00Z', importedAt:'2026-10-14T23:02:00Z'},
 {id:'ev2', caseId:'primary', type:'document', title:'School attendance report – fall term', description:'Official attendance record from the school office.', date:'2026-10-10', filePath:'/vault/evidence_originals/ev2/attendance.pdf', sha256:'5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', tags:['school'], fileName:'attendance.pdf', fileSize:184220, fileType:'application/pdf', trustGlyphRisk:'low', createdAt:'2026-10-10T16:00:00Z'},
 {id:'ev3', caseId:'primary', type:'message', title:'Text thread – schedule change request', description:'Exported message thread about the weekend schedule.', date:'2026-10-08', filePath:'/vault/communication_exports/ev3/thread.txt', sha256:'9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', tags:['communication'], fileName:'thread.txt', fileSize:12044, fileType:'text/plain', trustGlyphRisk:'low', createdAt:'2026-10-08T20:00:00Z'},
 {id:'ev4', caseId:'primary', type:'photo', title:'Pediatric appointment summary', description:'After-visit summary photographed at the clinic.', date:'2026-10-02', filePath:'/vault/evidence_originals/ev4/IMG_1988.jpg', sha256:'2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', tags:['camera-capture','medical'], fileName:'IMG_1988.jpg', fileSize:1983001, fileType:'image/jpeg', trustGlyphRisk:'low', createdAt:'2026-10-02T18:00:00Z'}];
const META = {evidence_id:'ev1', document_id:'ev1', file_path:EV[0].filePath, file_hash:EV[0].sha256, exif_json: JSON.stringify({accuracy_m:8.2, captured_at:'2026-10-14T23:02:00Z'}), gps_lat:39.7372, gps_lon:-104.9893, device_identity:'POPS android', timestamp_utc:'2026-10-14T23:02:01Z'};
const EVENTS = [
 {id:'e1', caseId:'primary', type:'visit', title:'Weekend parenting time', date:'2026-10-17', description:'Pickup 5:00 PM Friday at the library.', relatedEvidenceIds:[], createdAt:now},
 {id:'e2', caseId:'primary', type:'school', title:'Parent–teacher conference', date:'2026-10-21', description:'Room 114, 3:30 PM.', relatedEvidenceIds:['ev2'], createdAt:now},
 {id:'e3', caseId:'primary', type:'medical', title:'Pediatric follow-up', date:'2026-10-28', description:'Annual check-up.', relatedEvidenceIds:['ev4'], createdAt:now}];
const CASE = {id:'primary', parentCaseId:null, caseType:'primary_custody', title:'Primary Custody / Family Case', caseNumber:'2026-DR-01482', courtName:'District Court, Family Division', judgeName:'', status:'active', lifecycleStage:'filing', openedDate:'2026-03-02', closedDate:'', nextDeadline:'2026-10-24', nextHearingDate:'2026-11-06', orderIds:[], evidenceIds:['ev1','ev2','ev3','ev4'], eventIds:['e1','e2','e3'], documentIds:[], notes:'', createdAt:now, updatedAt:now};
window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (cmd, args) => {
  switch (cmd) {
    case 'platform_capabilities': return {platform:'android', mobile:true, sqlite_vault:true, evidence_import:true, evidence_hashing:true, reports_export:true, guided_assistant:true, local_ai:false, ocr:false, voice_output:false, dictation_service:false, research_substrate:false};
    case 'get_evidence': return EV;
    case 'get_events': return EVENTS;
    case 'get_evidence_metadata': return JSON.stringify(args.evidenceId === 'ev1' ? META : null);
    case 'get_evidence_locations': return [META];
    case 'get_case_overview_data': return {primaryCase: CASE, relatedCases: [], alerts: [], activeOrderCount: 2, upcomingDeadlineCount: 2, crossCaseEvidenceCount: 0};
    case 'get_evidence_chain': case 'get_sealed_records': case 'get_audit_ledger': case 'get_reports':
    case 'get_court_orders': case 'get_violations': case 'get_players_dossier': case 'get_operational_records': return [];
    case 'get_case_overview': return '[]';
  }
  throw new Error('demo: ' + cmd);
}};
"""


async def ready(page):
    # wait for the startup splash to hand over to the app shell
    await page.wait_for_selector(".mobile-topbar", state="visible", timeout=30000)
    await page.wait_for_selector(".pops-startup-splash", state="detached", timeout=30000)
    await page.wait_for_timeout(2500)


async def shots(browser, key, viewport):
    context = await browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, device_scale_factor=3)
    await context.add_init_script(MOCK)
    page = await context.new_page()

    async def snap(name):
        await page.wait_for_timeout(700)
        await page.screenshot(path=str(OUT / f"{key}-{name}.png"))

    async def drawer(*labels):
        await page.get_by_label("Open navigation").click()
        for label in labels:
            await page.locator(".sidebar button", has_text=label).first.click()
            await page.wait_for_timeout(300)
        if await page.locator(".sidebar.sidebar-mobile-open").count():
            await page.locator(".mobile-nav-backdrop").click(force=True)

    await page.goto(BASE)
    await ready(page)
    await snap("1-dashboard")

    await page.locator(".mobile-tab", has_text="Evidence").click()
    await snap("2-evidence-vault")

    await page.locator("tr", has_text="Exchange at Civic Center").locator("button", has_text="View").click()
    await page.get_by_test_id("evidence-location-show-map").click()
    await page.wait_for_timeout(2500)
    await page.get_by_test_id("evidence-location-map").scroll_into_view_if_needed()
    await snap("3-evidence-location")
    await page.locator(".modal button", has_text="Close").last.click()

    await page.locator(".mobile-tab", has_text="Calendar").click()
    await snap("4-calendar")

    await page.get_by_label("Open chat assistant").first.click()
    await snap("5-orb-assistant")
    if await page.get_by_label("Close chat assistant").count():
        await page.get_by_label("Close chat assistant").first.click()

    await page.goto(BASE)
    await ready(page)
    await drawer("Settings", "Vault Transfer")
    await snap("6-vault-transfer")
    await context.close()


async def feature_graphic(browser):
    page = await browser.new_page(viewport={"width": 1024, "height": 500})
    await page.set_content(f"""
      <html><body style="margin:0;width:1024px;height:500px;background:radial-gradient(circle at 78% 30%,#12305e 0,#070c17 62%);
        font-family:'Liberation Sans',Arial,sans-serif;display:flex;align-items:center;gap:44px;padding:0 64px;box-sizing:border-box;color:#e8eefc">
        <img src="{BASE}/popsbadge.png" style="width:260px;height:260px;object-fit:contain;border-radius:36px;filter:drop-shadow(0 12px 32px rgba(47,143,255,.45))"/>
        <div>
          <div style="font-size:74px;font-weight:800;letter-spacing:6px;color:#fbbf24">P.O.P.S.</div>
          <div style="font-size:30px;font-weight:700;margin-top:4px">Proof of Presence</div>
          <div style="font-size:23px;margin-top:22px;color:#9fb3d9;line-height:1.4">Private case records &amp; evidence vault.<br/>Sealed with SHA-256. Stays on your device.</div>
        </div></body></html>""")
    await page.wait_for_timeout(1200)
    await page.screenshot(path=str(OUT / "play-feature-graphic-1024x500.png"))
    await page.close()


def icons():
    badge = Image.open(BADGE).convert("RGB")  # store icons must not have alpha (App Store)
    badge.resize((512, 512), Image.LANCZOS).save(OUT / "play-icon-512.png")
    badge.resize((1024, 1024), Image.LANCZOS).save(OUT / "appstore-icon-1024.png")


async def main(chromium):
    OUT.mkdir(parents=True, exist_ok=True)
    icons()
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=chromium, args=["--no-sandbox"])
        await feature_graphic(browser)
        for key, viewport in SIZES.items():
            await shots(browser, key, viewport)
        await browser.close()
    for f in sorted(OUT.glob("*.png")):
        print(f.name, Image.open(f).size)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    asyncio.run(main(parser.parse_args().chromium))
