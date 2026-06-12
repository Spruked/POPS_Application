import { useState } from "react";
import Sidebar from "./components/Sidebar";
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
import AccessBrotherhood from "./pages/AccessBrotherhood";
import MemberCommand from "./pages/MemberCommand";
import Lexicon from "./pages/Lexicon";
import Declaration from "./pages/Declaration";
import Pledge from "./pages/Pledge";
import { useToast } from "./hooks/useToast";
import type { Page } from "./types";

function App() {
  const [page, setPage] = useState<Page>("member");
  const { toasts, show } = useToast();

  (window as any).__showToast = show;

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard />,
    evidence: <EvidenceVault />,
    orders: <CourtOrders />,
    violations: <Violations />,
    visitation: <VisitationCalendar />,
    events: <Events />,
    reports: <Reports />,
    profile: <Profile />,
    players: <PlayersDossier />,
    incidents: <Incidents />,
    about: <AboutMission />,
    access: <AccessBrotherhood />,
    member: <MemberCommand />,
    lexicon: <Lexicon />,
    declaration: <Declaration />,
    pledge: <Pledge />,
  };

  return (
    <div className="app-container">
      <div className="field-bg" />
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="main-content">
        <img src="/popsbadge.png" alt="POPS logo" className="content-logo-center" />
        {pages[page]}
      </main>
      <ToastContainer toasts={toasts} />
      <OrbAssistant />
    </div>
  );
}

export default App;
