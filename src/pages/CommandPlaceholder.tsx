import type { Page } from '../types';

interface CommandPlaceholderProps {
  page: Page;
  title: string;
  section: string;
}

const contactsIndicators = [
  'Upcoming appointment',
  'Required contact pending',
  'Last contacted status',
  'Court date linked',
  'Linked events',
  'Linked evidence',
];

const calendarIndicators = [
  'People involved',
  'Required follow-up',
  'Evidence needed',
  'Reminder status',
  'Related court order',
  'Related child',
];

const orbRules = [
  'Read local case context',
  'Suggest or draft next actions',
  'Create pending records only after confirmation',
  'Modify only after confirmation',
  'Export only after confirmation',
  'Delete never without explicit confirmation',
];

function getIndicators(page: Page, section: string) {
  if (section === 'Contacts') return contactsIndicators;
  if (section === 'Calendar') return calendarIndicators;
  if (page === 'settingsOrbAssistant') return orbRules;
  return [
    'Local-first data model',
    'Evidence-linked records',
    'Court-safe notes',
    'Timeline connections',
    'Review flags',
    'Export readiness',
  ];
}

export default function CommandPlaceholder({ page, title, section }: CommandPlaceholderProps) {
  const indicators = getIndicators(page, section);

  return (
    <div>
      <div className="page-header">
        <span className="mission-kicker">{section}</span>
        <h2>{title}</h2>
        <p>Command page staged for local POPS data integration.</p>
      </div>

      <section className="command-placeholder-grid">
        <article className="card command-placeholder-card">
          <div className="card-header">
            <h3>{title}</h3>
            <span className="badge badge-blue">Coming Soon</span>
          </div>
          <p>
            This page is reserved for the operational POPS command workflow. It will connect records,
            reminders, evidence, notes, and reports without changing the current validated lexicon or
            doctrine pages.
          </p>
        </article>

        <article className="card command-placeholder-card">
          <div className="card-header">
            <h3>Context Links</h3>
            <span className="badge badge-amber">ORB Ready</span>
          </div>
          <div className="mission-chip-grid">
            {indicators.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
