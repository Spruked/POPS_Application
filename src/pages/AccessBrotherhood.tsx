import { useState } from 'react';
import { ArrowUpRight, HandHeart, ShieldCheck, Wallet } from 'lucide-react';

type AccessCard = {
  key: string;
  title: string;
  subtitle: string;
  body: string;
  cta: string;
  icon: React.ElementType;
  tone?: 'default' | 'green';
};

const links = {
  guardian: import.meta.env.VITE_STRIPE_GUARDIAN_LINK || '',
  sponsor25: import.meta.env.VITE_STRIPE_SPONSOR_25_LINK || '',
  sponsor50: import.meta.env.VITE_STRIPE_SPONSOR_50_LINK || '',
  sponsor149: import.meta.env.VITE_STRIPE_SPONSOR_149_LINK || '',
  sponsor300: import.meta.env.VITE_STRIPE_SPONSOR_300_LINK || '',
  sponsorCustom: import.meta.env.VITE_STRIPE_SPONSOR_CUSTOM_LINK || '',
};

const cards: AccessCard[] = [
  {
    key: 'guardian',
    title: 'Guardian Access',
    subtitle: '$149 for Year 1 access',
    body: 'Guardian Access is for parents ready to protect the record now. You receive the full POPS evidence workstation, local-first custody tools, evidence vault, timeline system, incident logging, and record protection features.',
    cta: 'Get POPS',
    icon: ShieldCheck,
  },
  {
    key: 'open-door',
    title: 'Open Door Access',
    subtitle: 'Any amount offered by the user',
    body: 'Open Door Access is for parents under financial pressure who still need to protect the record today. Tell us what you can contribute now and briefly explain your situation. If license pool capacity is available, your request may be approved for access.',
    cta: 'Request Open Door Access',
    icon: Wallet,
  },
  {
    key: 'sponsored',
    title: 'Sponsored Access',
    subtitle: '$0 if approved',
    body: 'Sponsored Access is for parents who need POPS now and cannot pay today. Access is reviewed and granted based on available sponsored licenses. If approved, your access is covered by the POPS community access pool.',
    cta: 'Request Sponsored Access',
    icon: HandHeart,
  },
  {
    key: 'sponsor',
    title: 'Sponsor a Father',
    subtitle: '$25, $50, $149, $300, or custom',
    body: 'Sponsor a Father helps open the door for another parent who needs POPS but cannot afford access today. Contributions support sponsored licenses, community access, education, and future legal-resource partnerships.',
    cta: 'Sponsor a Father',
    icon: HandHeart,
    tone: 'green',
  },
];

type OpenDoorForm = {
  name: string;
  email: string;
  state: string;
  amount: string;
  explanation: string;
  proSe: string;
  urgentIssue: string;
  permissionToContact: boolean;
};

function launchPaymentLink(url: string, label: string) {
  const notify = (window as any).__showToast;
  if (!url) {
    if (typeof notify === 'function') {
      notify('Configure Stripe link first: ' + label, 'error');
    }
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function storeRequest(key: string, payload: Record<string, string | boolean>) {
  const now = new Date().toISOString();
  const current = JSON.parse(localStorage.getItem(key) || '[]') as Array<Record<string, string | boolean>>;
  current.push({ ...payload, createdAt: now, requestStatus: 'submitted' });
  localStorage.setItem(key, JSON.stringify(current));
}

export default function AccessBrotherhood() {
  const [openDoor, setOpenDoor] = useState<OpenDoorForm>({
    name: '',
    email: '',
    state: '',
    amount: '',
    explanation: '',
    proSe: '',
    urgentIssue: '',
    permissionToContact: false,
  });

  const [sponsored, setSponsored] = useState({
    name: '',
    email: '',
    state: '',
    explanation: '',
    urgentIssue: '',
    permissionToContact: false,
  });

  const submitOpenDoor = () => {
    const notify = (window as any).__showToast;
    if (!openDoor.name.trim() || !openDoor.email.trim() || !openDoor.amount.trim() || !openDoor.explanation.trim()) {
      if (typeof notify === 'function') {
        notify('Open Door requires name, email, amount, and explanation.', 'error');
      }
      return;
    }
    if (!openDoor.permissionToContact) {
      if (typeof notify === 'function') {
        notify('Please grant permission to contact you about your request.', 'error');
      }
      return;
    }
    storeRequest('pops_open_door_requests', openDoor);
    setOpenDoor({
      name: '',
      email: '',
      state: '',
      amount: '',
      explanation: '',
      proSe: '',
      urgentIssue: '',
      permissionToContact: false,
    });
    if (typeof notify === 'function') {
      notify('Open Door request submitted for manual review.', 'success');
    }
  };

  const submitSponsored = () => {
    const notify = (window as any).__showToast;
    if (!sponsored.name.trim() || !sponsored.email.trim() || !sponsored.explanation.trim()) {
      if (typeof notify === 'function') {
        notify('Sponsored Access requires name, email, and explanation.', 'error');
      }
      return;
    }
    if (!sponsored.permissionToContact) {
      if (typeof notify === 'function') {
        notify('Please grant permission to contact you about your request.', 'error');
      }
      return;
    }
    storeRequest('pops_sponsored_access_requests', sponsored);
    setSponsored({
      name: '',
      email: '',
      state: '',
      explanation: '',
      urgentIssue: '',
      permissionToContact: false,
    });
    if (typeof notify === 'function') {
      notify('Sponsored Access request submitted for manual review.', 'success');
    }
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Access & Brotherhood</h2>
        <p>Choose your access path.</p>
      </div>

      <div className="card" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Every parent&apos;s situation is different. Some can purchase today. Some can contribute something.
          Some need the door opened for them. POPS was built so dignity stays intact either way.
        </p>
        <p style={{ color: 'var(--text-secondary)', marginTop: 10 }}>
          Requests are reviewed manually. Approval depends on available license pool capacity.
        </p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Icon size={18} className={card.tone === 'green' ? 'trust-green' : 'trust-blue'} />
                <h3>{card.title}</h3>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{card.subtitle}</div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>{card.body}</p>

              {card.key === 'guardian' && (
                <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => launchPaymentLink(links.guardian, 'Guardian Access')}>
                  {card.cta}
                  <ArrowUpRight size={14} />
                </button>
              )}

              {card.key === 'open-door' && (
                <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => jumpTo('open-door-form')}>
                  {card.cta}
                </button>
              )}

              {card.key === 'sponsored' && (
                <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => jumpTo('sponsored-form')}>
                  {card.cta}
                </button>
              )}

              {card.key === 'sponsor' && (
                <button className="btn btn-success" style={{ marginTop: 10 }} onClick={() => launchPaymentLink(links.sponsorCustom, 'Sponsor a Father')}>
                  {card.cta}
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div id="open-door-form" className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Open Door Access Request</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
          Open Door Access is reviewed manually. Approval depends on available sponsored licenses,
          current license pool capacity, and the information provided.
        </p>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
          POPS does not offer a lesser version to people in hard circumstances. If approved,
          you receive the same tool and the same respect.
        </p>
        <div className="form-grid">
          <div className="form-group"><label>Name</label><input value={openDoor.name} onChange={(e) => setOpenDoor({ ...openDoor, name: e.target.value })} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={openDoor.email} onChange={(e) => setOpenDoor({ ...openDoor, email: e.target.value })} /></div>
          <div className="form-group"><label>State</label><input value={openDoor.state} onChange={(e) => setOpenDoor({ ...openDoor, state: e.target.value })} /></div>
          <div className="form-group"><label>Amount You Can Contribute Now</label><input value={openDoor.amount} onChange={(e) => setOpenDoor({ ...openDoor, amount: e.target.value })} placeholder="Example: 25" /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Brief Explanation</label><textarea value={openDoor.explanation} onChange={(e) => setOpenDoor({ ...openDoor, explanation: e.target.value })} /></div>
          <div className="form-group"><label>Are You Representing Yourself Right Now?</label><input value={openDoor.proSe} onChange={(e) => setOpenDoor({ ...openDoor, proSe: e.target.value })} placeholder="Yes / No" /></div>
          <div className="form-group"><label>Urgent Court or Parenting-Time Issue?</label><input value={openDoor.urgentIssue} onChange={(e) => setOpenDoor({ ...openDoor, urgentIssue: e.target.value })} placeholder="Yes / No" /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={openDoor.permissionToContact} onChange={(e) => setOpenDoor({ ...openDoor, permissionToContact: e.target.checked })} />
              Permission to contact you about your request
            </label>
          </div>
        </div>
        <button className="btn btn-primary" onClick={submitOpenDoor}>Submit Open Door Request</button>
      </div>

      <div id="sponsored-form" className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Sponsored Access Request</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
          Sponsored Access is limited and reviewed manually. Not every request can be approved immediately.
        </p>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
          If approved, your access is covered by the POPS community access pool and includes
          full POPS access.
        </p>
        <div className="form-grid">
          <div className="form-group"><label>Name</label><input value={sponsored.name} onChange={(e) => setSponsored({ ...sponsored, name: e.target.value })} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={sponsored.email} onChange={(e) => setSponsored({ ...sponsored, email: e.target.value })} /></div>
          <div className="form-group"><label>State</label><input value={sponsored.state} onChange={(e) => setSponsored({ ...sponsored, state: e.target.value })} /></div>
          <div className="form-group"><label>Urgent Court or Parenting-Time Issue?</label><input value={sponsored.urgentIssue} onChange={(e) => setSponsored({ ...sponsored, urgentIssue: e.target.value })} placeholder="Yes / No" /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Brief Explanation</label><textarea value={sponsored.explanation} onChange={(e) => setSponsored({ ...sponsored, explanation: e.target.value })} /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={sponsored.permissionToContact} onChange={(e) => setSponsored({ ...sponsored, permissionToContact: e.target.checked })} />
              Permission to contact you about your request
            </label>
          </div>
        </div>
        <button className="btn btn-primary" onClick={submitSponsored}>Submit Sponsored Request</button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Sponsor a Father</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
          Choose a contribution amount or set a custom sponsorship amount.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-success" onClick={() => launchPaymentLink(links.sponsor25, 'Sponsor $25')}>$25</button>
          <button className="btn btn-success" onClick={() => launchPaymentLink(links.sponsor50, 'Sponsor $50')}>$50</button>
          <button className="btn btn-success" onClick={() => launchPaymentLink(links.sponsor149, 'Sponsor $149')}>$149</button>
          <button className="btn btn-success" onClick={() => launchPaymentLink(links.sponsor300, 'Sponsor $300')}>$300</button>
          <button className="btn btn-ghost" onClick={() => launchPaymentLink(links.sponsorCustom, 'Sponsor Custom')}>
            Custom Amount <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Stripe Link Setup</h3>
        <div className="hash-display">
          VITE_STRIPE_GUARDIAN_LINK
          <br />
          VITE_STRIPE_SPONSOR_25_LINK
          <br />
          VITE_STRIPE_SPONSOR_50_LINK
          <br />
          VITE_STRIPE_SPONSOR_149_LINK
          <br />
          VITE_STRIPE_SPONSOR_300_LINK
          <br />
          VITE_STRIPE_SPONSOR_CUSTOM_LINK
        </div>
      </div>
    </div>
  );
}
