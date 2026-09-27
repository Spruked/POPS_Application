import { useState } from "react";
import "./styles/pops-assistant.css";
import "./styles/pops-assistant-fit.css";
import "./styles/pops-assistant-controls.css";
import Sidebar, { APP_NAV_LABELS } from "./components/Sidebar";
import ToastContainer from "./components/ToastContainer";
import PopsAssistant from "./components/PopsAssistant";
import CaseOverview from "./pages/CaseOverview";
import GlyphTrace from "./pages/GlyphTrace";
import EvidenceVault from "./pages/EvidenceVault";
import CourtOrders from "./pages/CourtOrders";
import ChildSupportLedger from "./pages/ChildSupportLedger";
import Violations from "./pages/Violations";
import VisitationCalendar from "./pages/VisitationCalendar";
import Events from "./pages/Events";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Diagnostics from "./pages/Diagnostics";
import PlayersDossier from "./pages/PlayersDossier";
import Incidents from "./pages/Incidents";
import AboutMission from "./pages/AboutMission";
import Mission from "./pages/Mission";
import Doctrine from "./pages/Doctrine";
import HowItWorks from "./pages/HowItWorks";
import MemberCommand from "./pages/MemberCommand";
import Lexicon from "./pages/Lexicon";
import Declaration from "./pages/Declaration";
import Pledge from "./pages/Pledge";
import OperationalRecordsPage, { MODULE_CONFIGS } from "./pages/OperationalRecordsPage";
import { useToast } from "./hooks/useToast";
import type { DossierCategory, Page } from "./types";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const { toasts, show } = useToast();

  (window as any).__showToast = show;

  const contactDossier = (category: DossierCategory) => <PlayersDossier category={category} />;

  const pages: Partial<Record<Page, React.ReactNode>> = {
    dashboard: <CaseOverview />,
    glyphTrace: <GlyphTrace />,
    evidence: <EvidenceVault />,
    evidenceHashCheck: <EvidenceVault />,
    evidenceChainOfCustody: <EvidenceVault />,
    evidenceUploads: <EvidenceVault />,
    evidenceExhibits: <EvidenceVault />,
    evidenceMetadata: <EvidenceVault />,
    evidenceRiskReview: <EvidenceVault />,
    orders: <CourtOrders />,
    violations: <Violations />,
    visitation: <VisitationCalendar />,
    calendar: <VisitationCalendar />,
    calendarCourtDates: <OperationalRecordsPage config={MODULE_CONFIGS.calendarCourtDates} />,
    calendarAppointments: <OperationalRecordsPage config={MODULE_CONFIGS.calendarAppointments} />,
    calendarMedical: <OperationalRecordsPage config={MODULE_CONFIGS.calendarMedical} />,
    calendarSchool: <OperationalRecordsPage config={MODULE_CONFIGS.calendarSchool} />,
    calendarAttorneyMeetings: <OperationalRecordsPage config={MODULE_CONFIGS.calendarAttorneyMeetings} />,
    calendarSupportDeadlines: <OperationalRecordsPage config={MODULE_CONFIGS.calendarSupportDeadlines} />,
    calendarRequiredContacts: <OperationalRecordsPage config={MODULE_CONFIGS.calendarRequiredContacts} />,
    calendarReminders: <OperationalRecordsPage config={MODULE_CONFIGS.calendarReminders} />,
    calendarFollowUps: <OperationalRecordsPage config={MODULE_CONFIGS.calendarFollowUps} />,
    legal: <CourtOrders />,
    childSupportLedger: <ChildSupportLedger />,
    legalFilings: <OperationalRecordsPage config={MODULE_CONFIGS.legalFilings} />,
    legalMotions: <OperationalRecordsPage config={MODULE_CONFIGS.legalMotions} />,
    legalServiceRecords: <OperationalRecordsPage config={MODULE_CONFIGS.legalServiceRecords} />,
    legalCourtNotes: <OperationalRecordsPage config={MODULE_CONFIGS.legalCourtNotes} />,
    legalAttorneyPackets: <OperationalRecordsPage config={MODULE_CONFIGS.legalAttorneyPackets} />,
    events: <Events />,
    eventsDeniedVisits: <OperationalRecordsPage config={MODULE_CONFIGS.eventsDeniedVisits} />,
    eventsCommunication: <OperationalRecordsPage config={MODULE_CONFIGS.eventsCommunication} />,
    eventsGoodFaith: <OperationalRecordsPage config={MODULE_CONFIGS.eventsGoodFaith} />,
    eventsCaseNotes: <OperationalRecordsPage config={MODULE_CONFIGS.eventsCaseNotes} />,
    reports: <Reports />,
    reportsAttorneyPacket: <Reports />,
    reportsCourtPacket: <OperationalRecordsPage config={MODULE_CONFIGS.reportsCourtPacket} />,
    reportsEvidenceIndex: <Reports />,
    reportsTimelineSummary: <Reports />,
    reportsExport: <Reports />,
    reportsPrint: <Reports />,
    reportsReviewFlags: <OperationalRecordsPage config={MODULE_CONFIGS.reportsReviewFlags} />,
    settings: <Settings />,
    settingsChatAssistant: <Settings />,
    diagnostics: <Diagnostics />,
    settingsDataBackup: <OperationalRecordsPage config={MODULE_CONFIGS.settingsDataBackup} />,
    settingsSecurity: <OperationalRecordsPage config={MODULE_CONFIGS.settingsSecurity} />,
    settingsLocalStorage: <Settings />,
    settingsPreferences: <OperationalRecordsPage config={MODULE_CONFIGS.settingsPreferences} />,
    contacts: contactDossier("all"),
    contactsAll: contactDossier("all"),
    contactsAttorneys: contactDossier("attorney"),
    contactsCourtClerk: contactDossier("court_clerk"),
    contactsJudges: contactDossier("judge"),
    contactsOtherParent: contactDossier("other_parent"),
    contactsChildren: contactDossier("child"),
    contactsMedical: contactDossier("medical"),
    contactsSchool: contactDossier("school"),
    contactsWitnesses: contactDossier("witness"),
    contactsSupportAgency: contactDossier("support_agency"),
    contactsLawEnforcement: contactDossier("law_enforcement"),
    contactsAdvocates: contactDossier("advocate"),
    contactsRequired: contactDossier("required_contact"),
    contactsHistory: contactDossier("history"),
    profile: <Profile />,
    players: contactDossier("all"),
    incidents: <Incidents />,
    about: <AboutMission />,
    mission: <Mission />,
    doctrine: <Doctrine />,
    howItWorks: <HowItWorks />,
    member: <MemberCommand />,
    membersBrotherhood: <OperationalRecordsPage config={MODULE_CONFIGS.membersBrotherhood} />,
    membersLicense: <OperationalRecordsPage config={MODULE_CONFIGS.membersLicense} />,
    membersAccount: <OperationalRecordsPage config={MODULE_CONFIGS.membersAccount} />,
    lexicon: <Lexicon />,
    declaration: <Declaration />,
    pledge: <Pledge />,
  };

  const fallback = APP_NAV_LABELS[page] || { title: "Command Page", section: "POPS" };
  const fallbackConfig = {
    title: fallback.title,
    section: fallback.section,
    recordType: `module_${page}`,
    description: `${fallback.title} records are stored in the Vault-backed operational record system.`,
    fields: [
      { key: 'recordDate', label: 'Record date', type: 'date' as const },
      { key: 'relatedRecordId', label: 'Related record ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' as const },
    ],
  };

  return (
    <div className="app-container">
      <div className="field-bg" />
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="main-content pops-main-content">
        {pages[page] || <OperationalRecordsPage config={fallbackConfig} />}
      </main>
      <ToastContainer toasts={toasts} />
      <PopsAssistant activePage={page} onNavigate={setPage} />
    </div>
  );
}

export default App;
