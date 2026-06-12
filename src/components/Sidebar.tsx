import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Database,
  FileText,
  Gavel,
  LayoutDashboard,
  Monitor,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import type { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

interface NavItem {
  page: Page;
  label: string;
  badge?: string;
}

interface NavSection {
  title: string;
  icon: ElementType;
  page?: Page;
  items?: NavItem[];
}

const navSections: NavSection[] = [
  { title: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' },
  {
    title: 'Contacts',
    icon: Users,
    page: 'contacts',
    items: [
      { page: 'contactsAll', label: 'All Contacts' },
      { page: 'contactsAttorneys', label: 'Attorneys' },
      { page: 'contactsCourtClerk', label: 'Court / Clerk' },
      { page: 'contactsJudges', label: 'Judges' },
      { page: 'contactsOtherParent', label: 'Other Parent' },
      { page: 'contactsChildren', label: 'Children' },
      { page: 'contactsMedical', label: 'Medical' },
      { page: 'contactsSchool', label: 'School' },
      { page: 'contactsWitnesses', label: 'Witnesses' },
      { page: 'contactsSupportAgency', label: 'Support Agency' },
      { page: 'contactsLawEnforcement', label: 'Law Enforcement' },
      { page: 'contactsAdvocates', label: 'Advocates' },
      { page: 'contactsRequired', label: 'Required Contacts', badge: 'Due' },
      { page: 'contactsHistory', label: 'Contact History' },
    ],
  },
  {
    title: 'Calendar',
    icon: CalendarDays,
    page: 'calendar',
    items: [
      { page: 'calendar', label: 'Calendar Overview' },
      { page: 'visitation', label: 'Visitation' },
      { page: 'calendarCourtDates', label: 'Court Dates' },
      { page: 'calendarAppointments', label: 'Appointments' },
      { page: 'calendarMedical', label: 'Medical' },
      { page: 'calendarSchool', label: 'School' },
      { page: 'calendarAttorneyMeetings', label: 'Attorney Meetings' },
      { page: 'calendarSupportDeadlines', label: 'Support Deadlines' },
      { page: 'calendarRequiredContacts', label: 'Required Contacts' },
      { page: 'calendarReminders', label: 'Reminders' },
      { page: 'calendarFollowUps', label: 'Follow-Ups' },
    ],
  },
  {
    title: 'Legal',
    icon: Gavel,
    page: 'legal',
    items: [
      { page: 'orders', label: 'Court Orders' },
      { page: 'violations', label: 'Violations', badge: 'Risk' },
      { page: 'legalFilings', label: 'Filings' },
      { page: 'legalMotions', label: 'Motions' },
      { page: 'legalServiceRecords', label: 'Service Records' },
      { page: 'legalCourtNotes', label: 'Court Notes' },
      { page: 'legalAttorneyPackets', label: 'Attorney Packets' },
    ],
  },
  {
    title: 'Events',
    icon: Activity,
    page: 'events',
    items: [
      { page: 'events', label: 'Timeline' },
      { page: 'eventsDeniedVisits', label: 'Denied Visits' },
      { page: 'incidents', label: 'Incidents' },
      { page: 'eventsCommunication', label: 'Communication' },
      { page: 'eventsGoodFaith', label: 'Good-Faith Attempts' },
      { page: 'eventsCaseNotes', label: 'Case Notes' },
    ],
  },
  {
    title: 'Evidence',
    icon: Shield,
    page: 'evidence',
    items: [
      { page: 'evidence', label: 'Evidence Vault', badge: 'SHA' },
      { page: 'evidenceHashCheck', label: 'Hash Check' },
      { page: 'evidenceChainOfCustody', label: 'Chain of Custody' },
      { page: 'evidenceUploads', label: 'Uploads' },
      { page: 'evidenceExhibits', label: 'Exhibits' },
      { page: 'evidenceMetadata', label: 'Metadata' },
      { page: 'evidenceRiskReview', label: 'Risk Review' },
    ],
  },
  {
    title: 'Members',
    icon: Monitor,
    page: 'member',
    items: [
      { page: 'member', label: 'Member Command' },
      { page: 'access', label: 'Access' },
      { page: 'membersBrotherhood', label: 'Brotherhood' },
      { page: 'membersLicense', label: 'License' },
      { page: 'membersOpenDoor', label: 'Open Door' },
      { page: 'membersSponsor', label: 'Sponsor a Father' },
      { page: 'membersAccount', label: 'Account' },
    ],
  },
  {
    title: 'About',
    icon: BookOpen,
    page: 'about',
    items: [
      { page: 'about', label: 'About P.O.P.S.' },
      { page: 'mission', label: 'Mission' },
      { page: 'doctrine', label: 'Doctrine' },
      { page: 'howItWorks', label: 'How P.O.P.S. Works' },
      { page: 'declaration', label: 'Declaration' },
      { page: 'pledge', label: 'Creed + Pledge' },
      { page: 'lexicon', label: 'Lexicon + Highlights' },
    ],
  },
  {
    title: 'Reports',
    icon: FileText,
    page: 'reports',
    items: [
      { page: 'reports', label: 'Reports' },
      { page: 'reportsAttorneyPacket', label: 'Attorney Packet' },
      { page: 'reportsCourtPacket', label: 'Court Packet' },
      { page: 'reportsEvidenceIndex', label: 'Evidence Index' },
      { page: 'reportsTimelineSummary', label: 'Timeline Summary' },
      { page: 'reportsExport', label: 'Export' },
      { page: 'reportsPrint', label: 'Print' },
      { page: 'reportsReviewFlags', label: 'Review Flags' },
    ],
  },
  {
    title: 'Settings',
    icon: Settings,
    page: 'settings',
    items: [
      { page: 'settings', label: 'Settings' },
      { page: 'settingsOrbAssistant', label: 'ORB Assistant' },
      { page: 'settingsDataBackup', label: 'Data Backup' },
      { page: 'settingsSecurity', label: 'Security' },
      { page: 'settingsLocalStorage', label: 'Local Storage' },
      { page: 'settingsPreferences', label: 'Preferences' },
    ],
  },
];

function sectionHasPage(section: NavSection, page: Page) {
  return section.page === page || section.items?.some((item) => item.page === page) || false;
}

export const APP_NAV_LABELS = navSections.reduce<Record<string, { title: string; section: string }>>(
  (labels, section) => {
    if (section.page) labels[section.page] = { title: section.title, section: section.title };
    section.items?.forEach((item) => {
      labels[item.page] = { title: item.label, section: section.title };
    });
    return labels;
  },
  {}
);

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const initialOpen = useMemo(
    () => navSections.filter((section) => sectionHasPage(section, currentPage)).map((section) => section.title),
    [currentPage]
  );
  const [openSections, setOpenSections] = useState<string[]>(initialOpen);

  useEffect(() => {
    setOpenSections(initialOpen);
  }, [initialOpen]);

  function toggleSection(section: NavSection) {
    if (!section.items?.length) {
      if (section.page) onNavigate(section.page);
      return;
    }

    setOpenSections((current) =>
      current.includes(section.title)
        ? current.filter((title) => title !== section.title)
        : [...current, section.title]
    );

    if (section.page && !sectionHasPage(section, currentPage)) onNavigate(section.page);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="orb-brand">
          <img src="/popsbadge.png" alt="POPS logo" className="orb-logo" />
          <div className="orb-brand-text">
            <h1>P.O.P.S.</h1>
            <span>Case Command</span>
          </div>
        </div>

        <div className="beam-status">
          <div className="beam-dot locke" title="Evidence beam" />
          <div className="beam-dot hume" title="Events beam" />
          <div className="beam-dot kant" title="Orders beam" />
          <div className="beam-dot spinoza" title="Violations beam" />
          <span className="beam-version">TPC v1.0</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section) => {
          const Icon = section.icon;
          const active = sectionHasPage(section, currentPage);
          const open = openSections.includes(section.title);

          return (
            <div className="nav-section" key={section.title}>
              <button
                className={`nav-item nav-section-button ${active ? 'active' : ''}`}
                onClick={() => toggleSection(section)}
              >
                <Icon size={18} />
                <span>{section.title}</span>
                {section.items?.length ? (
                  <ChevronDown className={`nav-chevron ${open ? 'open' : ''}`} size={15} />
                ) : null}
              </button>

              {section.items?.length && open && (
                <div className="nav-subitems">
                  {section.items.map((item) => (
                    <button
                      key={item.page}
                      className={`nav-item nav-subitem ${currentPage === item.page ? 'active' : ''}`}
                      onClick={() => onNavigate(item.page)}
                    >
                      <span>{item.label}</span>
                      {item.badge && <span className="nav-badge">{item.badge}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="orb-mini">
          <div className="orb-mini-dot" />
          <div>
            <div className="orb-mini-text">ORB Assistant</div>
            <div className="orb-mini-subtext">Context ready</div>
          </div>
        </div>
        <div className="annotation-chip-wrap">
          <span className="annotation-chip annotation-chip-soft">
            <Database size={12} /> Local Data
          </span>
          <span className="annotation-chip">
            <AlertTriangle size={12} /> Review Gates
          </span>
        </div>
      </div>
    </aside>
  );
}
