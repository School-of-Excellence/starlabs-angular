/**
 * firebase-schema.ts
 * ==================
 * Inferred Firestore Collection Schema
 * Generated: 2026-04-08
 * Project: starlabs-autogen
 *
 * Methodology:
 * - All collection(), doc(), addDoc(), setDoc(), updateDoc(), getDoc(), getDocs(),
 *   onSnapshot(), where(), orderBy() calls were traced across the entire codebase.
 * - Field types are inferred from payload objects, where() comparisons, and usage context.
 * - Optional fields (?) are only set in some code paths.
 * - ⚠️ WARNING comments flag inconsistencies or risks found in the codebase.
 *
 * Collections are grouped by domain:
 * 1. Identity & Access
 * 2. Participant Profiles
 * 3. Products & Journey Design
 * 4. Scheduling & Appointments
 * 5. Queue System
 * 6. ATC (Assign Treat Confirm)
 * 7. B!G Program
 * 8. Events & Arena
 * 9. Content
 * 10. Communication & Notifications
 * 11. Workshops
 * 12. Evolution Mapping
 * 13. Customer Support
 * 14. Infrastructure & System
 */

import { Timestamp, DocumentReference } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────
// 1. IDENTITY & ACCESS
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `user_data`
 * Referenced in: authguard.service.ts, login/login.component.ts
 * Primary user authentication record, keyed by Firebase Auth UID.
 */
export interface UserData {
  name: string;
  email: string;
  number: string;
  countrycode: string;
}

/**
 * Collection: `user` (alternate identity collection)
 * Referenced in: login/login.component.ts
 * ⚠️ WARNING: Two separate collections (`user` and `user_data`) store overlapping auth data.
 * `user` stores email+id+username; `user_data` stores name+countrycode+number+email.
 * These should likely be merged into a single collection.
 */
export interface UserRecord {
  email: string;
  id: string;           // Firebase Auth UID
  username: string;
}

/**
 * Collection: `users_roles`
 * Referenced in: authguard.service.ts, dynamic-queue-manager-clone, prescribe-atc, many others
 * Maps users to their EIS staff roles.
 */
export interface UsersRole {
  name: string;
  eis?: boolean;
  changeagent?: boolean;
  mentor?: boolean;
  journeycoach?: boolean;
  admin?: boolean;
  role_ref?: DocumentReference;  // Reference to eisroles document
}

/**
 * Collection: `eisroles`
 * Referenced in: authguard.service.ts
 * Defines role definitions for EIS staff.
 */
export interface EisRole {
  rolename: string;
  permissions?: string[];
}

/**
 * Collection: `dashboard`
 * Referenced in: authguard.service.ts, route-configuration-duplicate
 * Defines the navigation sidebar/menu entries and their access rules.
 * ⚠️ WARNING: The `roles` field is written by the original route-configuration component
 * but the active route loads the duplicate which does NOT render or manage the roles column.
 * Dashboard role assignments may be silently ignored.
 */
export interface DashboardRoute {
  order: number;
  label: string;
  route: string;
  icon?: string;
  roles?: string[];    // ⚠️ WARNING: Written by original route-config, ignored by active duplicate
  active?: boolean;
}

/**
 * Collection: `collectionname`
 * Referenced in: authguard.service.ts
 * Tracks user screen visits / access audit trail.
 */
export interface CollectionNameEntry {
  docid: string;
  uid: string;
  screenname: string;
  url: string;
  date: Timestamp;
}

/**
 * Collection: `userAccessCounts`
 * Referenced in: authguard.service.ts
 * Tracks per-user access frequency per URL.
 */
export interface UserAccessCount {
  docid: string;
  uid: string;
  url: string;
  date: Timestamp;
}

/**
 * Collection: `loginlog`
 * Referenced in: authguard.service.ts
 * Audit log of login/logout actions.
 */
export interface LoginLog {
  uid: string;
  email: string;
  action: 'login' | 'logout';
  timestamp: Timestamp;
  status: string;
}

/**
 * Collection: `FCM_token`
 * Referenced in: authguard.service.ts, dynamic-queue-manager-clone
 * Stores Firebase Cloud Messaging device tokens for push notifications.
 */
export interface FcmToken {
  FCM_id: string;
  device_fingerprint: string;
  active: boolean;
  uid: string;
  FCM_token: string;
  last_modified?: Timestamp;
  device_os?: string;           // Used in where() filter: 'android' | 'ios' | 'web'
  profile_ref?: DocumentReference;
}

// ─────────────────────────────────────────────────────────────
// 2. PARTICIPANT PROFILES
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `profile_data`
 * Referenced in: authguard.service.ts, login, new-profile, userprofile, prescribe-atc,
 *                participants-analytics, many others — the central profile record
 * Core participant profile document. One of the most accessed collections.
 * ⚠️ WARNING: Queried by both `user_ref` (DocumentReference) and `email` (string) in different
 * code paths. Ensure both fields are indexed.
 */
export interface ProfileData {
  name: string;
  email: string;
  user_ref: DocumentReference;     // Reference to user_data document
  profileid: string;               // Custom ID (not always == docid)
  notification_token?: string;
  nextappointmentcount?: number;
  countrycode?: string;
  number?: string;
  profileimage?: string;
  role_ref?: DocumentReference;    // Reference to users_roles document
  journey_ref?: DocumentReference;
  product_ref?: DocumentReference;
  status?: string;
  tags?: string[];
  created?: Timestamp;
}

/**
 * Collection: `new_user_data`
 * Referenced in: authguard.service.ts
 * New/onboarding user profiles, separate from the main profile_data.
 * ⚠️ WARNING: Unclear why this is separate from `profile_data`. Both are queried
 * together in getProfileMap(). May be a migration artifact.
 */
export interface NewUserData {
  name: string;
  email: string;
  profileid?: string;
  created?: Timestamp;
}

/**
 * Collection: `participant metadata`
 * Referenced in: authguard.service.ts, new-profile, big-dashboard, dynamic-queue-manager-clone
 * Lightweight participant lookup record used for autocomplete and lists.
 * ⚠️ WARNING: Distinct from `profile_data` but stores overlapping name/profileid fields.
 * Ensure these stay in sync when profiles are updated.
 */
export interface ParticipantMetadata {
  name: string;
  profileid: string;
  email?: string;
  status?: string;
}

/**
 * Collection: `participant list`
 * Referenced in: dynamic-queue-manager-clone
 * Stores curated lists of participant IDs (e.g. queue groups, cohort lists).
 */
export interface ParticipantList {
  profilelist: string[];   // Array of profileids
  listname?: string;
}

/**
 * Collection: `participant touchpoint`
 * Referenced in: new-profile, userprofile
 * Logs of touchpoint interactions with participants.
 */
export interface ParticipantTouchpoint {
  profileid: string;
  type: string;
  date: Timestamp;
  notes?: string;
  addedby?: string;
}

/**
 * Collection: `participant mode checklist`
 * Referenced in: new-profile, userprofile
 * Tracks completion of mode-based checklist items per participant.
 */
export interface ParticipantModeChecklist {
  profileid: string;
  modeid: string;
  checklistitems: Record<string, boolean>;
  lastmodified?: Timestamp;
}

/**
 * Collection: `participant tags`
 * Referenced in: dynamic-queue-manager-clone
 * Tags applied to participants.
 */
export interface ParticipantTag {
  profileid: string;
  tagsfor: string[];     // Array of tag category IDs
  tagvalue: string;
  addeddate?: Timestamp;
  addedby?: string;
}

/**
 * Collection: `participant tags category`
 * Referenced in: taxonomy/participants-analytics area
 */
export interface ParticipantTagCategory {
  categoryname: string;
  categorytype?: string;
}

/**
 * Collection: `participant tag logs`
 * Referenced in: analytics area
 */
export interface ParticipantTagLog {
  profileid: string;
  tagid: string;
  action: 'added' | 'removed';
  date: Timestamp;
  changedby: string;
}

/**
 * Collection: `filteredtimeline profile`
 * Referenced in: new-profile, userprofile
 * Pre-computed timeline aggregation for participant profile view.
 */
export interface FilteredTimelineProfile {
  profileid: string;
  listofprofileid: string[];
  engagement: string;
  absolutedate: Timestamp;
  timelinetype: string;
}

/**
 * Collection: `participantsproduct`
 * Referenced in: new-profile, userprofile, participant-product
 * Links participants to products they have purchased/enrolled in.
 */
export interface ParticipantsProduct {
  profileid: string;
  productid?: string;
  productref?: DocumentReference;
  status?: string;
  enrolldate?: Timestamp;
}

/**
 * Collection: `participantjourneyproduct`
 * Referenced in: authguard, new-profile, userprofile
 * Detailed journey-product assignment for a participant.
 */
export interface ParticipantJourneyProduct {
  profileid: string;
  journeyid: string;
  productid?: string;
  journeyref?: DocumentReference;
  productref?: DocumentReference;
  status?: string;
}

/**
 * Collection: `participantdeliverysequence`
 * Referenced in: authguard.service.ts
 */
export interface ParticipantDeliverySequence {
  profileid: string;
  sequenceid: string;
  currentstep?: number;
  totalsteps?: number;
  status?: string;
}

/**
 * Collection: `participantJourneySequence`
 * Referenced in: authguard.service.ts
 * ⚠️ WARNING: Different casing and naming from `participantdeliverysequence` — may overlap.
 */
export interface ParticipantJourneySequence {
  docid: string;
  participantjourneyid: string;
  completedstages: string[];
  currentstage: string;
}

/**
 * Collection: `interim crossover`
 * Referenced in: new-profile, userprofile
 */
export interface InterimCrossover {
  profileid: string;
  date: Timestamp;
  notes?: string;
}

/**
 * Collection: `interimreport log`
 * Referenced in: new-profile, userprofile
 */
export interface InterimReportLog {
  profileid: string;
  reportdate: Timestamp;
  summary?: string;
  reportedby?: string;
}

/**
 * Collection: `formsByClient`
 * Referenced in: new-profile, userprofile
 * Forms submitted by/for a client participant.
 */
export interface FormByClient {
  profileid: string;
  formtype: string;
  submitted?: boolean;
  submitteddate?: Timestamp;
  formdata?: Record<string, unknown>;
}

/**
 * Collection: `classify`
 * Referenced in: prescribe-atc, dynamic-queue-manager-clone, new-profile
 * Configuration/metadata store — acts as a key-value settings collection.
 * Known documents: `adjustment_awareness`, `touchpoint`, `queuesystem`
 */
export interface ClassifyDocument {
  // Document 'queuesystem':
  quicklinks?: Record<string, string>;
  // Document 'adjustment_awareness':
  levels?: string[];
  // Document 'touchpoint':
  types?: string[];
  // Arbitrary key-value config
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────
// 3. PRODUCTS & JOURNEY DESIGN
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `products`
 * Referenced in: authguard, prescribe-atc, dynamic-queue-manager-clone, big-dashboard
 * Master product catalog.
 */
export interface Product {
  name: string;
  atcmodel?: string;      // Used in where() filter: 'B!G', 'Priority Mode', etc.
  mode?: string;          // Used in where() filter
  journeyid?: string;
  description?: string;
  active?: boolean;
  created?: Timestamp;
}

/**
 * Collection: `package`
 * Referenced in: authguard.service.ts
 * Product package bundles.
 */
export interface Package {
  name: string;
  productids?: string[];
  price?: number;
  description?: string;
}

/**
 * Collection: `journey`
 * Referenced in: authguard, big-dashboard, prescribe-atc
 * Journey definitions (learning paths).
 */
export interface Journey {
  name: string;
  atcmodel?: string;    // e.g. 'B!G' — used to filter B!G journeys in big-dashboard
  description?: string;
  stages?: string[];
  productids?: string[];
  active?: boolean;
}

/**
 * Collection: `journey-to-product`
 * Referenced in: authguard.service.ts
 * Maps journeys to products.
 */
export interface JourneyToProduct {
  journeyid: string;
  productid: string;
  sequence?: number;
}

/**
 * Collection: `deliverables`
 * Referenced in: authguard, new-profile, userprofile
 * Delivery activities within a participant's product journey.
 */
export interface Deliverable {
  participantproductid?: string;
  type?: string;          // e.g. 'queue', 'appointment'
  status?: string;        // e.g. 'ongoing', 'completed'
  fileref?: DocumentReference;   // Used in array-contains query
  duedate?: Timestamp;
  completeddate?: Timestamp;
}

/**
 * Collection: `deliverytime`
 * Referenced in: scheduling area
 */
export interface DeliveryTime {
  slottime: string;
  duration?: number;
}

/**
 * Collection: `appointmenttype`
 * Referenced in: authguard.service.ts
 */
export interface AppointmentType {
  name: string;
  duration?: number;
  description?: string;
}

/**
 * Collection: `procedures`
 * Referenced in: authguard, prescribe-atc
 */
export interface Procedure {
  name: string;
  description?: string;
  order?: number;
}

/**
 * Collection: `procedure_recommend`
 * Referenced in: prescribe-atc
 */
export interface ProcedureRecommend {
  name: string;
  procedures?: string[];
}

/**
 * Collection: `tagsystem`
 * Referenced in: authguard.service.ts
 */
export interface TagSystem {
  tagname: string;
  category?: string;
}

/**
 * Collection: `modes`
 * Referenced in: mode-dashboard area
 */
export interface Mode {
  name: string;
  description?: string;
  active?: boolean;
  sequence?: number;
}

/**
 * Collection: `product mode config`
 * Referenced in: AppEngagement area
 */
export interface ProductModeConfig {
  productid: string;
  modeid: string;
  config?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// 4. SCHEDULING & APPOINTMENTS
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `appointments`
 * Referenced in: authguard, new-profile, appointment-studio, appointment-calendar, many others
 * Core scheduling document.
 * ⚠️ WARNING: `platform` field is written by appointment-studio (OpenVidu flow) but
 * is likely undefined for older/Zoom appointments — treat as optional.
 */
export interface Appointment {
  bookedby: string;           // profileid of participant
  hosts: string[];            // Array of EIS staff profileids
  starttime: Timestamp;
  endtime: Timestamp;
  journeyid?: string;
  productid?: string;
  participantjourneyid?: string;
  status?: string;            // 'pending' | 'confirmed' | 'completed' | 'cancelled'
  platform?: string;          // ⚠️ Only set by OpenVidu flow — absent on Zoom appointments
  appointmenttypeid?: string;
  notes?: string;
  zoomlink?: string;
  roomref?: DocumentReference;
}

/**
 * Collection: `availability`
 * Referenced in: authguard, appointment-availability
 */
export interface Availability {
  userid: string;
  day: string;                // 'Monday' | 'Tuesday' | etc.
  starttime: string;
  endtime: string;
  active?: boolean;
  exceptions?: Timestamp[];
}

/**
 * Collection: `openviduroom`
 * Referenced in: authguard.service.ts, appointment-studio
 * OpenVidu live session rooms.
 */
export interface OpenViduRoom {
  active: boolean;
  createddate: Timestamp;
  sessiontype: string;
  sessionid: string;
  roomid: string;
  hosts: string[];
  participantid?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Collection: `offtime`
 * Referenced in: Offtime module
 */
export interface Offtime {
  docid: string;
  userid: string;
  startdate: Timestamp;
  enddate: Timestamp;
  reason?: string;
  status?: 'pending' | 'approved' | 'rejected';
  approvedby?: string;
}

// ─────────────────────────────────────────────────────────────
// 5. QUEUE SYSTEM
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `queue generation`
 * Referenced in: authguard, new-profile, dynamic-queue-manager-clone, big-dashboard
 * Master queue documents. Contains subcollection `stagechat`.
 */
export interface QueueGeneration {
  queuename: string;
  queueadmin: string[];      // Array of staff profileids — used in array-contains query
  queueenddate: Timestamp;   // Used in where() >= filter
  queuestartdate?: Timestamp;
  status?: string;
  eventid?: string;
  productid?: string;
  type?: string;

  // Subcollection: stagechat
  stagechat?: never; // see QueueStageChat below
}

/**
 * Subcollection: `queue generation/{queueId}/stagechat`
 * Referenced in: new-profile, dynamic-queue-manager-clone
 */
export interface QueueStageChat {
  docid: string;
  stage: string;
  senderprofileid: string;
  message: string;
  queueref: DocumentReference;
  date: Timestamp;
  pinned: boolean;
}

/**
 * Collection: `queue_token`
 * Referenced in: authguard, new-profile, dynamic-queue-manager-clone, prescribe-atc
 * Individual participant token in a queue — core queue state machine document.
 */
export interface QueueToken {
  queueref: DocumentReference;  // Reference to queue generation document
  profileid: string;
  tokenstatus: string;          // 'waiting' | 'in-progress' | 'completed' | 'transferred'
  stagestatus?: string;
  logdate: Timestamp;           // Used in orderBy
  delete?: boolean;
  participantproductid?: string;
  journeyid?: string;
  productid?: string;
}

/**
 * Collection: `queue stage log`
 * Referenced in: authguard, dynamic-queue-manager-clone, prescribe-atc
 * Logs every stage transition for a queue token.
 */
export interface QueueStageLog {
  logdocid: string;
  queueref: DocumentReference;
  profile_id: string;
  movedby?: string;
  movedthrough?: string;
  liveassignmentid?: string;
  logdate: Timestamp;
  fromstage?: string;
  tostage?: string;
}

/**
 * Collection: `queue planning`
 * Referenced in: dynamic-queue-manager-clone, queue-planning
 */
export interface QueuePlanning {
  queueid: string;
  planneddate?: Timestamp;
  allocations?: Record<string, unknown>;
  status?: string;
}

/**
 * Collection: `queue planning draft`
 * Referenced in: queue-planning area
 */
export interface QueuePlanningDraft {
  queueid: string;
  draftdata: Record<string, unknown>;
  lastsaved?: Timestamp;
}

/**
 * Collection: `queue studio pairing`
 * Referenced in: prescribe-atc, dynamic-queue-manager-clone
 */
export interface QueueStudioPairing {
  queueref: DocumentReference;
  participants: string[];      // Array-contains query used
  checkin?: boolean;
  studioin?: boolean;
  status?: string;
  completedprocedures?: string[];
}

/**
 * Collection: `queue variation`
 * Referenced in: dynamic-queue-manager-clone, prescribe-atc
 */
export interface QueueVariation {
  queueref: DocumentReference;
  variationname?: string;
  stages?: string[];
  config?: Record<string, unknown>;
}

/**
 * Collection: `queue avtest`
 * Referenced in: dynamic-queue-manager-clone
 * A/V testing records for queue participants.
 */
export interface QueueAvTest {
  profileid: string;
  queueid: string;
  testresult?: string;
  testdate?: Timestamp;
}

/**
 * Collection: `queue opportunity`
 * Referenced in: dynamic-queue-manager-clone
 */
export interface QueueOpportunity {
  docid: string;
  stage: string;
  queueid: string;
  tokenref: DocumentReference;
  status?: string;
  date?: Timestamp;
  metadata?: Record<string, unknown>;
}

/**
 * Collection: `live assignment`
 * Referenced in: prescribe-atc, dynamic-queue-manager-clone, appointment-studio
 * Records of live session assignments.
 */
export interface LiveAssignment {
  queueid: string;
  participantid: string;
  pairing?: string[];         // Array-contains query used
  zoomlinkrequired?: boolean;
  status?: string;
  created?: Timestamp;
  completedprocedures?: string[];
  liveassignmentstatus?: string;
}

/**
 * Collection: `queuereminder`
 * Referenced in: dynamic-queue-manager-clone, communication
 */
export interface QueueReminder {
  reminderContext: string;
  reminderDateTime: Timestamp;
  date: Timestamp;
  status: string;
  userentry: string;
  queueid: string;
}

/**
 * Collection: `stage opportunity count`
 * Referenced in: dynamic-queue-manager-clone
 */
export interface StageOpportunityCount {
  queuelist: string[];    // Array-contains query used
  stage: string;
  count: number;
}

/**
 * Collection: `segments`
 * Referenced in: dynamic-queue-manager-clone
 * Participant segment definitions for bulk targeting.
 */
export interface Segment {
  segmentname: string;
  profileids?: string[];
  criteria?: Record<string, unknown>;
}

/**
 * Collection: `studio activity log`
 * Referenced in: queue system
 */
export interface StudioActivityLog {
  queueid: string;
  activity: string;
  performedby: string;
  date: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// 6. ATC (ASSIGN TREAT CONFIRM)
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `atc_alpha`
 * Referenced in: prescribe-atc, dynamic-queue-manager-clone, big-dashboard, view-prescribed-atc
 * Primary ATC prescription records.
 * ⚠️ WARNING: `author` field is used in both `array-contains` (big-dashboard) and
 * `array-contains-any` queries — ensure it is stored as an array consistently.
 */
export interface AtcAlpha {
  profileid: string;
  prescription_date: Timestamp;   // Used in where() >= / <= filters
  author: string[];               // Array of author profileids
  isdelete?: boolean;
  queueid?: string;
  status?: string;
  procedures?: string[];
  notes?: string;
  atcmodelid?: string;
}

/**
 * Collection: `atc_notes`
 * Referenced in: ATC area
 */
export interface AtcNote {
  atcid: string;
  note: string;
  addedby: string;
  date: Timestamp;
}

/**
 * Collection: `atc_to_validate`
 * Referenced in: dynamic-queue-manager-clone, view-assigned-atc
 */
export interface AtcToValidate {
  profileid: string;
  queueid?: string;
  atcid?: string;
  status?: string;
  assignedto?: string;
  date?: Timestamp;
}

/**
 * Collection: `atc assignment`
 * Referenced in: prescribe-atc
 */
export interface AtcAssignment {
  assignedto: string[];   // Array-contains query used
  status: string;         // 'initiated' | 'completed'
  atcid?: string;
  assigneddate?: Timestamp;
  duedate?: Timestamp;
}

/**
 * Collection: `atc model`
 * Referenced in: prescribe-atc, Product Designer
 */
export interface AtcModel {
  atcmodel: string;
  description?: string;
  levels?: string[];
}

/**
 * Collection: `atc model level config`
 * Referenced in: big/atcmodel-level-config
 */
export interface AtcModelLevelConfig {
  atcmodelid: string;
  level: string;
  config: Record<string, unknown>;
}

/**
 * Collection: `atc taxonomy`
 * Referenced in: taxonomy area
 */
export interface AtcTaxonomy {
  taxonomyname: string;
  atcmodelid?: string;
  description?: string;
}

/**
 * Collection: `temporary_ATC`
 * Referenced in: prescribe-atc
 * Draft/in-progress ATC prescriptions — cleared on submission.
 */
export interface TemporaryAtc {
  profileid: string;
  authorprofileid: string[];
  delete?: boolean;           // Used in where() == false filter
  data?: Record<string, unknown>;
  created?: Timestamp;
}

/**
 * Collection: `temporary_tripleatc`
 * Referenced in: Triple ATC area
 */
export interface TemporaryTripleAtc {
  profileid: string;
  authorprofileid?: string[];
  delete?: boolean;
  data?: Record<string, unknown>;
}

/**
 * Collection: `pick_for_mentoring`
 * Referenced in: ATC/pick-for-mentoring
 */
export interface PickForMentoring {
  profileid: string;
  atcid?: string;
  pickedby?: string;
  pickeddate?: Timestamp;
  status?: string;
}

/**
 * Collection: `procedure_recommend`
 * Referenced in: prescribe-atc
 */
// (see above in Products section)

// ─────────────────────────────────────────────────────────────
// 7. B!G PROGRAM
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `big participants tags`
 * Referenced in: big-dashboard
 * Tags applied to B!G participants.
 */
export interface BigParticipantTag {
  profileid: string;
  tags: string[];
  taggedby?: string;
  tagdate?: Timestamp;
}

/**
 * Collection: `big cohorts`
 * Referenced in: big-dashboard, big-cohort-clone
 */
export interface BigCohort {
  cohortname: string;
  participantids: string[];
  cohortsref?: DocumentReference;   // Used in big assignment where() query
  active?: boolean;
  created?: Timestamp;
  cohorttype?: string;
}

/**
 * Collection: `big tags`
 * Referenced in: big-dashboard
 */
export interface BigTag {
  docid: string;
  tagname: string;
  category?: string;
  active?: boolean;
}

/**
 * Collection: `big participants notes`
 * Referenced in: big-dashboard
 */
export interface BigParticipantNote {
  docid: string;
  profileid: string;
  note: string;
  addedby: string;
  date: Timestamp;
}

/**
 * Collection: `biglevel`
 * Referenced in: big-dashboard
 */
export interface BigLevel {
  sequence: number;          // Used in orderBy desc
  levelname: string;
  description?: string;
  requirements?: Record<string, unknown>;
}

/**
 * Collection: `big aggregate level`
 * Referenced in: big-dashboard
 */
export interface BigAggregateLevel {
  profileid: string;
  levelid: string;
  score?: number;
  achieveddate?: Timestamp;
}

/**
 * Collection: `big assignment`
 * Referenced in: big-dashboard
 */
export interface BigAssignment {
  cohortsref: DocumentReference;   // Used in where() query
  profileid?: string;
  assignmenttype?: string;
  status?: string;
  duedate?: Timestamp;
}

/**
 * Collection: `bigactivity`
 * Referenced in: big-dashboard, prescribe-atc, dynamic-queue-manager-clone
 * B!G program activity definitions.
 */
export interface BigActivity {
  activity: string;           // Used in orderBy
  description?: string;
  type?: string;
  active?: boolean;
}

/**
 * Collection: `big marathon`
 * Referenced in: big-dashboard
 */
export interface BigMarathon {
  docid: string;
  startdate: Timestamp;      // Used in orderBy asc
  enddate?: Timestamp;
  result?: Record<string, unknown>;
  participants?: string[];
  status?: string;
}

/**
 * Collection: `big participants assignments`
 * Referenced in: prescribe-atc
 * ⚠️ WARNING: Different from `big assignment` — naming ambiguity between
 * `big assignment` and `big participants assignments` collections.
 */
export interface BigParticipantsAssignment {
  profileid?: string;
  assignmentref?: DocumentReference;
  status?: string;
}

/**
 * Collection: `Achievements/posts/postcollection`
 * Referenced in: new-profile, userprofile
 * Nested collection path — `Achievements` is a top-level collection,
 * `posts` is a document, `postcollection` is a subcollection.
 * ⚠️ WARNING: Unusual path structure (collection/document/subcollection).
 * Confirm this is intentional and not a schema design error.
 */
export interface Achievement {
  profileid: string;
  title?: string;
  description?: string;
  date?: Timestamp;
  // subcollection: likes
  likes?: never; // see AchievementLike
}

/**
 * Subcollection: `Achievements/posts/postcollection/{id}/likes`
 */
export interface AchievementLike {
  profileid: string;
  date?: Timestamp;
}

/**
 * Collection: `big aggregate event level`
 * Referenced in: big/big-aggregate-event-level
 */
export interface BigAggregateEventLevel {
  profileid: string;
  eventid?: string;
  level?: string;
  score?: number;
}

// ─────────────────────────────────────────────────────────────
// 8. EVENTS & ARENA
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `event collection`
 * Referenced in: new-profile, event-list, big-dashboard, dynamic-queue-manager-clone
 * Master event records.
 * ⚠️ WARNING: Collection name is `event collection` (with space) — unusual.
 * Queries filter by `hosts array-contains` and `end_date >=` suggesting two
 * separate access patterns that may result in missing composite index.
 */
export interface EventCollection {
  docid?: string;             // Set via idField option in collectionData
  event_id?: string;
  name: string;
  venue?: string;
  start_date: Timestamp;     // Used in orderBy desc
  end_date?: Timestamp;      // Used in where() >= filter
  hosts?: string[];          // Used in array-contains filter
  notifyparticipants?: boolean;
  addtocalendar?: boolean;
  status?: string;
  type?: string;
}

/**
 * Collection: `event participation request`
 * Referenced in: new-profile, dynamic-queue-manager-clone
 */
export interface EventParticipationRequest {
  profileid: string;
  eventref: DocumentReference;
  status: string;             // 'pending' | 'approved' | 'rejected'
  participantproductid?: string;
  requestdate?: Timestamp;
}

/**
 * Collection: `events_profiles`
 * Referenced in: Events module
 */
export interface EventsProfile {
  eventid: string;
  profileid: string;
  role?: string;
  status?: string;
}

/**
 * Collection: `event zones`
 * Referenced in: Zone Management
 */
export interface EventZone {
  eventid: string;
  zonename: string;
  capacity?: number;
  zoneconfig?: Record<string, unknown>;
}

/**
 * Collection: `event participant zones`
 * Referenced in: Zone Management
 */
export interface EventParticipantZone {
  eventid: string;
  profileid: string;
  zoneid: string;
  assigneddate?: Timestamp;
}

/**
 * Collection: `arena e-ticket`
 * Referenced in: Events/arena-e-ticket-approve
 */
export interface ArenaETicket {
  profileid: string;
  eventid: string;
  ticketstatus: string;
  issuedate?: Timestamp;
}

/**
 * Collection: `arena e-ticket log`
 * Referenced in: Events area
 */
export interface ArenaETicketLog {
  ticketid: string;
  action: string;
  performedby: string;
  date: Timestamp;
}

/**
 * Collection: `arena events`
 * Referenced in: dynamic-queue-manager-clone
 * Arena-specific event records.
 */
export interface ArenaEvent {
  name: string;
  date?: Timestamp;
  status?: string;
  hosts?: string[];
}

/**
 * Collection: `arena highlights`
 * Referenced in: Arena area
 */
export interface ArenaHighlight {
  eventid: string;
  highlighttext: string;
  date?: Timestamp;
  addedby?: string;
}

/**
 * Collection: `arenavideoask`
 * Referenced in: content/arena-video-ask-input
 */
export interface ArenaVideoAsk {
  templatename: string;
  videourl?: string;
  questions?: Record<string, unknown>[];
}

// ─────────────────────────────────────────────────────────────
// 9. CONTENT
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `episodes`
 * Referenced in: content/episodes-dashboard
 */
export interface Episode {
  title: string;
  seriesid?: string;
  videourl?: string;
  thumbnailurl?: string;
  publishdate?: Timestamp;
  active?: boolean;
  order?: number;
  tiered?: boolean;
}

/**
 * Collection: `series`
 * Referenced in: content/series-dashboard
 */
export interface Series {
  name: string;
  description?: string;
  categoryid?: string;
  thumbnailurl?: string;
  active?: boolean;
  created?: Timestamp;
}

/**
 * Collection: `content_urls`
 * Referenced in: content-upload area
 */
export interface ContentUrl {
  url: string;
  filename?: string;
  type?: string;
  uploaddate?: Timestamp;
  uploadedby?: string;
}

/**
 * Collection: `learning-materials`
 * Referenced in: content/learning-material
 */
export interface LearningMaterial {
  title: string;
  url?: string;
  type?: string;
  categoryid?: string;
  active?: boolean;
  publishdate?: Timestamp;
}

/**
 * Collection: `content analytics`
 * Referenced in: content-analytics
 */
export interface ContentAnalytic {
  episodeid?: string;
  seriesid?: string;
  profileid?: string;
  views?: number;
  completions?: number;
  date?: Timestamp;
}

/**
 * Collection: `participant content analytics`
 * Referenced in: participants-analytics area
 */
export interface ParticipantContentAnalytic {
  profileid: string;
  episodeid?: string;
  watchtime?: number;
  completed?: boolean;
  date?: Timestamp;
}

/**
 * Collection: `post_categories`
 * Referenced in: new-profile, userprofile
 */
export interface PostCategory {
  categoryname: string;
  description?: string;
  active?: boolean;
}

/**
 * Collection: `broadcast_analytics`
 * Referenced in: participants-analytics
 */
export interface BroadcastAnalytic {
  broadcastid: string;
  sent?: number;
  delivered?: number;
  read?: number;
  date?: Timestamp;
}

/**
 * Collection: `broadcast_participants`
 * Referenced in: participants-analytics
 */
export interface BroadcastParticipant {
  broadcastid: string;
  profileids: string[];
  status?: string;
}

/**
 * Collection: `engagement_snapshots`
 * Referenced in: analytics area
 */
export interface EngagementSnapshot {
  profileid: string;
  snapshotdate: Timestamp;
  metrics?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────
// 10. COMMUNICATION & NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `notifications/{uid}/logs`
 * Referenced in: authguard.service.ts, new-profile
 * Push notification delivery log — subcollection under user UID.
 * ⚠️ WARNING: Accessed via two different paths:
 *   - `notifications/{uid}/logs` (authguard pattern)
 *   - `notificationrecord` (flat collection in communication)
 * These appear to be separate systems that may cause confusion.
 */
export interface NotificationLog {
  title: string;
  message: string;
  subtitle?: string;
  type: string;
  notificationimage?: string;
  date: Timestamp;
  read: boolean;
  metadata?: Record<string, unknown>;
  landingpage?: string;
  sticky?: boolean;
  recordid?: string;
}

/**
 * Collection: `notificationrecord`
 * Referenced in: authguard, dynamic-queue-manager-clone, communication
 * Flat notification record — separate from `notifications/{uid}/logs`.
 */
export interface NotificationRecord {
  notificationtype?: string;
  metadata?: {
    queueref?: DocumentReference;
    [key: string]: unknown;
  };
  date: Timestamp;
  profileid?: string;
  status?: string;
}

/**
 * Collection: `notification templates`
 * Referenced in: communication
 */
export interface NotificationTemplate {
  templatename: string;
  templatevalidated?: boolean;    // Used in where() filter
  type?: string;                  // Used in where() filter
  title?: string;
  message?: string;
  published?: boolean;
  date?: Timestamp;
}

/**
 * Collection: `inapp templates`
 * Referenced in: communication
 */
export interface InAppTemplate {
  templatename: string;
  content?: string;
  type?: string;
  published?: boolean;
  date?: Timestamp;
}

/**
 * Collection: `A&H updates`
 * Referenced in: DialogBox/ah-notification
 * ⚠️ WARNING: Collection name contains '&' character — unusual and potentially
 * problematic with some Firestore path parsers. Consider renaming to `ah_updates`.
 */
export interface AhUpdate {
  date: Timestamp;
  message: string;
  title?: string;
  addedby?: string;
}

/**
 * Collection: `email templates`
 * Referenced in: communication, create-email-template
 */
export interface EmailTemplate {
  templatename: string;
  subject?: string;
  htmlcontent?: string;
  published?: boolean;
  date?: Timestamp;
  validators?: string[];
}

/**
 * Collection: `email validators`
 * Referenced in: communication
 * Known documents: `templateCategories`, `validators`
 */
export interface EmailValidators {
  // Document 'validators':
  validatorlist?: string[];
  // Document 'templateCategories':
  categories?: string[];
}

/**
 * Collection: `email archive`
 * Referenced in: communication, big-dashboard, dynamic-queue-manager-clone
 */
export interface EmailArchive {
  type: string;
  metadata?: Record<string, unknown>;
  docid?: string;
  result?: string;
  date?: Timestamp;
  templatevalidated?: boolean;  // Written by dynamic-queue-manager-clone
}

/**
 * Collection: `email log` / `email logs`
 * Referenced in: communication
 * ⚠️ WARNING: Two collections with similar names: `email log` and `email logs`
 * appear to be used in the same component. Confirm these are distinct collections.
 */
export interface EmailLog {
  emailarchiveid: string;   // Used in where() filter
  msgstatus?: string;       // Used in where() filter
  recipient?: string;
  sentdate?: Timestamp;
}

/**
 * Collection: `wati archive`
 * Referenced in: communication, dynamic-queue-manager-clone
 * WhatsApp (Wati) message archive.
 */
export interface WatiArchive {
  type?: string;
  metadata?: Record<string, unknown>;
  templatevalidated?: boolean;
  date?: Timestamp;
  profileid?: string;
}

/**
 * Collection: `wati templates`
 * Referenced in: communication
 */
export interface WatiTemplate {
  templatename: string;
  category?: string;
  language?: string;
  status?: string;
  date?: Timestamp;
}

/**
 * Collection: `myoperator calls`
 * Referenced in: communication
 */
export interface MyOperatorCall {
  time: Timestamp;           // Used in where() >= / <= filters
  callerid?: string;
  duration?: number;
  status?: string;
  profileid?: string;
}

/**
 * Collection: `messages`
 * Referenced in: Customer Support chat area
 */
export interface Message {
  senderid: string;
  content: string;
  date: Timestamp;
  ticketid?: string;
  read?: boolean;
  mediaurl?: string;
}

// ─────────────────────────────────────────────────────────────
// 11. WORKSHOPS
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `workshopconfiguration`
 * Referenced in: New-Workshop area
 */
export interface WorkshopConfiguration {
  detailpage?: Record<string, unknown>;   // Written via setDoc with merge: true
  workshopname?: string;
  config?: Record<string, unknown>;
}

/**
 * Collection: `workshop participant enrolled`
 * Referenced in: Workshop area
 */
export interface WorkshopParticipantEnrolled {
  workshopid: string;
  profileid: string;
  enrolldate?: Timestamp;
  status?: string;
}

/**
 * Collection: `eiflix workshop`
 * Referenced in: Workshop/eiflix-workshop area
 */
export interface EiflixWorkshop {
  name: string;
  description?: string;
  active?: boolean;
  startdate?: Timestamp;
  enddate?: Timestamp;
}

/**
 * Collection: `eiflix workshop challenges`
 * Referenced in: Workshop/challenge-view
 */
export interface EiflixWorkshopChallenge {
  workshopid: string;
  challengetitle: string;
  description?: string;
  duedate?: Timestamp;
  active?: boolean;
}

/**
 * Collection: `eiflix enrolment`
 * Referenced in: Workshop enrollment area
 */
export interface EiflixEnrolment {
  workshopid: string;
  profileid: string;
  enrolldate?: Timestamp;
  status?: string;
}

/**
 * Collection: `quiz`
 * Referenced in: quiz area
 */
export interface Quiz {
  title: string;
  questions?: QuizQuestion[];
  active?: boolean;
  created?: Timestamp;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctanswer?: number;
}

/**
 * Collection: `quizbyclients`
 * Referenced in: quiz area
 */
export interface QuizByClient {
  quizid: string;
  profileid: string;
  answers?: Record<string, unknown>;
  score?: number;
  submitdate?: Timestamp;
}

// ─────────────────────────────────────────────────────────────
// 12. EVOLUTION MAPPING
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `evolutionmappingvideo`
 * Referenced in: new-profile, userprofile, EvolutionMapping area
 */
export interface EvolutionMappingVideo {
  profileid: string;
  videourl?: string;
  recordeddate?: Timestamp;
  notes?: string;
}

/**
 * Collection: `liveevolutionmapping`
 * Referenced in: new-profile, userprofile
 */
export interface LiveEvolutionMapping {
  profileid: string;               // Used in where() filter
  mappingdata?: Record<string, unknown>;
  mappingdate?: Timestamp;
  mappedby?: string;
}

/**
 * Collection: `livechangework`
 * Referenced in: AppEngagement area
 */
export interface LiveChangeWork {
  profileid?: string;
  changedata?: Record<string, unknown>;
  date?: Timestamp;
}

/**
 * Collection: `evolutionwishlistlog`
 * Referenced in: AppEngagement/evolution-wishlist-log-screen
 */
export interface EvolutionWishlistLog {
  profileid: string;
  wishlistid?: string;
  notes?: string;
  logdate?: Timestamp;
  status?: string;
}

/**
 * Collection: `evolutionwishlistquestions`
 * Referenced in: AppEngagement
 */
export interface EvolutionWishlistQuestion {
  question: string;
  order?: number;
  active?: boolean;
}

// ─────────────────────────────────────────────────────────────
// 13. CUSTOMER SUPPORT
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `clientissue`
 * Referenced in: new-profile, dynamic-queue-manager-clone, Customer Support area
 */
export interface ClientIssue {
  clientid: string;             // Used in where() filter
  reporteddate: Timestamp;      // Used in where() >= / <= filters
  issuetext?: string;
  status?: string;
  resolveddate?: Timestamp;
  resolvedby?: string;
  ticketno?: string;
}

/**
 * Collection: `supportchat`
 * Referenced in: Customer Support chat
 */
export interface SupportChat {
  ticketid: string;
  messages?: Message[];
  participants?: string[];
  status?: string;
}

// ─────────────────────────────────────────────────────────────
// 14. INFRASTRUCTURE & SYSTEM
// ─────────────────────────────────────────────────────────────

/**
 * Collection: `AWS_System`
 * Referenced in: instance-status.service.ts
 * Document: `instance_status`
 * Infrastructure monitoring — master and media node status.
 */
export interface AwsInstanceStatus {
  // Master node
  masternode_status?: 'running' | 'stopped' | 'pending';
  masternode_ip?: string;
  masternode_lastchecked?: Timestamp;
  // Media nodes
  medianodes_count?: number;
  medianodes_status?: string;
  medianodes_health?: Record<string, unknown>;
  // General
  lastupdated?: Timestamp;
}

/**
 * Collection: `zoomaccount`
 * Referenced in: queue system/zoom-account
 */
export interface ZoomAccount {
  accountname: string;
  accountid?: string;
  active?: boolean;
  capacity?: number;
  usedby?: string;
}

/**
 * Collection: `participant_reports`
 * Referenced in: analytics area
 */
export interface ParticipantReport {
  profileid: string;
  reporttype: string;
  reportdate: Timestamp;
  data?: Record<string, unknown>;
}

/**
 * Collection: `appactionpending`
 * Referenced in: AppEngagement/app-action-pending
 */
export interface AppActionPending {
  profileid: string;
  actiontype: string;
  status: string;
  duedate?: Timestamp;
  addedby?: string;
  date?: Timestamp;
}

/**
 * Collection: `dashboard`
 * See definition in Identity & Access section above.
 */
