import { useState } from "react";
import Sidebar, { APP_NAV_LABELS } from "./components/Sidebar";
import ToastContainer from "./components/ToastContainer";
import OrbAssistant from "./components/OrbAssistant";
import Dashboard from "./pages/Dashboard";
import EvidenceVault from "./pages/EvidenceVault";
import CourtOrders from "./pages/CourtOrders";
import Violations from "./pages/Violations";
import VisitationCalendar from "./pages/VisitationCalendar";
import Events from "./pages/Events";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";
import PlayersDossier from "./pages/PlayersDossier";
import Incidents from "./pages/Incidents";
import AboutMission from "./pages/AboutMission";
import Mission from "./pages/Mission";
import Doctrine from "./pages/Doctrine";
import HowItWorks from "./pages/HowItWorks";
import AccessBrotherhood from "./pages/AccessBrotherhood";
import MemberCommand from "./pages/MemberCommand";
import Lexicon from "./pages/Lexicon";
import Declaration from "./pages/Declaration";
import Pledge from "./pages/Pledge";
import CommandPlaceholder from "./pages/CommandPlaceholder";
import { useToast } from "./hooks/useToast";
import type { Page } from "./types";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const { toasts, show } = useToast();

  (window as any).__showToast = show;

  const pages: Partial<Record<Page, React.ReactNode>> = {
    dashboard: <Dashboard />,
    evidence: <EvidenceVault />,
    orders: <CourtOrders />,
    violations: <Violations />,
    visitation: <VisitationCalendar />,
    calendar: <VisitationCalendar />,
    legal: <CourtOrders />,
    events: <Events />,
    reports: <Reports />,
    settings: <CommandPlaceholder page="settings" title="Settings" section="Settings" />,
    contacts: <CommandPlaceholder page="contacts" title="Contacts" section="Contacts" />,
    profile: <Profile />,
    players: <PlayersDossier />,
    incidents: <Incidents />,
    about: <AboutMission />,
    mission: <Mission />,
    doctrine: <Doctrine />,
    howItWorks: <HowItWorks />,
    access: <AccessBrotherhood />,
    member: <MemberCommand />,
    lexicon: <Lexicon />,
    declaration: <Declaration />,
    pledge: <Pledge />,
  };

  const fallback = APP_NAV_LABELS[page] || { title: "Command Page", section: "POPS" };

  return (
    <div className="app-container">
      <div className="field-bg" />
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="main-content">
        {pages[page] || <CommandPlaceholder page={page} title={fallback.title} section={fallback.section} />}
      </main>
      <ToastContainer toasts={toasts} />
      <OrbAssistant />
    </div>
  );
}

export default App;
