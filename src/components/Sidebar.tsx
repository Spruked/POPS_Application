import { 
  LayoutDashboard, Shield, Gavel, AlertTriangle, Calendar, 
  FileText, User, Settings, Zap, Activity, Users, BookOpen, Handshake, Monitor
} from 'lucide-react';
import type { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; label: string; icon: React.ElementType; badge?: string }[] = [
  { page: 'member', label: 'Member Command', icon: Monitor, badge: 'WEB' },
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'evidence', label: 'Evidence Vault', icon: Shield, badge: 'SHA-256' },
  { page: 'orders', label: 'Court Orders', icon: Gavel },
  { page: 'violations', label: 'Violations', icon: AlertTriangle },
  { page: 'visitation', label: 'Visitation Calendar', icon: Calendar, badge: 'Core' },
  { page: 'events', label: 'Events & Timeline', icon: Calendar },
  { page: 'players', label: 'The Players Dossier', icon: Users, badge: 'Core' },
  { page: 'lexicon', label: 'Lexicon + Highlights', icon: BookOpen, badge: 'Guide' },
  { page: 'access', label: 'Access & Brotherhood', icon: Handshake, badge: 'POPS' },
  { page: 'about', label: 'About and Mission', icon: BookOpen },
  { page: 'reports', label: 'Reports', icon: FileText },
  { page: 'profile', label: 'Case Profile', icon: User },
];

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="orb-brand">
          <img src="/popsbadge.png" alt="POPS logo" className="orb-logo" />
          <div className="orb-brand-text">
            <h1>P.O.P.S.</h1>
            <span>Legal Case Command</span>
          </div>
        </div>
        
        {/* Beam status — Locke, Hume, Kant, Spinoza */}
        <div className="beam-status">
          <div className="beam-dot locke" title="Locke Beam — Evidence" />
          <div className="beam-dot hume" title="Hume Beam — Events" />
          <div className="beam-dot kant" title="Kant Beam — Orders" />
          <div className="beam-dot spinoza" title="Spinoza Beam — Violations" />
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
            TPC v1.0
          </span>
        </div>
      </div>
      
      <nav>
        <div className="nav-section">
          <div className="nav-section-title">Case Management</div>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                className={`nav-item ${currentPage === item.page ? 'active' : ''}`}
                onClick={() => onNavigate(item.page)}
              >
                <Icon size={18} />
                {item.label}
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </div>
        
        <div className="nav-section">
          <div className="nav-section-title">TPC Core</div>
          <button className="nav-item">
            <Activity size={18} />
            Pipeline Monitor
          </button>
          <button className="nav-item">
            <Zap size={18} />
            Tribunal Synthesizer
          </button>
        </div>
      </nav>
      
      <div className="sidebar-footer">
        <div className="orb-mini">
          <div className="orb-mini-dot" />
          <div>
            <div className="orb-mini-text">ORB Assistant</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>Ready</div>
          </div>
        </div>
        <button className="nav-item" style={{ marginTop: 8, width: '100%' }}>
          <Settings size={18} />
          Settings
        </button>
      </div>
    </aside>
  );
}
