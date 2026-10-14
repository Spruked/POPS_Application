import { CalendarDays, LayoutDashboard, Menu, Shield, Sparkles, Users } from 'lucide-react';
import { APP_NAV_LABELS } from './Sidebar';
import type { Page } from '../types';

/**
 * Phone chrome around the existing POPS navigation: a top bar (menu, current
 * section, ORB) and a bottom bar for the most-used command sections. The full
 * section tree stays in Sidebar, which opens as a drawer from the Menu button.
 */
type MobileNavProps = {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenMenu: () => void;
  onOpenAssistant: () => void;
};

const TABS: { label: string; page: Page; section: string; icon: typeof Menu }[] = [
  { label: 'Dashboard', page: 'dashboard', section: 'Case Overview', icon: LayoutDashboard },
  { label: 'Contacts', page: 'contactsAll', section: 'People & Dossiers', icon: Users },
  { label: 'Calendar', page: 'calendar', section: 'Case Calendar', icon: CalendarDays },
  { label: 'Evidence', page: 'evidence', section: 'Evidence', icon: Shield },
];

export default function MobileNav({ currentPage, onNavigate, onOpenMenu, onOpenAssistant }: MobileNavProps) {
  const current = APP_NAV_LABELS[currentPage];
  const activeSection = current?.section;

  return (
    <>
      <header className="mobile-topbar">
        <button type="button" className="mobile-topbar-button" onClick={onOpenMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <img src="/popsbadge.png" alt="" aria-hidden="true" className="mobile-topbar-logo" />
        <div className="mobile-topbar-title">
          <span>{current?.section && current.section !== current.title ? current.section : 'P.O.P.S.'}</span>
          <strong>{current?.title || 'Case Command'}</strong>
        </div>
        <button type="button" className="mobile-topbar-button mobile-topbar-orb" onClick={onOpenAssistant} aria-label="Open chat assistant">
          <Sparkles size={18} />
        </button>
      </header>

      <nav className="mobile-tabbar" aria-label="Primary sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.section;
          return (
            <button key={tab.page} type="button" className={`mobile-tab ${active ? 'active' : ''}`} onClick={() => onNavigate(tab.page)} aria-current={active ? 'page' : undefined}>
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <button type="button" className="mobile-tab" onClick={onOpenMenu}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
