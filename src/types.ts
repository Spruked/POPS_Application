export interface Evidence {
  id: string;
  type: 'photo' | 'video' | 'audio' | 'document' | 'screenshot' | 'other';
  title: string;
  description: string;
  date: string;
  filePath?: string;
  sha256: string;
  tags: string[];
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  trustGlyphRisk?: 'low' | 'medium' | 'high';
  sourceDescription?: string;
  originalModifiedAt?: string;
  importedAt?: string;
  createdAt: string;
}

export interface EvidenceRecord {
  evidence_id: string;
  document_id: string;
  file_path: string;
  file_hash: string;
  exif_json: string;
  gps_lat?: number;
  gps_lon?: number;
  device_identity: string;
  timestamp_utc: string;
}

export interface ChainOfCustodyEntry {
  id: string;
  evidence_id: string;
  action: string;
  hash: string;
  created_at: string;
  metadata_json: string;
}

export interface ExportReceipt {
  success: boolean;
  file_path: string;
  timestamp_utc: string;
}

export interface SmartDocumentEvent {
  eventId: string;
  documentId: string;
  timestampUtc: string;
  actionType: string;
  effectiveStatus: string;
  payload: Record<string, unknown>;
}

export interface CaseSummary {
  case_id: string;
  timeline_count: number;
  evidence_count: number;
  violation_count: number;
  last_updated: string;
}

export interface IntegrityCheck {
  success: boolean;
  total_events: number;
  broken_links: number;
  missing_hashes: number;
  orphan_documents: number;
}

export interface DiagnosticsReport {
  db_path: string;
  total_documents: number;
  total_events: number;
  total_evidence: number;
  last_export?: string;
  app_version: string;
}

export interface FullCaseBundleReceipt {
  success: boolean;
  bundle_path: string;
  timestamp_utc: string;
}

export interface CourtOrder {
  id: string;
  title: string;
  orderDate: string;
  effectiveDate: string;
  judgeName: string;
  courtName: string;
  docketNumber: string;
  terms: string;
  violations: Violation[];
  createdAt: string;
}

export interface Violation {
  id: string;
  orderId: string;
  date: string;
  description: string;
  evidenceIds: string[];
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  status: 'reported' | 'verified' | 'disputed' | 'resolved';
  createdAt: string;
}

export interface Event {
  id: string;
  type: 'medical' | 'school' | 'support' | 'visit' | 'communication' | 'other';
  title: string;
  date: string;
  description: string;
  relatedEvidenceIds: string[];
  createdAt: string;
}

export interface Incident {
  id: string;
  type: 'denied_visit' | 'communication' | 'support' | 'medical' | 'school' | 'other';
  title: string;
  date: string;
  location: string;
  description: string;
  deniedVisitScheduledStart: string;
  deniedVisitScheduledEnd: string;
  deniedVisitArrivalTime: string;
  deniedVisitExchangeLocation: string;
  deniedVisitWhoDenied: string;
  deniedVisitChildPresent: string;
  deniedVisitReasonGiven: string;
  deniedVisitAttemptedContact: string;
  linkedEvidenceIds: string[];
  linkedCommunicationIds: string[];
  timelineEventId: string;
  courtSafeSummary: string;
  trustGlyphRisk: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface CaseProfile {
  id: string;
  caseName: string;
  clientName: string;
  opposingParty: string;
  attorneyName: string;
  attorneyPhone: string;
  attorneyEmail: string;
  courtName: string;
  docketNumber: string;
  caseType: string;
  notes: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  title: string;
  type: 'timeline' | 'violation' | 'evidence' | 'summary' | 'attorney';
  content: string;
  generatedAt: string;
}

export interface PlayerInteractionLog {
  id: string;
  when: string;
  summary: string;
}

export interface PlayerDossierRecord {
  id: string;
  name: string;
  role: string;
  knownRole: string;
  organization: string;
  phoneNumbers: string;
  emails: string;
  address: string;
  relationshipToCase: string;
  status: 'active' | 'watch' | 'inactive';
  lastContact: string;
  followUpNeeded: boolean;
  conflictConcern: boolean;
  documentsRequested: string;
  documentsProvided: string;
  linkedEvidence: string;
  linkedIncidents: string;
  linkedTimelineEvents: string;
  privateFieldNotes: string;
  courtSafeNotes: string;
  interactionHistory: PlayerInteractionLog[];
  createdAt: string;
  updatedAt: string;
}

export type ContactResearchStatus =
  | 'Source-backed'
  | 'User-provided'
  | 'Heard elsewhere'
  | 'Needs verification';

export interface ContactResearchFinding {
  id: string;
  contactId: string;
  researchQuestion: string;
  providerOrSource: string;
  sourceReference: string;
  sourceTitle: string;
  capturedFinding: string;
  userNote: string;
  status: ContactResearchStatus;
  linkedPersonId: string;
  linkedEvidenceId: string;
  linkedEventId: string;
  linkedCourtOrderId: string;
  linkedCalendarItemId: string;
  linkedTimelineItemId: string;
  createdAt: string;
  updatedAt: string;
  auditLedgerId?: string;
  receiptHash?: string;
}

export interface ContactResearchReceipt {
  success: boolean;
  findingId: string;
  auditLedgerId: string;
  receiptHash: string;
  timestampUtc: string;
  message: string;
}

export type Page =
  | 'dashboard'
  | 'contacts'
  | 'contactsAll'
  | 'contactsAttorneys'
  | 'contactsCourtClerk'
  | 'contactsJudges'
  | 'contactsOtherParent'
  | 'contactsChildren'
  | 'contactsMedical'
  | 'contactsSchool'
  | 'contactsWitnesses'
  | 'contactsSupportAgency'
  | 'contactsLawEnforcement'
  | 'contactsAdvocates'
  | 'contactsRequired'
  | 'contactsHistory'
  | 'calendar'
  | 'visitation'
  | 'calendarCourtDates'
  | 'calendarAppointments'
  | 'calendarMedical'
  | 'calendarSchool'
  | 'calendarAttorneyMeetings'
  | 'calendarSupportDeadlines'
  | 'calendarRequiredContacts'
  | 'calendarReminders'
  | 'calendarFollowUps'
  | 'legal'
  | 'orders'
  | 'violations'
  | 'legalFilings'
  | 'legalMotions'
  | 'legalServiceRecords'
  | 'legalCourtNotes'
  | 'legalAttorneyPackets'
  | 'events'
  | 'incidents'
  | 'eventsDeniedVisits'
  | 'eventsCommunication'
  | 'eventsGoodFaith'
  | 'eventsCaseNotes'
  | 'evidence'
  | 'evidenceHashCheck'
  | 'evidenceChainOfCustody'
  | 'evidenceUploads'
  | 'evidenceExhibits'
  | 'evidenceMetadata'
  | 'evidenceRiskReview'
  | 'member'
  | 'access'
  | 'membersBrotherhood'
  | 'membersLicense'
  | 'membersOpenDoor'
  | 'membersSponsor'
  | 'membersAccount'
  | 'about'
  | 'mission'
  | 'doctrine'
  | 'howItWorks'
  | 'declaration'
  | 'pledge'
  | 'lexicon'
  | 'reports'
  | 'reportsAttorneyPacket'
  | 'reportsCourtPacket'
  | 'reportsEvidenceIndex'
  | 'reportsTimelineSummary'
  | 'reportsExport'
  | 'reportsPrint'
  | 'reportsReviewFlags'
  | 'settings'
  | 'settingsOrbAssistant'
  | 'settingsDataBackup'
  | 'settingsSecurity'
  | 'settingsLocalStorage'
  | 'settingsPreferences'
  | 'profile'
  | 'players';
