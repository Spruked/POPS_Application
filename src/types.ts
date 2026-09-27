export interface Evidence {
  id: string;
  caseId?: string;
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

export type CaseMatterType = 'primary_custody' | 'administrative' | 'domestic_violence' | 'protection_order' | 'criminal' | 'child_support' | 'juvenile_agency' | 'appeal_civil' | 'other';
export type CaseLifecycleStage = 'allegation' | 'filing' | 'temporary_order' | 'hearing' | 'finding_order' | 'dismissed' | 'closed';

export interface CaseMatter {
  id: string;
  parentCaseId: string | null;
  caseType: CaseMatterType;
  title: string;
  caseNumber: string;
  courtName: string;
  judgeName: string;
  status: 'active' | 'pending' | 'stayed' | 'dismissed' | 'closed';
  lifecycleStage: CaseLifecycleStage;
  openedDate: string;
  closedDate: string;
  nextDeadline: string;
  nextHearingDate: string;
  orderIds: string[];
  evidenceIds: string[];
  eventIds: string[];
  documentIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseAlert {
  id: string;
  caseId: string;
  alertType: 'order_entered' | 'service_status' | 'expiration' | 'hearing' | 'prohibited_contact' | 'distance_restriction' | 'firearms_property' | 'modification_dismissal' | 'parenting_time_conflict' | 'other';
  severity: 'info' | 'high' | 'critical';
  title: string;
  details: string;
  dueDate: string;
  resolved: boolean;
  createdAt: string;
}

export interface CaseOverviewData {
  primaryCase: CaseMatter;
  relatedCases: CaseMatter[];
  alerts: CaseAlert[];
  activeOrderCount: number;
  upcomingDeadlineCount: number;
  crossCaseEvidenceCount: number;
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
  caseId?: string;
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
  caseId?: string;
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
  caseId?: string;
  type: 'medical' | 'school' | 'support' | 'visit' | 'communication' | 'other';
  title: string;
  date: string;
  description: string;
  relatedEvidenceIds: string[];
  createdAt: string;
}

export interface Incident {
  id: string;
  caseId?: string;
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
  caseId?: string;
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

export type DossierCategory =
  | 'all'
  | 'attorney'
  | 'court_clerk'
  | 'judge'
  | 'other_parent'
  | 'child'
  | 'medical'
  | 'school'
  | 'witness'
  | 'support_agency'
  | 'law_enforcement'
  | 'advocate'
  | 'required_contact'
  | 'history';

export interface PlayerDossierProfile {
  photoDataUrl: string;
  photoCaption: string;
  aliases: string;
  pronouns: string;
  dateOfBirth: string;
  preferredContactMethod: string;
  bestContactTime: string;
  courtRole: string;
  jurisdiction: string;
  identifiers: string;
  employment: string;
  education: string;
  language: string;
  accessibility: string;
  communicationPlatforms: string;
  socialHandles: string;
  emergencyContact: string;
  relatedChildren: string;
  knownAssociates: string;
  sourceProvenance: string;
  verificationStatus: string;
  riskNotes: string;
  additionalDetails: string;
}

export interface PlayerDossierRecord {
  id: string;
  caseIds?: string[];
  category: DossierCategory | string;
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
  profile: PlayerDossierProfile;
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
  caseId?: string;
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

export interface OperationalRecord {
  id: string;
  glyphTraceId: string;
  recordType: string;
  caseId: string;
  title: string;
  status: string;
  verificationState: string;
  sourceProvenance: string;
  date: string;
  linkedRecordIds: string[];
  payload: Record<string, unknown>;
  vaultPath: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface GlyphTraceSummary {
  recordId: string;
  glyphTraceId: string;
  recordType: string;
  caseId: string;
  title: string;
  status: string;
  verificationState: string;
  updatedAt: string;
  vaultPath: string;
  linkedRecordIds: string[];
}

export type Page =
  | 'dashboard'
  | 'glyphTrace'
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
  | 'childSupportLedger'
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
  | 'membersBrotherhood'
  | 'membersLicense'
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
  | 'settingsChatAssistant'
  | 'diagnostics'
  | 'settingsDataBackup'
  | 'settingsSecurity'
  | 'settingsLocalStorage'
  | 'settingsPreferences'
  | 'profile'
  | 'players';
