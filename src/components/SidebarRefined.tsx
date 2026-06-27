import { useState, type ElementType } from 'react';
import { Activity, BookOpen, CalendarDays, ChevronDown, FileText, Gavel, LayoutDashboard, Monitor, Settings, Shield, Users } from 'lucide-react';
import type { Page } from '../types';

type NavItem = { page: Page; label: string; badge?: string };
type NavSection = { title: string; icon: ElementType; page: Page; items?: NavItem[] };

const sections: NavSection[] = [
  { title: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' },
  { title: 'People & Dossiers', icon: Users, page: 'contacts' },
  { title: 'Case Calendar', icon: CalendarDays, page: 'calendar', items: [
    { page: 'calendar', label: 'Case Calendar' },
    { page: 'visitation', label: 'Parenting Time & Exchanges' },
    { page: 'calendarCourtDates', label: 'Court Dates & Filing Deadlines' },
    { page: 'calendarAppointments', label: 'Appointments, Medical & School' },
    { page: 'calendarAttorneyMeetings', label: 'Attorney & Case Meetings' },
    { page: 'calendarRequiredContacts', label: 'Contact Commitments' },
    { page: 'calendarReminders', label: 'Reminders & Follow-Ups' },
  ] },
  { title: 'Legal', icon: Gavel, page: 'legal', items: [
    { page: 'orders', label: 'Court Orders' }, { page: 'violations', label: 'Violations', badge: 'Risk' },
    { page: 'legalFilings', label: 'Filings' }, { page: 'legalMotions', label: 'Motions' }, { page: 'legalServiceRecords', label: 'Service Records' }, { page: 'legalCourtNotes', label: 'Court Notes' }, { page: 'legalAttorneyPackets', label: 'Attorney Packets' },
  ] },
  { title: 'Events', icon: Activity, page: 'events', items: [
    { page: 'events', label: 'Timeline' }, { page: 'eventsDeniedVisits', label: 'Denied Visits' }, { page: 'incidents', label: 'Incidents' }, { page: 'eventsCommunication', label: 'Communication' }, { page: 'eventsGoodFaith', label: 'Good-Faith Attempts' }, { page: 'eventsCaseNotes', label: 'Case Notes' },
  ] },
  { title: 'Evidence', icon: Shield, page: 'evidence', items: [
    { page: 'evidence', label: 'Evidence Vault', badge: 'SHA' }, { page: 'evidenceHashCheck', label: 'Hash Check' }, { page: 'evidenceChainOfCustody', label: 'Chain of Custody' }, { page: 'evidenceUploads', label: 'Uploads' }, { page: 'evidenceExhibits', label: 'Exhibits' }, { page: 'evidenceMetadata', label: 'Metadata' }, { page: 'evidenceRiskReview', label: 'Risk Review' },
  ] },
  { title: 'Members', icon: Monitor, page: 'member', items: [
    { page: 'member', label: 'Member Command' }, { page: 'access', label: 'Access' }, { page: 'membersBrotherhood', label: 'Brotherhood' }, { page: 'membersLicense', label: 'License' }, { page: 'membersOpenDoor', label: 'Open Door' }, { page: 'membersSponsor', label: 'Sponsor a Father' }, { page: 'membersAccount', label: 'Account' },
  ] },
  { title: 'About', icon: BookOpen, page: 'about', items: [
    { page: 'about', label: 'About P.O.P.S.' }, { page: 'mission', label: 'Mission' }, { page: 'doctrine', label: 'Doctrine' }, { page: 'howItWorks', label: 'How P.O.P.S. Works' }, { page: 'declaration', label: 'Declaration' }, { page: 'pledge', label: 'Creed + Pledge' }, { page: 'lexicon', label: 'Lexicon + Highlights' },
  ] },
  { title: 'Reports', icon: FileText, page: 'reports', items: [
    { page: 'reports', label: 'Reports' }, { page: 'reportsAttorneyPacket', label: 'Attorney Packet' }, { page: 'reportsCourtPacket', label: 'Court Packet' }, { page: 'reportsEvidenceIndex', label: 'Evidence Index' }, { page: 'reportsTimelineSummary', label: 'Timeline Summary' }, { page: 'reportsExport', label: 'Export' }, { page: 'reportsPrint', label: 'Print' }, { page: 'reportsReviewFlags', label: 'Review Flags' },
  ] },
  { title: 'Settings', icon: Settings, page: 'settings', items: [
    { page: 'settings', label: 'Settings' }, { page: 'settingsOrbAssistant', label: 'Assistant Settings' }, { page: 'settingsDataBackup', label: 'Data Backup' }, { page: 'settingsSecurity', label: 'Security' }, { page: 'settingsLocalStorage', label: 'Local Storage' }, { page: 'settingsPreferences', label: 'Preferences' },
  ] },
];

export const APP_NAV_LABELS = sections.reduce<Record<string, { title: string; section: string }>>((all, section) => {
  all[section.page] = { title: section.title, section: section.title };
  section.items?.forEach((item) => { all[item.page] = { title: item.label, section: section.title }; });
  return all;
}, {});

export default function SidebarRefined({ currentPage, onNavigate }: { currentPage: Page; onNavigate: (page: Page) => void }) {
  const [open, setOpen] = useState<string[]>([]);
  const matches = (section: NavSection) => section.page === currentPage || section.items?.some((item) => item.page === currentPage);

  return <aside className="sidebar">
    <div className="sidebar-header"><div className="orb-brand"><img src="/popsbadge.png" alt="POPS logo" className="orb-logo" /><div className="orb-brand-text"><h1>P.O.P.S.</h1><span>Case Command</span></div></div></div>
    <nav className="sidebar-nav">
      {sections.map((section) => {
        const Icon = section.icon;
        const isOpen = open.includes(section.title);
        const active = matches(section);
        return <div className="nav-section" key={section.title}>
          <button className={`nav-item nav-section-button ${active ? 'active' : ''}`} type="button" onClick={() => section.items ? setOpen((items) => items.includes(section.title) ? items.filter((item) => item !== section.title) : [...items, section.title]) : onNavigate(section.page)}><Icon size={18} /><span>{section.title}</span>{section.items && <ChevronDown className={`nav-chevron ${isOpen ? 'open' : ''}`} size={15} />}</button>
          {section.items && isOpen && <div className="nav-subitems">{section.items.map((item) => <button type="button" className={`nav-item nav-subitem ${currentPage === item.page ? 'active' : ''}`} key={item.page} onClick={() => onNavigate(item.page)}><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</div>}
        </div>;
      })}
    </nav>
    <div className="sidebar-footer"><div className="orb-mini"><div className="orb-mini-dot" /><div><div className="orb-mini-text">Pops!</div><div className="orb-mini-subtext">Private guide</div></div></div></div>
  </aside>;
}
