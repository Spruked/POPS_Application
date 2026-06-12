export const APP_CONTEXT_STATUS = {
  available: true,
  mode: 'validated-local-context',
  domains: [
    'contacts',
    'calendar',
    'reminders',
    'evidence metadata',
    'court orders',
    'violations',
    'events',
    'reports',
    'case profile',
    'lexicon',
    'support tracker',
    'parenting plan',
    'players dossier',
  ],
  permissions: [
    'read',
    'suggest',
    'draft',
    'create pending record after confirmation',
    'modify after confirmation',
    'export after confirmation',
    'delete only after explicit confirmation',
  ],
};

export function buildAppContextGuidance() {
  return [
    `App context: ${APP_CONTEXT_STATUS.available ? 'available' : 'unavailable'} (${APP_CONTEXT_STATUS.mode})`,
    `Readable domains: ${APP_CONTEXT_STATUS.domains.join(', ')}`,
    `ORB permissions: ${APP_CONTEXT_STATUS.permissions.join('; ')}`,
  ].join('\n');
}
