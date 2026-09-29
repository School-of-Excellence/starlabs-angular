/*
 * Participant Intelligence
 *
 * Everything for this screen lives in this file, in dependency order: models, data service,
 * filter engine, signals, checklists, store, dialogs, child components and finally the page
 * component (ParticipantIntelligenceComponent).
 */

import { ChangeDetectionStrategy, Component, ElementRef, Injectable, Injector, OnInit, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Firestore, QuerySnapshot, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, firstValueFrom, forkJoin, from } from 'rxjs';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { CPM_PRODUCT_IDS, UP_LIVE_PRODUCT_IDS } from '../../Participants Profile Management/participants-analytics/participants-analytics.engine';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { SendInterimReportComponent } from '../../Participants Profile Management/participants-analytics/send-interim-report/send-interim-report.component';
import { EvolutionWishlistLogComponent } from '../../Participants Profile Management/participants-analytics/evolution-wishlist-log/evolution-wishlist-log.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { BroadcastComponent } from '../../Participants Profile Management/participants-analytics/broadcast/broadcast.component';
import { BulkAddProductsComponent } from '../../Participants Profile Management/participants-analytics/bulk-add-products/bulk-add-products.component';
import { ManageParticipantlistDialogComponent } from '../../Participants Profile Management/participants-analytics/manage-participantlist-dialog/manage-participantlist-dialog.component';
import { MapRecommendedplaylistToparticipantComponentComponent } from '../../Participants Profile Management/participants-analytics/map-recommendedplaylist-toparticipant.component/map-recommendedplaylist-toparticipant.component.component';
import { WatiConfigDialogComponent } from '../../Participants Profile Management/participants-analytics/wati-config-dialog/wati-config-dialog.component';
import { SendmessagesComponent } from '../../New-Workshop/workshop-dashboard/sendmessages/sendmessages.component';
import { WhatsAppProgressData, WhatsappProgressDialogComponent } from '../../New-Workshop/whatsapp-progress-dialog.component';
import { AddPendingActionComponent } from '../../AppEngagement/app-action-pending/add-pending-action/add-pending-action.component';

// ================================================================================================
// Models
// ================================================================================================

// Field names mirror the `participant metadata` Firestore document.

export type CustomerStatus =
  | 'active'
  | 'non active'
  | 'discontinued'
  | 'late'
  | 'banned'
  | 'none';

// Watson status; values are matched exactly.
export type FinancialStatus =
  | 'regular'
  | 'fully paid'
  | 'locked'
  | 'defaulted'
  | 'late'
  | 'discontinued'
  | 'banned'
  | 'none';

export type EmiStatus = 'on-track' | 'overdue' | 'completed' | 'none';

export type SupportStatus = 'Open' | 'Closed' | 'none';

export interface Remark {
  date: string; // ISO
  note: string;
  givenby: string;
}

// One row in the table. Id fields resolve to names through ReferenceData.
export interface Participant {
  profileid: string;
  name: string;
  email: string;
  phonenumber: string;
  countrycode: string;
  registered: boolean;
  participantmode: string;
  customerstatus: CustomerStatus;
  financialstatus: FinancialStatus;
  activejourney: string | null;
  lastcompletedjourney: string | null;
  higherorderpurchase: string | null;
  activeproduct: string[];
  consumedproducts: string[];
  unconsumedproducts: string[];
  addons: string[];
  gifts: string[];
  bonus: string[];
  tier: string[];
  profiletags: string[];
  atccount: number | null; // null when the field is missing, so "no data" never reads as 0
  customersupport: { status: SupportStatus; category: string | null };
  remarks: Remark[];
  // the subscription for the participant's status: non active / discontinued → the last one, others → the current one
  subscriptionstart: string | null;
  subscriptionend: string | null;
  isLastSubscription: boolean; // subscriptionstart / subscriptionend come from lastsubscription*
  currentSubscriptionStart: string | null; // subscriptionstart as stored
  currentSubscriptionEnd: string | null;
  lastSubscriptionStart: string | null; // lastsubscriptionstart as stored
  lastSubscriptionEnd: string | null;
  lastpaymentdate: string | null;
  purchasedate: string | null;
  dateofbirth: string | null;
  age: number | null;
  // journey for the participant's status: active → current, non active → last completed,
  // discontinued → last subscribed (cancelled); null otherwise
  journey: string | null;
  upcount: number; // consumed uP! products
  cpmcount: number; // consumed CPM products
  purchasevalue: number | null;
  paid: number | null;
  balance: number | null; // purchasevalue − paid
  paymentplan: string | null;
  emiStatus: EmiStatus;
  productevent: Record<string, string[]>; // productId -> event ids
  queueevent: Record<string, string[]>; // productId -> queue ids
  // participantjourneyproduct doc that holds the subscription: purchaseref (active) or
  // lastsubscribedpurchaseref (non active); null for any other status
  subscriptionPurchaseId: string | null;
  // recommended playlists (ids resolved through the playlist collections)
  eiflix: string[];
  solarvoice: string[];
  generalcontent: string[];
  // the untouched participant metadata doc — the analytics dialogs reused here expect it
  raw: Dict;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  tagsfor: string[];
  isActive: boolean;
}

export interface ProductRef extends NamedRef {
  type: string | null; // products.type, e.g. 'DFU'
}

// An event (start_date) or queue (created date); names repeat, so the date tells them apart.
export interface DatedRef extends NamedRef {
  date: string | null;
}

// A live segment board segment and its last saved member list (segmentboardlist).
export interface JourneySegment extends NamedRef {
  profileIds: string[];
  lastupdated: string | null;
}

// Lookup tables loaded once; the table and filters resolve ids to names through these.
export interface ReferenceData {
  journeys: NamedRef[];
  products: ProductRef[];
  modes: NamedRef[];
  tiers: NamedRef[];
  tags: Tag[];
  events: DatedRef[]; // name A–Z, then newest first
  queues: DatedRef[]; // name A–Z, then newest first
  journeySegments: JourneySegment[]; // board display order
}

// Count conditions (uP! / CPM / ATC counts and product-count rules); both numbers are inclusive.
export type CountOp = 'atLeast' | 'atMost' | 'exact' | 'between';

export const COUNT_OPS: { value: CountOp; label: string }[] = [
  { value: 'atLeast', label: 'At least' },
  { value: 'atMost', label: 'At most' },
  { value: 'exact', label: 'Exact' },
  { value: 'between', label: 'Is between' },
];
const isCountOp = (v: unknown): v is CountOp => COUNT_OPS.some((o) => o.value === v);

// `b` is only used by 'between'.
export interface CountCondition {
  op: CountOp;
  a: number | null;
  b: number | null;
}

export interface ProductCountRule {
  productId: string;
  comparison: CountOp;
  count: number | null;
  count2?: number | null; // upper bound for 'between'
}

// How a subscription (S = start, E = end) relates to the From–To range; day precision, inclusive.
export type SubscriptionRelation =
  | 'startBetween'
  | 'endBetween'
  | 'within'
  | 'startInEndAfter'
  | 'startBeforeEndIn'
  | 'throughout'
  | 'anyTime'
  | 'notActive';

export const SUBSCRIPTION_RELATIONS: { value: SubscriptionRelation; label: string }[] = [
  { value: 'startBetween', label: 'Start between' },
  { value: 'endBetween', label: 'End between' },
  { value: 'within', label: 'Start and end in range' },
  { value: 'startInEndAfter', label: 'Start in range, end after it' },
  { value: 'startBeforeEndIn', label: 'Start before range, end in it' },
  { value: 'throughout', label: 'Active throughout' },
  { value: 'anyTime', label: 'Active at any time' },
  { value: 'notActive', label: 'Not active in the range' },
];

// from / to are yyyy-mm-dd; a missing side is unbounded.
export interface SubscriptionFilter {
  relation: SubscriptionRelation;
  from: string | null;
  to: string | null;
}

export type RegisteredFilter = 'registered' | 'non-registered';

export type UpStatus = 'new' | 'returning';

// attended = participant metadata.productevent; confirmed = approved event participation requests
export type EventStatus = 'attended' | 'confirmed';

// active + approved queue_token: completed = currentstage 'Completed'; live = any other stage
export type QueueStatus = 'completed' | 'live';

// Checkbox sections: each supports include (OR within the group) and exclude.
export const CHECK_GROUPS = [
  'customerstatus',
  'financialstatus',
  'registered',
  'customersupport',
  'activejourney',
  'lastcompletedjourney',
  'activeproduct',
  'tier',
  'participantmode',
  'profiletags',
  'addons',
  'gifts',
  'bonus',
  'events',
  'queues',
  'upStatus',
  'journeysegments',
] as const;
export type CheckGroup = (typeof CHECK_GROUPS)[number];

// The single source of truth for what the user has filtered by.
export interface FilterModel {
  search: string;
  participantmode: string[];
  customerstatus: CustomerStatus[];
  financialstatus: FinancialStatus[];
  activejourney: string[];
  lastcompletedjourney: string[];
  activeproduct: string[];
  addons: string[];
  gifts: string[];
  bonus: string[];
  events: string[];
  queues: string[];
  profiletags: string[];
  tier: string[];
  registered: RegisteredFilter[];
  customersupport: SupportStatus[];
  journeysegments: string[]; // segment board segment ids
  atcCount: CountCondition;
  upCount: CountCondition;
  cpmCount: CountCondition;
  upStatus: UpStatus[];
  ageMin: number | null;
  ageMax: number | null;
  eventStatus: EventStatus;
  queueStatus: QueueStatus;
  exclude: Partial<Record<CheckGroup, string[]>>;
  subscription: SubscriptionFilter;
  consumed: ProductCountRule[];
  unconsumed: ProductCountRule[];
}

export function emptyCondition(): CountCondition {
  return { op: 'atLeast', a: null, b: null };
}

export function emptyFilter(): FilterModel {
  return {
    search: '',
    participantmode: [],
    customerstatus: [],
    financialstatus: [],
    activejourney: [],
    lastcompletedjourney: [],
    activeproduct: [],
    addons: [],
    gifts: [],
    bonus: [],
    events: [],
    queues: [],
    profiletags: [],
    tier: [],
    registered: [],
    customersupport: [],
    journeysegments: [],
    atcCount: emptyCondition(),
    upCount: emptyCondition(),
    cpmCount: emptyCondition(),
    upStatus: [],
    ageMin: null,
    ageMax: null,
    eventStatus: 'attended',
    queueStatus: 'completed',
    exclude: {},
    subscription: { relation: 'startBetween', from: null, to: null },
    consumed: [],
    unconsumed: [],
  };
}

// Unified "audience" — collapses the old saved-filters, lists and segments into one concept.
export type AudienceKind = 'filter' | 'list' | 'segment';

export interface Audience {
  id: string;
  name: string;
  kind: AudienceKind;
  isDefault: boolean;
  createdBy: string;
  createdDate: string;
  filter?: FilterModel; // kind === 'filter'
  // kind === 'filter': an end range saved next to a start range (by analytics or before relations).
  // This screen applies one relation, so it isn't applied here, and saving leaves it in place for analytics.
  legacySubscriptionEnd?: { from: string | null; to: string | null };
  profileIds?: string[]; // kind === 'list'
  memberAudienceIds?: string[]; // kind === 'segment'
  live?: boolean; // lists only
}

export type ColumnType =
  | 'name'
  | 'text'
  | 'date'
  | 'number'
  | 'money'
  | 'array'
  | 'tags'
  | 'status'
  | 'remarks';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  // how to resolve array/id columns to display text
  resolve?: 'journey' | 'product' | 'tag' | 'tier' | 'mode' | 'playlist';
}

// A removable filter pill shown above the table.
export interface FilterChip {
  group: keyof FilterModel;
  label: string;
  value: string; // identifies the specific value to remove (or '' for whole-group resets)
  exclude?: boolean;
}

// ================================================================================================
// Column catalog
// ================================================================================================

// Every column the user can add to the table. `name` is always present and pinned.
const COLUMN_CATALOG: ColumnDef[] = [
  { key: 'name', label: 'Participant', type: 'name' },
  { key: 'customerstatus', label: 'Customer status', type: 'status' },
  { key: 'financialstatus', label: 'Financial status', type: 'status' },
  { key: 'journey', label: 'Journey', type: 'text', resolve: 'journey' },
  { key: 'activejourney', label: 'Active journey', type: 'text', resolve: 'journey' },
  { key: 'lastcompletedjourney', label: 'Last completed journey', type: 'text', resolve: 'journey' },
  { key: 'higherorderpurchase', label: 'Higher-order purchase', type: 'text', resolve: 'journey' },
  { key: 'activeproduct', label: 'Active products', type: 'array', resolve: 'product' },
  { key: 'consumedproducts', label: 'Consumed products', type: 'array', resolve: 'product' },
  { key: 'unconsumedproducts', label: 'Unconsumed products', type: 'array', resolve: 'product' },
  { key: 'addons', label: 'Add-ons', type: 'array', resolve: 'product' },
  { key: 'gifts', label: 'Gifts', type: 'array', resolve: 'product' },
  { key: 'bonus', label: 'Bonus', type: 'array', resolve: 'product' },
  { key: 'tier', label: 'Tier', type: 'array', resolve: 'tier' },
  { key: 'profiletags', label: 'Tags', type: 'tags', resolve: 'tag' },
  { key: 'participantmode', label: 'Mode', type: 'text', resolve: 'mode' },
  { key: 'atccount', label: 'ATC count', type: 'number' },
  { key: 'upcount', label: 'uP! count', type: 'number' },
  { key: 'cpmcount', label: 'CPM count', type: 'number' },
  { key: 'purchasevalue', label: 'Purchase value', type: 'money' },
  { key: 'paid', label: 'Paid', type: 'money' },
  { key: 'balance', label: 'Balance', type: 'money' },
  { key: 'paymentplan', label: 'Payment plan', type: 'text' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'registered', label: 'Registered', type: 'status' },
  { key: 'emiStatus', label: 'EMI status', type: 'status' },
  { key: 'customersupport', label: 'Support', type: 'status' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phonenumber', label: 'Phone', type: 'text' },
  { key: 'subscriptionstart', label: 'Subscription start', type: 'date' },
  { key: 'subscriptionend', label: 'Subscription end', type: 'date' },
  { key: 'currentSubscriptionStart', label: 'Current subscription start', type: 'date' },
  { key: 'currentSubscriptionEnd', label: 'Current subscription end', type: 'date' },
  { key: 'lastSubscriptionStart', label: 'Last subscription start', type: 'date' },
  { key: 'lastSubscriptionEnd', label: 'Last subscription end', type: 'date' },
  { key: 'purchasedate', label: 'Purchase date', type: 'date' },
  { key: 'lastpaymentdate', label: 'Last payment', type: 'date' },
  { key: 'dateofbirth', label: 'Date of birth', type: 'date' },
  { key: 'remarks', label: 'Remarks', type: 'remarks' },
  { key: 'eiflix', label: 'EIFLIX (recommended)', type: 'array', resolve: 'playlist' },
  { key: 'solarvoice', label: 'SolarVoice (recommended)', type: 'array', resolve: 'playlist' },
  { key: 'generalcontent', label: 'General content (recommended)', type: 'array', resolve: 'playlist' },
];

const PLAYLIST_COLUMNS = ['eiflix', 'solarvoice', 'generalcontent'];

const COLUMN_DEF_MAP: Record<string, ColumnDef> = COLUMN_CATALOG.reduce(
  (acc, c) => ((acc[c.key] = c), acc),
  {} as Record<string, ColumnDef>
);

// What the table shows on first load: only the participant; everything else is added from the Columns menu.
const DEFAULT_VISIBLE_COLUMNS = ['name'];

// Nothing is frozen by default, so every column scrolls together; pinning is opt-in from the Columns menu.
const DEFAULT_PINNED_COLUMNS: string[] = [];

// ================================================================================================
// Filter engine
// ================================================================================================

// Pure AND-combination filter over the loaded participants.

// Values of a productId -> ids map, flattened. Map values may be a single id or a list, so they are
// concatenated the way the analytics screen does.
function mapValues(map: Record<string, string[] | string> | undefined): string[] {
  return map ? ([] as string[]).concat(...Object.values(map)) : [];
}

// Data that doesn't live on the participant record, used by the event / queue / journey segment filters.
export interface FilterContext {
  confirmedByEvent?: Record<string, Set<string>>; // eventId -> profile ids with an approved request
  completedByQueue?: Record<string, Set<string>>; // queueId -> profile ids whose active, approved token is at 'Completed'
  liveByQueue?: Record<string, Set<string>>; // queueId -> profile ids whose active, approved token is at any other stage
  segmentMembers?: Record<string, Set<string>>; // journey segment id -> profile ids in its saved list
}

// Does participant p have value v in a checkbox group?
function hasValue(p: Participant, f: FilterModel, g: CheckGroup, v: string, ctx: FilterContext): boolean {
  switch (g) {
    case 'registered':
      return v === (p.registered ? 'registered' : 'non-registered');
    case 'customersupport':
      return p.customersupport.status === v;
    case 'upStatus':
      return v === (p.upcount > 0 ? 'returning' : 'new');
    case 'events':
      return f.eventStatus === 'confirmed'
        ? !!ctx.confirmedByEvent?.[v]?.has(p.profileid)
        : mapValues(p.productevent).includes(v);
    case 'queues':
      return !!(f.queueStatus === 'live' ? ctx.liveByQueue : ctx.completedByQueue)?.[v]?.has(p.profileid);
    case 'journeysegments':
      return !!ctx.segmentMembers?.[v]?.has(p.profileid);
    default: {
      const value = p[g];
      return Array.isArray(value) ? value.includes(v) : value === v;
    }
  }
}

// ---- validation: an invalid or incomplete condition is ignored by applyFilters and gets no chip ----

const isCount = (n: number | null): boolean => n == null || (Number.isInteger(n) && n >= 0);

// Why a count condition can't be applied, or null. Blank isn't an error: the condition is simply off.
export function conditionError(c: CountCondition): string | null {
  if (!isCount(c.a) || (c.op === 'between' && !isCount(c.b))) return 'Use whole numbers, 0 or more.';
  if (c.op !== 'between') return null;
  if ((c.a == null) !== (c.b == null)) return 'Enter both numbers.';
  return c.a != null && c.b != null && c.a > c.b ? 'The first number is larger than the second.' : null;
}

// Filters only when complete and valid; "at least 0" matches everyone, so it counts as off too.
export function conditionActive(c: CountCondition): boolean {
  return c.a != null && (c.op !== 'between' || c.b != null) && !conditionError(c) && !(c.op === 'atLeast' && c.a === 0);
}

export function ruleCondition(r: ProductCountRule): CountCondition {
  return { op: r.comparison, a: r.count, b: r.count2 ?? null };
}

// A product rule applies once it names a product and its condition is active.
export function productRuleActive(r: ProductCountRule): boolean {
  return !!r.productId && conditionActive(ruleCondition(r));
}

export function ageRangeError(min: number | null, max: number | null): string | null {
  if (!isCount(min) || !isCount(max)) return 'Use whole numbers, 0 or more.';
  return min != null && max != null && min > max ? 'Min is larger than max.' : null;
}

function ageActive(f: FilterModel): boolean {
  return (f.ageMin != null || f.ageMax != null) && !ageRangeError(f.ageMin, f.ageMax);
}

export function subscriptionFilterError(s: SubscriptionFilter): string | null {
  return s.from && s.to && s.from > s.to ? 'The start date is after the end date.' : null;
}

function subscriptionActive(s: SubscriptionFilter): boolean {
  return !!(s.from || s.to) && !subscriptionFilterError(s);
}

// Anything entered in the rail, including input the engine ignores (a reversed range, a half-filled
// "Is between", a rule without a number) and a changed switch, so Reset can clear it. The top search
// has its own clear. Checked field by field: cycling an option off leaves an empty exclude list behind.
export function filterTouched(f: FilterModel): boolean {
  const blank = emptyFilter();
  const cond = (c: CountCondition) => c.op !== blank.atcCount.op || c.a != null || c.b != null;
  return (
    CHECK_GROUPS.some((g) => (f[g] as string[]).length || f.exclude[g]?.length) ||
    cond(f.atcCount) ||
    cond(f.upCount) ||
    cond(f.cpmCount) ||
    f.ageMin != null ||
    f.ageMax != null ||
    !!f.subscription.from ||
    !!f.subscription.to ||
    f.subscription.relation !== blank.subscription.relation ||
    f.eventStatus !== blank.eventStatus ||
    f.queueStatus !== blank.queueStatus ||
    f.consumed.length > 0 ||
    f.unconsumed.length > 0
  );
}

// ---- matching ----

// A missing value (e.g. no atccount) never matches an active condition.
function matchesCount(value: number | null, c: CountCondition): boolean {
  if (value == null) return false;
  const a = c.a ?? 0;
  switch (c.op) {
    case 'atLeast':
      return value >= a;
    case 'atMost':
      return value <= a;
    case 'exact':
      return value === a;
    case 'between':
      return value >= a && value <= (c.b ?? a);
  }
}

// How many times the product appears in the participant's consumed / unconsumed list.
function matchesProductCount(products: string[], rule: ProductCountRule): boolean {
  return matchesCount(products.filter((id) => id === rule.productId).length, ruleCondition(rule));
}

// Local calendar day as yyyy-mm-dd: subscription dates compare by day, not by time of day. A bare day
// string is kept as it is; new Date() would read it as UTC midnight, the previous day west of UTC.
function dayKey(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// How the participant's subscription (S, E) relates to the From–To range, by day and inclusive.
// A missing date never matches; an open side of the range is unbounded.
function matchesSubscription(p: Participant, s: SubscriptionFilter): boolean {
  const start = dayKey(p.subscriptionstart);
  const end = dayKey(p.subscriptionend);
  const from = s.from ?? '0000-01-01';
  const to = s.to ?? '9999-12-31';
  const inRange = (day: string) => from <= day && day <= to;
  if (s.relation === 'startBetween') return !!start && inRange(start);
  if (s.relation === 'endBetween') return !!end && inRange(end);
  if (!start || !end) return false;
  switch (s.relation) {
    case 'within':
      return inRange(start) && inRange(end);
    case 'startInEndAfter':
      return inRange(start) && end > to;
    case 'startBeforeEndIn':
      return start < from && inRange(end);
    case 'throughout':
      return start <= from && end >= to;
    case 'anyTime':
      return start <= to && end >= from;
    case 'notActive':
      return end < from || start > to;
  }
}

function matchesSearch(p: Participant, term: string): boolean {
  if (!term.trim()) return true;
  const t = term.trim().toLowerCase();
  return (
    p.name.toLowerCase().includes(t) ||
    p.email.toLowerCase().includes(t) ||
    p.phonenumber.includes(t) ||
    p.profileid.toLowerCase().includes(t)
  );
}

// Checkbox groups: included values are OR'd, excluded values remove matches. Then the count, age,
// date and product-count rules that are active are AND'd on top.
export function applyFilters(participants: Participant[], f: FilterModel, ctx: FilterContext = {}): Participant[] {
  const groups = CHECK_GROUPS.map((g) => ({ g, inc: f[g] as string[], exc: f.exclude[g] ?? [] })).filter(
    (x) => x.inc.length || x.exc.length
  );
  const counts = [
    { value: (p: Participant) => p.atccount, c: f.atcCount },
    { value: (p: Participant) => p.upcount, c: f.upCount },
    { value: (p: Participant) => p.cpmcount, c: f.cpmCount },
  ].filter((x) => conditionActive(x.c));
  const age = ageActive(f);
  const subscription = subscriptionActive(f.subscription);
  const consumed = f.consumed.filter(productRuleActive);
  const unconsumed = f.unconsumed.filter(productRuleActive);
  return participants.filter((p) => {
    if (!matchesSearch(p, f.search)) return false;
    for (const { g, inc, exc } of groups) {
      if (inc.length && !inc.some((v) => hasValue(p, f, g, v, ctx))) return false;
      if (exc.some((v) => hasValue(p, f, g, v, ctx))) return false;
    }
    for (const { value, c } of counts) if (!matchesCount(value(p), c)) return false;
    if (age) {
      if (p.age == null) return false;
      if (f.ageMin != null && p.age < f.ageMin) return false;
      if (f.ageMax != null && p.age > f.ageMax) return false;
    }
    if (subscription && !matchesSubscription(p, f.subscription)) return false;
    for (const rule of consumed) if (!matchesProductCount(p.consumedproducts, rule)) return false;
    for (const rule of unconsumed) if (!matchesProductCount(p.unconsumedproducts, rule)) return false;
    return true;
  });
}

function describeCondition(c: CountCondition): string {
  switch (c.op) {
    case 'atLeast':
      return `at least ${c.a}`;
    case 'atMost':
      return `at most ${c.a}`;
    case 'exact':
      return `exactly ${c.a}`;
    case 'between':
      return `between ${c.a} and ${c.b}`;
  }
}

const formatDay = (day: string): string =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Event / queue names repeat, so the rail options and the chips both add the date: "Name · 12 Mar 2026".
function datedLabel(ref: DatedRef): string {
  const day = dayKey(ref.date);
  return day ? `${ref.name} · ${formatDay(day)}` : ref.name;
}

// A From–To day range in words; a missing side is open.
function describeRange(from: string | null, to: string | null): string {
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`;
  return from ? `from ${formatDay(from)}` : `until ${formatDay(to ?? '')}`;
}

// Builds the removable pills shown above the table from the current filter model. Conditions that
// applyFilters ignores (invalid, incomplete, no-op) get no pill.
export function deriveChips(f: FilterModel, ref: ReferenceData): FilterChip[] {
  const chips: FilterChip[] = [];
  const journeyName = (id: string) => ref.journeys.find((j) => j.id === id)?.name ?? id;
  const productName = (id: string) => ref.products.find((p) => p.id === id)?.name ?? id;
  const tierName = (id: string) => ref.tiers.find((t) => t.id === id)?.name ?? id;
  const tagName = (id: string) => ref.tags.find((t) => t.id === id)?.name ?? id;
  const dated = (list: DatedRef[], id: string) => {
    const d = list.find((x) => x.id === id);
    return d ? datedLabel(d) : id;
  };
  const eventName = (id: string) => dated(ref.events, id);
  const queueName = (id: string) => dated(ref.queues, id);
  const segmentName = (id: string) => ref.journeySegments.find((s) => s.id === id)?.name ?? id;

  const addEach = (group: CheckGroup, values: string[], prefix: string, fmt: (v: string) => string = (v) => v) => {
    for (const v of values) chips.push({ group, value: v, label: `${prefix}: ${fmt(v)}` });
    for (const v of f.exclude[group] ?? []) chips.push({ group, value: v, label: `${prefix}: not ${fmt(v)}`, exclude: true });
  };

  addEach('customerstatus', f.customerstatus, 'Status');
  addEach('financialstatus', f.financialstatus, 'Financial');
  addEach('participantmode', f.participantmode, 'Mode', (v) => (v === 'none' ? 'None' : v));
  addEach('activejourney', f.activejourney, 'Journey', journeyName);
  addEach('lastcompletedjourney', f.lastcompletedjourney, 'Completed', journeyName);
  addEach('journeysegments', f.journeysegments, 'Journey segment', segmentName);
  addEach('activeproduct', f.activeproduct, 'Product', productName);
  addEach('addons', f.addons, 'Add-on', productName);
  addEach('gifts', f.gifts, 'Gift', productName);
  addEach('bonus', f.bonus, 'Bonus', productName);
  addEach('events', f.events, f.eventStatus === 'confirmed' ? 'Confirmed for' : 'Attended', eventName);
  addEach('queues', f.queues, f.queueStatus === 'live' ? 'Live in queue' : 'Completed queue', queueName);
  addEach('tier', f.tier, 'Tier', tierName);
  addEach('profiletags', f.profiletags, 'Tag', tagName);
  addEach('registered', f.registered, 'Registered');
  addEach('customersupport', f.customersupport, 'Support');
  addEach('upStatus', f.upStatus, 'uP!', (v) => (v === 'new' ? 'New' : 'Already attended'));

  const addCount = (group: 'atcCount' | 'upCount' | 'cpmCount', label: string) => {
    if (conditionActive(f[group])) chips.push({ group, value: '', label: `${label}: ${describeCondition(f[group])}` });
  };
  addCount('atcCount', 'ATC count');
  addCount('upCount', 'uP! count');
  addCount('cpmCount', 'CPM count');

  if (ageActive(f)) {
    const age =
      f.ageMin != null && f.ageMax != null ? `${f.ageMin}–${f.ageMax}` : f.ageMin != null ? `${f.ageMin} or older` : `${f.ageMax} or younger`;
    chips.push({ group: 'ageMin', value: '', label: `Age: ${age}` });
  }

  const s = f.subscription;
  if (subscriptionActive(s)) {
    const relation = SUBSCRIPTION_RELATIONS.find((r) => r.value === s.relation)?.label ?? s.relation;
    chips.push({ group: 'subscription', value: '', label: `Subscription · ${relation}: ${describeRange(s.from, s.to)}` });
  }

  // value = the rule's index, so two rules on the same product are removed one at a time
  const addRules = (group: 'consumed' | 'unconsumed', prefix: string) =>
    f[group].forEach((r, i) => {
      if (productRuleActive(r))
        chips.push({ group, value: String(i), label: `${prefix} ${productName(r.productId)}: ${describeCondition(ruleCondition(r))}` });
    });
  addRules('consumed', 'Consumed');
  addRules('unconsumed', 'Unconsumed');

  return chips;
}

// What a filter actually applies, independent of order: tells whether a loaded saved filter was
// modified. Search, switched-off conditions and an event / queue switch with nothing ticked don't count.
export function filterSignature(f: FilterModel): string {
  const sorted = (values: string[] = []) => [...values].sort();
  const cond = (c: CountCondition) => (conditionActive(c) ? [c.op, c.a, c.op === 'between' ? c.b : null] : null);
  const rules = (list: ProductCountRule[]) =>
    list
      .filter(productRuleActive)
      .map((r) => JSON.stringify([r.productId, cond(ruleCondition(r))]))
      .sort();
  const s = f.subscription;
  return JSON.stringify([
    CHECK_GROUPS.map((g) => [sorted(f[g] as string[]), sorted(f.exclude[g])]),
    f.events.length || f.exclude.events?.length ? f.eventStatus : null,
    f.queues.length || f.exclude.queues?.length ? f.queueStatus : null,
    [cond(f.atcCount), cond(f.upCount), cond(f.cpmCount)],
    ageActive(f) ? [f.ageMin, f.ageMax] : null,
    subscriptionActive(s) ? [s.relation, s.from, s.to] : null,
    rules(f.consumed),
    rules(f.unconsumed),
  ]);
}

// id -> name lookup for a reference list.
function toNameMap(items: { id: string; name: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const i of items) m[i.id] = i.name;
  return m;
}

// ================================================================================================
// Watson status rules
// ================================================================================================

// financialstatus is Watson's customer status; customerstatus is the Star Labs subscription status.
export interface WatsonRule {
  id: string;
  label: string;
  description: string;
  violates: (p: Participant) => boolean; // true = participant breaks the rule
}

const FULLY_PAID_MAX_BALANCE = 1000;
const WATSON_LIVE: FinancialStatus[] = ['regular', 'defaulted', 'locked', 'fully paid'];

export const WATSON_RULES: WatsonRule[] = [
  {
    id: 'watson-r1',
    label: 'R1 · Regular / defaulted / locked / fully paid',
    description: 'Watson status regular, defaulted, locked or fully paid must have subscription active or non active.',
    violates: (p) => WATSON_LIVE.includes(p.financialstatus) && p.customerstatus !== 'active' && p.customerstatus !== 'non active',
  },
  {
    id: 'watson-r2',
    label: 'R2 · Discontinued',
    description: 'Watson status discontinued must have subscription discontinued.',
    violates: (p) => p.financialstatus === 'discontinued' && p.customerstatus !== 'discontinued',
  },
  {
    id: 'watson-r3',
    label: 'R3 · Banned',
    description: 'Watson status banned must have subscription banned.',
    violates: (p) => p.financialstatus === 'banned' && p.customerstatus !== 'banned',
  },
  {
    id: 'watson-r4',
    label: 'R4 · Late',
    description: 'Watson status late must have subscription late.',
    violates: (p) => p.financialstatus === 'late' && p.customerstatus !== 'late',
  },
  {
    id: 'watson-r5',
    label: 'R5 · Fully paid ⇔ balance ≤ 1000',
    description:
      'Balance ≤ 1000 must be Watson fully paid, and fully paid must have balance ≤ 1000. Discontinued / banned / late are skipped, as are participants with no purchase value.',
    violates: (p) => {
      if (p.financialstatus === 'discontinued' || p.financialstatus === 'banned' || p.financialstatus === 'late') return false;
      if (p.balance == null) return false;
      const lowBalance = p.balance <= FULLY_PAID_MAX_BALANCE;
      return lowBalance !== (p.financialstatus === 'fully paid');
    },
  },
];

// ================================================================================================
// Signals
// ================================================================================================

// "Gap" / health detectors. Each is a pure predicate over a participant; the screen
// runs them across the base, counts matches, and turns each into a clickable cohort.

export type SignalCategory = 'integrity' | 'retention' | 'finance' | 'financial' | 'opportunity';
export type SignalSeverity = 'critical' | 'warn' | 'opportunity';

// Reference lookups some predicates need: which product / journey ids are real, which products are DFU.
export interface SignalContext {
  productIds: Set<string>;
  journeyIds: Set<string>;
  dfuProductIds: Set<string>;
}

export interface SignalDef {
  id: string;
  label: string;
  // the active-insight chip / topbar text, when the card label only reads right under its category
  chipLabel?: string;
  description: string;
  category: SignalCategory;
  severity: SignalSeverity;
  // a count of one status value rather than a problem: left out of "need attention"
  breakdown?: boolean;
  predicate: (p: Participant, ref: SignalContext) => boolean;
}

// thresholds — single place to tune the intelligence
const HIGH_ATC = 8;
const VALUE_CONSUMED = 3;
const LAPSED_DAYS = 183; // ~6 months

const daysSince = (iso: string | null): number | null =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : null;

// The end date is the last active day, so a subscription has expired once that day is before today.
const subscriptionExpired = (p: Participant): boolean => {
  const end = dayKey(p.subscriptionend);
  const today = dayKey(new Date());
  return !!end && !!today && end < today;
};

// Watson finance statuses that mean the finance side is no longer live.
const NON_ACTIVE_FINANCE: FinancialStatus[] = ['defaulted', 'locked', 'banned', 'late', 'discontinued'];

// One Finance status card per Watson value; clicking one filters to it.
const FINANCE_BREAKDOWN: { value: FinancialStatus; label: string; severity: SignalSeverity }[] = [
  { value: 'regular', label: 'Regular', severity: 'opportunity' },
  { value: 'fully paid', label: 'Fully paid', severity: 'opportunity' },
  { value: 'defaulted', label: 'Defaulted', severity: 'critical' },
  { value: 'locked', label: 'Locked', severity: 'warn' },
  { value: 'late', label: 'Late', severity: 'warn' },
  { value: 'banned', label: 'Banned', severity: 'critical' },
  { value: 'discontinued', label: 'Discontinued', severity: 'warn' },
  { value: 'none', label: 'None', severity: 'warn' },
];

export const SIGNALS: SignalDef[] = [
  // --- integrity: contradictory states to fix ---
  {
    id: 'discontinued-active-product',
    label: 'Discontinued, still has active product',
    description: 'Marked discontinued yet an active product remains — fix the record or revive them.',
    category: 'integrity',
    severity: 'critical',
    predicate: (p) => p.customerstatus === 'discontinued' && p.activeproduct.length > 0,
  },
  {
    id: 'active-sub-expired',
    label: 'Active, but subscription already expired',
    description: 'Customer status is active while the last day of the subscription is before today.',
    category: 'integrity',
    severity: 'critical',
    predicate: (p) => p.customerstatus === 'active' && subscriptionExpired(p),
  },
  {
    id: 'defaulted-but-active',
    label: 'Defaulted / banned finance, still active',
    description: 'Financial standing is defaulted or banned but the customer is still active.',
    category: 'integrity',
    severity: 'critical',
    predicate: (p) => (p.financialstatus === 'defaulted' || p.financialstatus === 'banned') && p.customerstatus === 'active',
  },
  {
    id: 'status-none-engaged',
    label: 'No customer status, but engaged',
    description: 'Has a known active or consumed product, or an active journey that exists, yet customer status is unset.',
    category: 'integrity',
    severity: 'warn',
    predicate: (p, ref) =>
      p.customerstatus === 'none' &&
      (p.activeproduct.some((id) => ref.productIds.has(id)) ||
        p.consumedproducts.some((id) => ref.productIds.has(id)) ||
        (!!p.activejourney && ref.journeyIds.has(p.activejourney))),
  },
  {
    id: 'product-never-consumed',
    label: 'Has product, never consumed any',
    description: 'An active product exists but nothing has been consumed — fulfillment gap.',
    category: 'integrity',
    severity: 'warn',
    predicate: (p) => p.activeproduct.length > 0 && p.consumedproducts.length === 0,
  },

  {
    id: 'watson-mismatch',
    label: 'Watson status mismatch',
    description: 'Breaks at least one Watson status rule (R1–R5) — see Checklists → Watson status.',
    category: 'integrity',
    severity: 'critical',
    predicate: (p) => WATSON_RULES.some((r) => r.violates(p)),
  },
  {
    id: 'multiple-dfu-active',
    label: 'Multiple DFU products active',
    description: 'Two or more active product entries are DFU products (a repeated product counts each time).',
    category: 'integrity',
    severity: 'warn',
    predicate: (p, ref) => p.activeproduct.filter((id) => ref.dfuProductIds.has(id)).length >= 2,
  },

  // --- retention: churn risk / revive ---
  {
    id: 'recently-lapsed',
    label: 'Lapsed in the last 6 months (non active), not renewed',
    description: `Non active (discontinued excluded) and the subscription ended within the last ${LAPSED_DAYS} days — warm win-back.`,
    category: 'retention',
    severity: 'critical',
    predicate: (p) => {
      const d = daysSince(p.subscriptionend);
      return p.customerstatus === 'non active' && d != null && d > 0 && d <= LAPSED_DAYS;
    },
  },
  {
    id: 'late-status',
    label: 'Late — needs attention',
    description: 'Customer status flagged late.',
    category: 'retention',
    severity: 'warn',
    predicate: (p) => p.customerstatus === 'late',
  },
  {
    id: 'high-value-lapse',
    label: 'High-value, now inactive',
    description: `Inactive now but consumed ${VALUE_CONSUMED}+ products before — prioritise reviving.`,
    category: 'retention',
    severity: 'warn',
    predicate: (p) => p.customerstatus === 'non active' && p.consumedproducts.length >= VALUE_CONSUMED,
  },
  {
    id: 'active-not-registered',
    label: 'Active, but no app account',
    description: 'Active customer who never registered on the app — onboarding gap.',
    category: 'retention',
    severity: 'warn',
    predicate: (p) => p.customerstatus === 'active' && !p.registered,
  },

  {
    id: 'status-none',
    label: 'Customer status None',
    description: 'No Star Labs customer status set.',
    category: 'retention',
    severity: 'warn',
    predicate: (p) => p.customerstatus === 'none',
  },
  {
    id: 'higher-order-mismatch',
    label: 'Higher-order purchase ≠ current journey',
    description: 'Has a higher-order purchase that differs from the active journey (any status). No higher-order purchase is never a mismatch.',
    category: 'retention',
    severity: 'warn',
    predicate: (p) => !!p.higherorderpurchase && p.higherorderpurchase !== p.activejourney,
  },

  // --- finance status: a breakdown per Watson status, plus one flag ---
  ...FINANCE_BREAKDOWN.map(
    ({ value, label, severity }): SignalDef => ({
      id: `finance-${value.replace(' ', '-')}`,
      label,
      // prefixed so the active insight reads on its own (e.g. not just "None")
      chipLabel: `Finance: ${label}`,
      description: `Watson finance status ${label.toLowerCase()}.`,
      category: 'finance',
      severity,
      breakdown: true,
      predicate: (p) => p.financialstatus === value,
    })
  ),
  {
    id: 'active-customer-finance-inactive',
    label: 'Active customer, non-active finance',
    description: 'Customer status active while the Watson finance status is defaulted, locked, banned, late or discontinued.',
    category: 'finance',
    severity: 'critical',
    predicate: (p) => p.customerstatus === 'active' && NON_ACTIVE_FINANCE.includes(p.financialstatus),
  },

  // --- opportunity: upsell / relationship ---
  {
    id: 'power-user-no-upgrade',
    label: 'Power user, no upgrade yet',
    description: `High coach engagement (${HIGH_ATC}+ ATC) with no higher-order purchase — upsell.`,
    category: 'opportunity',
    severity: 'opportunity',
    predicate: (p) => p.atccount != null && p.atccount >= HIGH_ATC && !p.higherorderpurchase,
  },
  {
    id: 'fully-consumed-ready',
    label: 'Fully consumed, ready for next',
    description: 'Active with everything consumed and nothing pending — ready for the next product.',
    category: 'opportunity',
    severity: 'opportunity',
    predicate: (p) => p.customerstatus === 'active' && p.consumedproducts.length > 0 && p.unconsumedproducts.length === 0,
  },
  {
    id: 'active-never-contacted',
    label: 'Active, no remarks yet',
    description: 'Active customer with no remarks on record yet — relationship gap.',
    category: 'opportunity',
    severity: 'opportunity',
    predicate: (p) => p.customerstatus === 'active' && p.remarks.length === 0,
  },
];

const SIGNAL_MAP: Record<string, SignalDef> = SIGNALS.reduce(
  (acc, s) => ((acc[s.id] = s), acc),
  {} as Record<string, SignalDef>
);

const SIGNAL_CATEGORIES: { key: SignalCategory; label: string }[] = [
  { key: 'integrity', label: 'Data integrity' },
  { key: 'retention', label: 'Retention risk' },
  { key: 'finance', label: 'Finance status' },
  { key: 'financial', label: 'Financial' },
  { key: 'opportunity', label: 'Opportunity' },
];

// ================================================================================================
// Checklists
// ================================================================================================

// Reconciliation checklists (bulk status verification). The ones that can be computed from the
// loaded participant base carry a predicate; the rest need other collections / the Watson finance
// DB and are surfaced with an explanatory note rather than silently omitted.
export interface ChecklistDef {
  id: string;
  label: string;
  watson?: boolean; // show Watson / subscription / balance columns
  description: string;
  wired: boolean;
  predicate?: (p: Participant) => boolean;
  note?: string;
}

const WATSON_CHECKLISTS: ChecklistDef[] = WATSON_RULES.map((r) => ({
  id: r.id,
  label: r.label,
  description: r.description,
  wired: true,
  watson: true,
  predicate: r.violates,
}));

const NOT_WIRED = 'Not wired in this build — requires data outside the loaded participant base.';

const CHECKLISTS: ChecklistDef[] = [
  {
    id: 'customer-status',
    label: 'Customer status',
    description: 'Participants with no customer status set.',
    wired: true,
    predicate: (p) => p.customerstatus === 'none',
  },
  {
    id: 'higher-order-purchase',
    label: 'Higher-order purchase',
    description: 'Higher-order purchase differs from the active and last-completed journey.',
    wired: true,
    predicate: (p) =>
      !!p.higherorderpurchase && p.higherorderpurchase !== p.activejourney && p.higherorderpurchase !== p.lastcompletedjourney,
  },
  {
    id: 'active-no-product',
    label: 'Active without product',
    description: 'Active customers with no active product to deliver.',
    wired: true,
    predicate: (p) => p.customerstatus === 'active' && p.activeproduct.length === 0,
  },
  {
    id: 'expired-but-active',
    label: 'Expired but active',
    description: 'Active customers whose last subscription day is before today.',
    wired: true,
    predicate: (p) => p.customerstatus === 'active' && subscriptionExpired(p),
  },
  {
    id: 'product-event',
    label: 'Product event',
    description: 'Participants who have product-event records.',
    wired: true,
    predicate: (p) => Object.keys(p.productevent || {}).length > 0,
  },
  {
    id: 'queue-event',
    label: 'Queue event',
    description: 'Participants who have queue records.',
    wired: true,
    predicate: (p) => Object.keys(p.queueevent || {}).length > 0,
  },
  { id: 'watson-status', label: 'Watson status', description: 'Star Labs vs Watson finance status mismatch.', wired: false, note: NOT_WIRED },
  { id: 'first-purchase', label: 'First purchase', description: 'Approved sales leads vs Watson purchases.', wired: false, note: NOT_WIRED },
  { id: 'payment-plan', label: 'Payment plan', description: 'Payment-plan method from Watson.', wired: false, note: NOT_WIRED },
  { id: 'overall-purchase', label: 'Overall purchase', description: 'From participant journey products.', wired: false, note: NOT_WIRED },
  { id: 'journey-onboarding', label: 'Journey onboarding', description: 'From participant journey products.', wired: false, note: NOT_WIRED },
];

export type Dict = Record<string, any>;

// Id lists: blank and non-string entries are dropped so they never count as a product / tag / member.
const arr = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
const tsToIso = (x: any): string | null => {
  if (!x) return null;
  if (typeof x?.toDate === 'function') return x.toDate().toISOString();
  if (typeof x === 'string') return x;
  if (x instanceof Date) return x.toISOString();
  return null;
};
// A saved date as yyyy-mm-dd: day strings are kept as they are, timestamps and ISO strings become their local day.
const toDay = (x: unknown): string | null => dayKey(tsToIso(x));
const num = (x: unknown): number | null => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
const ageFrom = (iso: string | null): number | null => {
  if (!iso) return null;
  const dob = new Date(iso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
};

// ================================================================================================
// Data service
// ================================================================================================

// queueId -> profile ids with an active, approved queue token, by whether the token's stage is 'Completed'.
interface QueueMembers {
  completed: Record<string, string[]>;
  live: Record<string, string[]>;
}

// Reads and writes the participant collections in the configured Firebase project's Firestore.
@Injectable()
export class ParticipantDataService {
  private readonly firestore = inject(Firestore);
  private readonly authguard = inject(AuthguardService);
  private loggedInProfileId = '';

  get profileId(): string {
    return this.loggedInProfileId;
  }

  constructor() {
    this.authguard
      .getRoles()
      .then((r: Dict) => {
        this.loggedInProfileId = r?.['profile_ref']?.id ?? r?.['profileid'] ?? '';
      })
      .catch(() => undefined);
  }

  // ---------- reads ----------
  getReferenceData(): Observable<ReferenceData> {
    return from(this.loadReference());
  }
  getParticipants(): Observable<Participant[]> {
    return from(this.loadParticipants());
  }
  getAudiences(): Observable<Audience[]> {
    return from(this.loadAudiences());
  }
  private async loadReference(): Promise<ReferenceData> {
    const col = (name: string) => getDocs(collection(this.firestore, name)).catch(() => null);
    const [journeys, products, modes, tiers, tags, events, queues, segmentConfigs, segmentLists] = await Promise.all([
      col('journey'),
      col('products'),
      col('modes'),
      col('tier'),
      col('participant tags'),
      col('event collection'),
      col('queue generation'),
      col('segmentboardconfig'),
      col('segmentboardlist'),
    ]);
    const named = (snap: any, field: string): NamedRef[] =>
      snap ? snap.docs.map((d: any) => ({ id: d.id, name: d.data()[field] ?? d.id })) : [];
    // event / queue names repeat, so options are listed by name, then newest first
    const dated = (snap: any, nameField: string, dateField: string): DatedRef[] =>
      (snap ? snap.docs : [])
        .map((d: any) => ({ id: d.id, name: d.data()[nameField] ?? d.id, date: tsToIso(d.data()[dateField]) }))
        .sort((a: DatedRef, b: DatedRef) => String(a.name).localeCompare(String(b.name)) || (b.date ?? '').localeCompare(a.date ?? ''));
    const tagList: Tag[] = tags
      ? tags.docs.map((d: any) => {
          const data = d.data();
          return { id: d.id, name: data['name'] ?? d.id, tagsfor: arr(data['tagsfor']), isActive: data['isActive'] !== false };
        })
      : [];
    return {
      journeys: named(journeys, 'journey'),
      products: products ? products.docs.map((d: any) => ({ id: d.id, name: d.data()['product'] ?? d.id, type: d.data()['type'] ?? null })) : [],
      // participant metadata stores the mode NAME, so the name is also the id
      modes: modes ? [...new Set<string>(modes.docs.map((d: any) => String(d.data()['mode'] ?? '')).filter(Boolean))].map((m) => ({ id: m, name: m })) : [],
      tiers: named(tiers, 'tier'),
      tags: tagList,
      events: dated(events, 'name', 'start_date'),
      queues: dated(queues, 'queuename', 'created'),
      journeySegments: this.journeySegments(segmentConfigs, segmentLists),
    };
  }

  // Live segment board segments in board order (as the segment board), each with its saved member list.
  // Archived and inactive segments are left out: the board places no one in an inactive segment, even
  // though its segmentboardlist doc can still hold the last refreshed list.
  private journeySegments(configs: QuerySnapshot | null, lists: QuerySnapshot | null): JourneySegment[] {
    if (!configs) return [];
    const saved = new Map<string, Dict>();
    for (const d of lists?.docs ?? []) saved.set(d.data()['segmentid'] ?? d.id, d.data());
    return configs.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter(({ data }) => !data['archived'] && data['status'] !== 'inactive')
      .sort(
        (a, b) =>
          (a.data['displayIndex'] ?? 1e9) - (b.data['displayIndex'] ?? 1e9) || String(a.data['name'] ?? '').localeCompare(String(b.data['name'] ?? ''))
      )
      .map(({ id, data }) => {
        const list = saved.get(id);
        return { id, name: data['name'] ?? id, profileIds: arr(list?.['profilelist']), lastupdated: tsToIso(list?.['lastupdated']) };
      });
  }

  private async loadParticipants(): Promise<Participant[]> {
    const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), orderBy('name')));
    return snap.docs.map((d) => this.mapParticipant(d.id, d.data() as Dict));
  }

  private mapParticipant(id: string, d: Dict): Participant {
    const status = (d['customerstatus'] ?? 'none') as CustomerStatus;
    // status-conditional subscription window (mirrors the original screen)
    const useLast = status === 'discontinued' || status === 'non active';
    const current = { start: tsToIso(d['subscriptionstart']), end: tsToIso(d['subscriptionend']) };
    const last = { start: tsToIso(d['lastsubscriptionstart']), end: tsToIso(d['lastsubscriptionend']) };
    const sub = useLast ? last : current;
    const consumed = arr(d['consumedproducts']);
    const dob = tsToIso(d['dateofbirth']);
    const purchasevalue = num(d['pp_totalpurchasevalue']);
    const paid = num(d['pp_totalpaid']);
    const journey =
      status === 'active' ? d['activejourney'] : status === 'non active' ? d['lastcompletedjourney'] : status === 'discontinued' ? d['lastsubscribedjourney'] : null;

    return {
      profileid: d['profileid'] ?? id,
      name: d['name'] ?? '(no name)',
      email: d['email'] ?? '',
      phonenumber: d['phonenumber'] != null ? String(d['phonenumber']) : '',
      countrycode: d['countryCode'] ?? d['countrycode'] ?? '',
      registered: d['firebaseuserref'] != null,
      participantmode: d['participantmode'] || 'none',
      customerstatus: status,
      financialstatus: this.normFinancial(d['financialstatus']),
      activejourney: d['activejourney'] ?? null,
      lastcompletedjourney: d['lastcompletedjourney'] ?? null,
      higherorderpurchase: d['higherorderpurchase'] ?? null,
      activeproduct: arr(d['activeproduct']),
      consumedproducts: consumed,
      unconsumedproducts: arr(d['unconsumedproducts']),
      addons: arr(d['addons']),
      gifts: arr(d['gifts']),
      bonus: arr(d['bonus']),
      tier: arr(d['tier']),
      profiletags: arr(d['profiletags']),
      atccount: num(d['atccount']),
      customersupport: this.collapseSupport(d['customersupport']),
      remarks: this.mapRemarks(d['remarks']),
      subscriptionstart: sub.start,
      subscriptionend: sub.end,
      isLastSubscription: useLast,
      currentSubscriptionStart: current.start,
      currentSubscriptionEnd: current.end,
      lastSubscriptionStart: last.start,
      lastSubscriptionEnd: last.end,
      lastpaymentdate: tsToIso(d['lastpaymentdate']),
      purchasedate: tsToIso(d['purchasedate']),
      dateofbirth: dob,
      age: ageFrom(dob),
      journey: journey ?? null,
      upcount: consumed.filter((id) => UP_LIVE_PRODUCT_IDS.includes(id)).length,
      cpmcount: consumed.filter((id) => CPM_PRODUCT_IDS.includes(id)).length,
      purchasevalue,
      paid,
      balance: purchasevalue == null ? null : purchasevalue - (paid ?? 0),
      paymentplan: d['paymentplan'] ? String(d['paymentplan']) : null,
      emiStatus: this.mapEmi(d['financedata']?.['paymentstatus']),
      productevent: d['productevent'] && typeof d['productevent'] === 'object' ? d['productevent'] : {},
      queueevent: d['queueevent'] && typeof d['queueevent'] === 'object' ? d['queueevent'] : {},
      subscriptionPurchaseId:
        (status === 'active' ? d['purchaseref']?.id : status === 'non active' ? d['lastsubscribedpurchaseref']?.id : null) ?? null,
      eiflix: arr(d['eiflix']),
      solarvoice: arr(d['solarvoice']),
      generalcontent: arr(d['generalcontent']),
      raw: d,
    };
  }

  private normFinancial(v: unknown): FinancialStatus {
    const s = (v ?? '').toString();
    const allowed: FinancialStatus[] = ['regular', 'fully paid', 'locked', 'defaulted', 'late', 'discontinued', 'banned'];
    return allowed.includes(s as FinancialStatus) ? (s as FinancialStatus) : 'none';
  }

  private collapseSupport(map: unknown): { status: SupportStatus; category: string | null } {
    if (!map || typeof map !== 'object') return { status: 'none', category: null };
    const tickets = Object.values(map as Dict);
    if (!tickets.length) return { status: 'none', category: null };
    const hasOpen = tickets.some((t: any) => t?.status === 'Open' || t?.status === 'open');
    const first = tickets[0] as any;
    return { status: hasOpen ? 'Open' : 'Closed', category: first?.category ?? null };
  }

  private mapRemarks(remarks: unknown): Remark[] {
    if (!Array.isArray(remarks)) return [];
    return remarks.map((r: any) => ({
      date: tsToIso(r?.date) ?? new Date().toISOString(),
      note: r?.note ?? '',
      givenby: r?.givenby ?? '',
    }));
  }

  private mapEmi(v: unknown): EmiStatus {
    const s = (v ?? '').toString().toLowerCase();
    if (!s) return 'none';
    if (s.includes('overdue') || s.includes('default') || s.includes('late')) return 'overdue';
    if (s.includes('complete') || s.includes('paid') || s.includes('closed')) return 'completed';
    if (s.includes('regular') || s.includes('active') || s.includes('track') || s.includes('ongoing')) return 'on-track';
    return 'none';
  }

  private async loadAudiences(): Promise<Audience[]> {
    const [filters, lists, segments] = await Promise.all([
      getDocs(collection(this.firestore, 'searchquery')),
      getDocs(collection(this.firestore, 'participant list')),
      getDocs(collection(this.firestore, 'segments')),
    ]);
    const out: Audience[] = [];
    filters.docs.forEach((d) => {
      const data = d.data() as Dict;
      const filter = this.mapSavedFilter(data);
      out.push({
        id: data['docid'] ?? d.id,
        name: data['label'] ?? 'Saved filter',
        kind: 'filter',
        isDefault: false,
        createdBy: data['createdby'] ?? '—',
        createdDate: '',
        filter,
        legacySubscriptionEnd: this.legacySubscriptionEnd(data, filter),
      });
    });
    lists.docs.forEach((d) => {
      const data = d.data() as Dict;
      out.push({
        id: d.id,
        name: data['listname'] ?? 'List',
        kind: 'list',
        isDefault: false,
        createdBy: '—',
        createdDate: tsToIso(data['createddate']) ?? '',
        live: data['live'] ?? false,
        profileIds: arr(data['profilelist']),
      });
    });
    segments.docs.forEach((d) => {
      const data = d.data() as Dict;
      out.push({
        id: d.id,
        name: data['segmentname'] ?? 'Segment',
        kind: 'segment',
        isDefault: false,
        createdBy: '—',
        createdDate: tsToIso(data['createddate']) ?? '',
        memberAudienceIds: arr(data['participantlistid']),
      });
    });
    return out;
  }

  // The analytics keys sit at the top level of the doc; everything only this screen filters on is in pifilter.
  // Mode, add-ons, gifts and bonus are analytics keys too; docs this screen saved earlier have them in pifilter.
  private mapSavedFilter(d: Dict): FilterModel {
    const f = emptyFilter();
    f.customerstatus = arr(d['customerstatus']) as CustomerStatus[];
    f.financialstatus = arr(d['financialstatus']) as FinancialStatus[];
    f.activejourney = arr(d['activejourney']);
    f.lastcompletedjourney = arr(d['lastcompletedjourney']);
    f.activeproduct = arr(d['activeproduct']);
    f.profiletags = arr(d['profiletags']);
    f.tier = arr(d['tier']);
    f.registered = arr(d['registereduser']) as FilterModel['registered'];
    const pi = (d['pifilter'] ?? {}) as Dict;
    f.participantmode = arr(pi['participantmode'] ?? d['participantmode']);
    f.addons = arr(pi['addons'] ?? d['addons']);
    f.gifts = arr(pi['gifts'] ?? d['gifts']);
    f.bonus = arr(pi['bonus'] ?? d['bonus']);
    f.queues = arr(pi['queues']);
    f.customersupport = arr(pi['customersupport']) as SupportStatus[];
    f.journeysegments = arr(pi['journeysegments']);
    // Before count conditions: this screen saved the top-level atccount as a minimum (its docs have a
    // pifilter), analytics saves it as an exact count; upCountMin / cpmCountMin were minimums.
    const atc = num(d['atccount']);
    f.atcCount = this.countCondition(pi['atcCount']) ?? { op: d['pifilter'] ? 'atLeast' : 'exact', a: atc, b: null };
    f.upCount = this.countCondition(pi['upCount']) ?? { op: 'atLeast', a: num(pi['upCountMin']), b: null };
    f.cpmCount = this.countCondition(pi['cpmCount']) ?? { op: 'atLeast', a: num(pi['cpmCountMin']), b: null };
    f.upStatus = arr(pi['upStatus']) as UpStatus[];
    f.ageMin = num(pi['ageMin']);
    f.ageMax = num(pi['ageMax']);
    f.events = arr(pi['events']);
    f.eventStatus = pi['eventStatus'] === 'confirmed' ? 'confirmed' : 'attended';
    f.queueStatus = pi['queueStatus'] === 'live' ? 'live' : 'completed';
    f.exclude = (pi['exclude'] && typeof pi['exclude'] === 'object' ? pi['exclude'] : {}) as FilterModel['exclude'];
    f.subscription = this.subscriptionFilter(pi['subscription'], d);
    f.consumed = this.productRules(pi['consumed']);
    f.unconsumed = this.productRules(pi['unconsumed']);
    return f;
  }

  // A saved {op, a, b}, or null when the doc predates count conditions.
  private countCondition(x: unknown): CountCondition | null {
    if (!x || typeof x !== 'object') return null;
    const c = x as Dict;
    return { op: isCountOp(c['op']) ? c['op'] : 'atLeast', a: num(c['a']), b: num(c['b']) };
  }

  // Comparisons saved as 'gte' / 'lte' / 'eq' read as at least / at most / exact.
  private productRules(x: unknown): ProductCountRule[] {
    const legacy: Record<string, CountOp> = { gte: 'atLeast', lte: 'atMost', eq: 'exact' };
    return (Array.isArray(x) ? (x as Dict[]) : [])
      .filter((r) => r && typeof r['productId'] === 'string')
      .map((r) => ({
        productId: r['productId'],
        comparison: legacy[r['comparison']] ?? (isCountOp(r['comparison']) ? r['comparison'] : 'atLeast'),
        count: num(r['count']),
        count2: num(r['count2']),
      }));
  }

  // pifilter keeps the relation. Older docs (and analytics) only have the start / end ranges, read back
  // as "Start between" or, when only the end range is set, "End between".
  private subscriptionFilter(saved: unknown, d: Dict): SubscriptionFilter {
    if (saved && typeof saved === 'object') {
      const s = saved as Dict;
      const relation = SUBSCRIPTION_RELATIONS.some((r) => r.value === s['relation']) ? (s['relation'] as SubscriptionRelation) : 'startBetween';
      return { relation, from: toDay(s['from']), to: toDay(s['to']) };
    }
    const start = this.range(d['subscriptionstart']);
    const end = this.range(d['subscriptionend']);
    return !start.from && !start.to && (end.from || end.to) ? { relation: 'endBetween', ...end } : { relation: 'startBetween', ...start };
  }

  // This screen writes subscriptionend only for "End between", so an end range under any other relation
  // was saved by analytics, or before relations, next to a start range.
  private legacySubscriptionEnd(d: Dict, f: FilterModel): Audience['legacySubscriptionEnd'] {
    const end = this.range(d['subscriptionend']);
    return f.subscription.relation !== 'endBetween' && (end.from || end.to) ? end : undefined;
  }

  private range(x: unknown): { from: string | null; to: string | null } {
    if (!x || typeof x !== 'object') return { from: null, to: null };
    const r = x as Dict;
    return { from: toDay(r['start']), to: toDay(r['end']) };
  }

  // ---------- writes (safe set: tags, remarks, audiences, lists) ----------
  private chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }

  async persistTags(profileIds: string[], tagIds: string[], mode: 'add' | 'remove'): Promise<void> {
    if (!profileIds.length || !tagIds.length) return;
    const op = mode === 'add' ? arrayUnion(...tagIds) : arrayRemove(...tagIds);
    for (const group of this.chunk(profileIds, 400)) {
      const batch = writeBatch(this.firestore);
      for (const pid of group) batch.update(doc(this.firestore, 'participant metadata', pid), { profiletags: op });
      await batch.commit();
    }
  }

  async persistRemark(profileIds: string[], remark: Remark): Promise<void> {
    if (!profileIds.length) return;
    const entry = { date: new Date(), note: remark.note, givenby: this.loggedInProfileId || remark.givenby };
    for (const group of this.chunk(profileIds, 400)) {
      const batch = writeBatch(this.firestore);
      for (const pid of group) batch.update(doc(this.firestore, 'participant metadata', pid), { remarks: arrayUnion(entry) });
      await batch.commit();
    }
  }

  // Extends each purchase's subscription: logs the current doc to `subscription extend log`, then
  // updates subscriptionend / extendreason / journeystatus on `participantjourneyproduct`.
  async extendSubscriptions(purchaseIds: string[], ext: SubscriptionExtension): Promise<void> {
    await Promise.all(
      purchaseIds.map(async (id) => {
        const ref = doc(this.firestore, 'participantjourneyproduct', id);
        const snap = await getDoc(ref);
        const current = snap.data();
        if (!current) return;
        const newEnd = extendedEnd(tsToIso(current['subscriptionend']), ext);
        await setDoc(doc(collection(this.firestore, 'subscription extend log')), { ...current, extendreason: ext.reason });
        await updateDoc(ref, {
          subscriptionend: newEnd,
          extendreason: ext.reason,
          journeystatus: newEnd < new Date() ? 'completed' : 'ongoing',
        });
      })
    );
  }

  // Playlist id -> name, from the collections the analytics screen uses for its recommended columns.
  async loadPlaylistNames(): Promise<Record<string, string>> {
    const sources: Record<string, string> = {
      series: 'seriesName',
      'recommended mix playlist': 'title',
      'solar voice playlist': 'name',
      content_urls: 'title',
    };
    const out: Record<string, string> = {};
    await Promise.all(
      Object.entries(sources).map(async ([coll, field]) => {
        const snap = await getDocs(collection(this.firestore, coll));
        for (const d of snap.docs) out[d.id] = (d.data() as Dict)[field] ?? d.id;
      })
    );
    return out;
  }

  async loadContentAnalytics(): Promise<Dict[]> {
    const snap = await getDocs(collection(this.firestore, 'content analytics'));
    return snap.docs.map((d) => d.data() as Dict);
  }

  // Broadcast in Breakthroughs (analytics' sendChatBroadcast, with its bugs fixed): for every selected
  // participant with an app account, upsert their `supportdesk` thread, add the message, and log a
  // `broadcast_participants` row. Returns how many were sent / skipped (no app account).
  async sendBroadcast(template: Dict, people: Participant[]): Promise<{ sent: number; skipped: number }> {
    const me = this.loggedInProfileId;
    const ids = [...new Set([...people.map((p) => p.profileid), me].filter(Boolean))];
    const uid: Record<string, string> = {};
    let senderEmail = '';
    for (const group of this.chunk(ids, 30)) {
      const snap = await getDocs(query(collection(this.firestore, 'profile_data'), where('profileid', 'in', group)));
      for (const d of snap.docs) {
        const data = d.data() as Dict;
        if (data['user_ref']) uid[data['profileid']] = data['user_ref'].id;
        if (data['profileid'] === me) senderEmail = data['email'] ?? '';
      }
    }
    const senderUid = uid[me] ?? null;
    const analyticsRef = doc(collection(this.firestore, 'broadcast_analytics'));
    await setDoc(analyticsRef, { docid: analyticsRef.id });

    const reachable = people.filter((p) => uid[p.profileid]);
    const personalise = (body: string, p: Participant) =>
      String(body ?? '')
        .replace(/{{name}}/g, p.name)
        .replace(/{{email}}/g, p.email)
        .replace(/{{number}}/g, p.phonenumber);

    // 3 writes per participant, well under the 500-write batch limit
    for (const group of this.chunk(reachable, 150)) {
      const batch = writeBatch(this.firestore);
      for (const p of group) {
        const userUid = uid[p.profileid];
        const deskRef = doc(this.firestore, 'supportdesk', userUid);
        const msgRef = doc(collection(this.firestore, 'supportdesk', userUid, 'messages'));
        const bapRef = doc(collection(this.firestore, 'broadcast_participants'));
        batch.set(
          deskRef,
          {
            email: p.email,
            files: template['files'] ?? [],
            last_message: template['body'],
            last_modification: new Date(),
            last_pending: ['user'],
            last_read_by: ['admin'],
            last_sender_uid: senderUid,
            uid: userUid,
          },
          { merge: true }
        );
        batch.set(msgRef, {
          files: template['files'] ?? [],
          buttonlink: template['link'] ?? null,
          buttonname: template['buttonname'] ?? null,
          message: personalise(template['body'], p),
          messageid: msgRef.id,
          pending: ['user'],
          read_by: ['admin'],
          sender_email: senderEmail,
          sender_uid: senderUid,
          time: new Date(),
        });
        batch.set(bapRef, {
          docid: bapRef.id,
          profile_id: userUid,
          profile_uid: userUid,
          date: new Date(),
          broadcast_templateid: template['docid'] ?? null,
          broadcastname: template['broadcastname'] ?? null,
        });
      }
      await batch.commit();
    }
    return { sent: reachable.length, skipped: people.length - reachable.length };
  }

  // Active + approved queue tokens (as analytics), queueId -> profile ids, split by stage: currentstage
  // 'Completed' finished the queue (as analytics' Queue Event checklist), any other stage is still live.
  async loadQueueTokens(): Promise<QueueMembers> {
    const snap = await getDocs(
      query(collection(this.firestore, 'queue_token'), where('stagestatus', '==', 'Approved'), where('tokenstatus', '==', 'Active'))
    );
    const out: QueueMembers = { completed: {}, live: {} };
    for (const d of snap.docs) {
      const data = d.data() as Dict;
      const queueId = data['queueref']?.id;
      const byQueue = data['currentstage'] === 'Completed' ? out.completed : out.live;
      if (queueId && data['profile_id']) (byQueue[queueId] ??= []).push(data['profile_id']);
    }
    return out;
  }

  // Profile ids with an approved (confirmed) request, per event. `in` takes at most 30 values.
  async loadConfirmed(eventIds: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const id of eventIds) out[id] = [];
    for (const group of this.chunk(eventIds, 30)) {
      const refs = group.map((id) => doc(this.firestore, 'event collection', id));
      const snap = await getDocs(
        query(collection(this.firestore, 'event participation request'), where('eventref', 'in', refs), where('status', '==', 'approved'))
      );
      for (const d of snap.docs) {
        const data = d.data() as Dict;
        const eventId = data['eventref']?.id;
        if (eventId && data['profileid'] && out[eventId]) out[eventId].push(data['profileid']);
      }
    }
    return out;
  }

  async renameAudience(aud: Audience, name: string): Promise<void> {
    if (aud.kind === 'filter') await updateDoc(doc(this.firestore, 'searchquery', aud.id), { label: name });
    else if (aud.kind === 'list') await updateDoc(doc(this.firestore, 'participant list', aud.id), { listname: name });
  }

  async persistNewTag(tag: Tag): Promise<void> {
    await setDoc(doc(this.firestore, 'participant tags', tag.id), {
      id: tag.id,
      name: tag.name,
      tagsfor: tag.tagsfor,
      isActive: true,
      created: new Date(),
      createdby: this.loggedInProfileId,
    });
  }

  // as analytics' tag-participants updateTagsFor
  async persistTagFor(tagId: string, tagsfor: string[]): Promise<void> {
    await updateDoc(doc(this.firestore, 'participant tags', tagId), { tagsfor });
  }

  async persistAudience(aud: Audience): Promise<void> {
    const f = aud.filter ?? emptyFilter();
    const s = f.subscription;
    // analytics reads subscriptionstart / subscriptionend as {start, end} day ranges and atccount as an exact count
    const analyticsRange = (relation: SubscriptionRelation) =>
      s.relation === relation && subscriptionActive(s) ? { start: s.from, end: s.to } : { start: null, end: null };
    const condition = (c: CountCondition) => ({ op: c.op, a: c.a, b: c.b });
    // Firestore rejects undefined, and count2 is optional
    const rules = (list: ProductCountRule[]) =>
      list.map((r) => ({ productId: r.productId, comparison: r.comparison, count: r.count, count2: r.count2 ?? null }));
    const data: Dict = {
      docid: aud.id,
      label: aud.name,
      createdby: this.loggedInProfileId,
      customerstatus: f.customerstatus,
      financialstatus: f.financialstatus,
      activejourney: f.activejourney,
      lastcompletedjourney: f.lastcompletedjourney,
      activeproduct: f.activeproduct,
      profiletags: f.profiletags,
      tier: f.tier,
      registereduser: f.registered,
      // analytics filters on these four the same way (any of the values)
      participantmode: f.participantmode,
      addons: f.addons,
      gifts: f.gifts,
      bonus: f.bonus,
      atccount: f.atcCount.op === 'exact' && conditionActive(f.atcCount) ? f.atcCount.a : null,
      subscriptionstart: analyticsRange('startBetween'),
      subscriptionend: analyticsRange('endBetween'),
      pifilter: {
        queues: f.queues,
        customersupport: f.customersupport,
        journeysegments: f.journeysegments,
        atcCount: condition(f.atcCount),
        upCount: condition(f.upCount),
        cpmCount: condition(f.cpmCount),
        upStatus: f.upStatus,
        ageMin: f.ageMin,
        ageMax: f.ageMax,
        events: f.events,
        eventStatus: f.eventStatus,
        queueStatus: f.queueStatus,
        exclude: f.exclude,
        subscription: { relation: s.relation, from: s.from, to: s.to },
        consumed: rules(f.consumed),
        unconsumed: rules(f.unconsumed),
      },
    };
    // an analytics end range this screen doesn't apply stays in place unless "End between" replaces it
    if (aud.legacySubscriptionEnd && s.relation !== 'endBetween') delete data['subscriptionend'];
    // mergeFields replaces each written field whole (a deep merge would keep stale keys inside pifilter,
    // e.g. a removed exclusion) and leaves fields only analytics writes untouched.
    await setDoc(doc(this.firestore, 'searchquery', aud.id), data, { mergeFields: Object.keys(data) });
  }

  async persistList(aud: Audience): Promise<void> {
    await setDoc(doc(this.firestore, 'participant list', aud.id), {
      docid: aud.id,
      listname: aud.name,
      profilelist: aud.profileIds ?? [],
      createddate: new Date(),
      live: false,
    });
  }
}

// ================================================================================================
// Store
// ================================================================================================

const EMPTY_REF: ReferenceData = {
  journeys: [],
  products: [],
  modes: [],
  tiers: [],
  tags: [],
  events: [],
  queues: [],
  journeySegments: [],
};

const AUDIENCE_KIND_LABEL: Record<AudienceKind, string> = { filter: 'Saved filter', list: 'List', segment: 'Segment' };

// The loaded audience and how it has been refined since, e.g. "Segment X · + 2 filters" or
// "Saved filter X · modified". refinement is null while it is used as loaded.
export interface AudienceLabel {
  kind: string;
  name: string;
  refinement: string | null;
}

const toSets = (byId: Record<string, string[]>): Record<string, Set<string>> =>
  Object.fromEntries(Object.entries(byId).map(([id, ids]) => [id, new Set(ids)]));

@Injectable()
export class ParticipantStore {
  private readonly data = inject(ParticipantDataService);

  // --- raw state ---
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly all = signal<Participant[]>([]);
  readonly reference = signal<ReferenceData>(EMPTY_REF);
  readonly filter = signal<FilterModel>(emptyFilter());
  readonly audiences = signal<Audience[]>([]);
  readonly activeAudienceId = signal<string | null>(null);

  private readonly membership = signal<Set<string> | null>(null);
  readonly signalId = signal<string | null>(null);
  readonly columnOrder = signal<string[]>([...DEFAULT_VISIBLE_COLUMNS]);
  readonly pinned = signal<Set<string>>(new Set(DEFAULT_PINNED_COLUMNS));
  readonly selectedIds = signal<Set<string>>(new Set());

  // approved (confirmed) profile ids per event, loaded on demand for the selected events
  private readonly confirmedByEvent = signal<Record<string, string[]>>({});
  readonly confirmedLoading = signal(false);
  // active + approved queue tokens split into completed / live, loaded with the page (as analytics)
  private readonly queueTokens = signal<QueueMembers>({ completed: {}, live: {} });
  // until then (or if the load fails) a queue's count is unknown, not 0
  readonly queueTokensLoaded = signal(false);
  // playlist id -> name, loaded the first time a recommended-playlist column is shown
  readonly playlistNames = signal<Record<string, string>>({});
  private playlistNamesRequested = false;

  constructor() {
    effect(() => {
      const f = this.filter();
      const events = [...f.events, ...(f.exclude.events ?? [])];
      if (f.eventStatus !== 'confirmed' || !events.length) return;
      untracked(() => this.loadConfirmed(events));
    });
    effect(() => {
      if (this.playlistNamesRequested || !this.columnOrder().some((c) => PLAYLIST_COLUMNS.includes(c))) return;
      this.playlistNamesRequested = true;
      this.data
        .loadPlaylistNames()
        .then((m) => this.playlistNames.set(m))
        .catch((e) => console.warn('playlist names load failed', e));
    });
  }

  // --- derived state ---
  private readonly confirmedSets = computed(() => toSets(this.confirmedByEvent()));
  private readonly queueSets = computed(() => {
    const tokens = this.queueTokens();
    return { completed: toSets(tokens.completed), live: toSets(tokens.live) };
  });
  private readonly segmentSets = computed(() => toSets(Object.fromEntries(this.reference().journeySegments.map((s) => [s.id, s.profileIds]))));

  private readonly filterContext = computed<FilterContext>(() => ({
    confirmedByEvent: this.confirmedSets(),
    completedByQueue: this.queueSets().completed,
    liveByQueue: this.queueSets().live,
    segmentMembers: this.segmentSets(),
  }));

  private readonly signalContext = computed<SignalContext>(() => {
    const ref = this.reference();
    return {
      productIds: new Set(ref.products.map((p) => p.id)),
      journeyIds: new Set(ref.journeys.map((j) => j.id)),
      dfuProductIds: new Set(ref.products.filter((p) => p.type === 'DFU').map((p) => p.id)),
    };
  });

  readonly filtered = computed<Participant[]>(() => {
    let result = applyFilters(this.all(), this.filter(), this.filterContext());
    const sig = this.activeSignal();
    if (sig) {
      const ref = this.signalContext();
      result = result.filter((p) => sig.predicate(p, ref));
    }
    const member = this.membership();
    if (member) result = result.filter((p) => member.has(p.profileid));
    return result;
  });

  // overview counts computed over the WHOLE base (stable, independent of the current view)
  readonly signalCounts = computed<Record<string, number>>(() => {
    const all = this.all();
    const ref = this.signalContext();
    const counts: Record<string, number> = {};
    for (const s of SIGNALS) counts[s.id] = all.reduce((n, p) => (s.predicate(p, ref) ? n + 1 : n), 0);
    return counts;
  });

  readonly attentionCount = computed<number>(() => {
    const ref = this.signalContext();
    const issues = SIGNALS.filter((s) => s.severity !== 'opportunity' && !s.breakdown);
    return this.all().reduce((n, p) => (issues.some((s) => s.predicate(p, ref)) ? n + 1 : n), 0);
  });

  // --- event / queue option counts (whole base) ---
  private readonly baseIds = computed(() => new Set(this.all().map((p) => p.profileid)));
  private readonly attendedCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const p of this.all()) for (const id of new Set(mapValues(p.productevent))) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  });
  private readonly confirmedCounts = computed(() => this.countMembers(this.confirmedSets()));
  private readonly completedQueueCounts = computed(() => this.countMembers(this.queueSets().completed));
  private readonly liveQueueCounts = computed(() => this.countMembers(this.queueSets().live));

  // Participants per event / queue option under the section's current switch (Attended / Confirmed,
  // Completed / Live). Confirmed counts exist only for events whose approved requests have been loaded.
  readonly eventCounts = computed<Record<string, number>>(() =>
    this.filter().eventStatus === 'confirmed' ? this.confirmedCounts() : this.attendedCounts()
  );
  readonly queueCounts = computed<Record<string, number>>(() =>
    this.filter().queueStatus === 'live' ? this.liveQueueCounts() : this.completedQueueCounts()
  );

  // Only ids in the loaded base count, so an option's count is what ticking it alone shows.
  private countMembers(byId: Record<string, Set<string>>): Record<string, number> {
    const base = this.baseIds();
    const counts: Record<string, number> = {};
    for (const [id, members] of Object.entries(byId)) {
      let n = 0;
      for (const pid of members) if (base.has(pid)) n++;
      counts[id] = n;
    }
    return counts;
  }

  readonly activeSignal = computed<SignalDef | null>(() => {
    const id = this.signalId();
    return id ? SIGNAL_MAP[id] ?? null : null;
  });

  // live member count per audience over the loaded participants; null = not countable yet: a saved
  // filter on Confirmed events whose approved requests only load once it is applied
  readonly audienceCounts = computed<Record<string, number | null>>(() => {
    const loaded = this.confirmedByEvent();
    const counts: Record<string, number | null> = {};
    for (const a of this.audiences()) {
      const f = a.kind === 'filter' ? a.filter : undefined;
      const pending = f?.eventStatus === 'confirmed' && [...f.events, ...(f.exclude.events ?? [])].some((id) => !(id in loaded));
      counts[a.id] = pending ? null : this.resolveAudienceIds(a).size;
    }
    return counts;
  });

  readonly chips = computed<FilterChip[]>(() => deriveChips(this.filter(), this.reference()));
  readonly activeFilterCount = computed(() => this.chips().length);
  readonly filterTouched = computed(() => filterTouched(this.filter()));

  // --- loaded audience (list / segment / saved filter) and its refinement ---
  readonly activeAudience = computed<Audience | null>(() => this.audiences().find((a) => a.id === this.activeAudienceId()) ?? null);
  // list / segment: how many filters were added on top of it
  readonly audienceExtraFilters = computed(() => {
    const aud = this.activeAudience();
    return aud && aud.kind !== 'filter' ? this.activeFilterCount() : 0;
  });
  // saved filter: the current filter no longer matches what was saved
  readonly audienceModified = computed(() => {
    const aud = this.activeAudience();
    return aud?.kind === 'filter' && !!aud.filter && filterSignature(aud.filter) !== filterSignature(this.filter());
  });
  readonly audienceLabel = computed<AudienceLabel | null>(() => {
    const aud = this.activeAudience();
    if (!aud) return null;
    const extra = this.audienceExtraFilters();
    const refinement = aud.kind === 'filter' ? (this.audienceModified() ? 'modified' : null) : extra ? `+ ${extra} filter${extra === 1 ? '' : 's'}` : null;
    return { kind: AUDIENCE_KIND_LABEL[aud.kind], name: aud.name, refinement };
  });

  readonly totalCount = computed(() => this.all().length);
  readonly filteredCount = computed(() => this.filtered().length);

  readonly selectedParticipants = computed<Participant[]>(() => {
    const ids = this.selectedIds();
    return this.filtered().filter((p) => ids.has(p.profileid));
  });

  // Scope is filtered ∩ selected EVERYWHERE — count, bar, and every bulk action — so a tag/remark/extend
  // can never silently hit rows hidden by the current filter/search/signal.
  readonly selectedCount = computed(() => this.selectedParticipants().length);
  private selectedProfileIds(): string[] {
    return this.selectedParticipants().map((p) => p.profileid);
  }
  readonly hiddenSelectedCount = computed(() => this.selectedIds().size - this.selectedParticipants().length);

  readonly displayedColumns = computed<string[]>(() => {
    const order = this.columnOrder();
    const pin = this.pinned();
    const pinnedCols = order.filter((c) => pin.has(c));
    const rest = order.filter((c) => !pin.has(c));
    return ['select', ...pinnedCols, ...rest];
  });

  readonly availableColumns = computed(() => {
    const current = new Set(this.columnOrder());
    return Object.values(COLUMN_DEF_MAP)
      .filter((c) => !current.has(c.key))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly allFilteredSelected = computed(() => {
    const f = this.filtered();
    if (!f.length) return false;
    const ids = this.selectedIds();
    return f.every((p) => ids.has(p.profileid));
  });

  // --- lifecycle ---
  init(): void {
    this.loading.set(true);
    this.loadError.set(false);
    // the table only needs participants + reference names; audiences load alongside
    forkJoin({
      reference: this.data.getReferenceData(),
      participants: this.data.getParticipants(),
    }).subscribe({
      next: ({ reference, participants }) => {
        this.reference.set(reference);
        this.all.set(participants);
        this.loading.set(false);
      },
      error: (e) => {
        console.error('Participant Intelligence load failed', e);
        this.loadError.set(true);
        this.loading.set(false);
      },
    });

    this.confirmedByEvent.set({});
    this.queueTokensLoaded.set(false);
    this.data
      .loadQueueTokens()
      .then((m) => {
        this.queueTokens.set(m);
        this.queueTokensLoaded.set(true);
      })
      .catch((e) => console.warn('queue token load failed', e));

    this.data.getAudiences().subscribe({
      next: (a) => this.audiences.set(a),
      error: (e) => console.warn('audiences load failed', e),
    });
  }

  // --- filtering ---
  // A loaded list / segment / saved filter stays loaded: new filters refine it (see audienceLabel).
  patchFilter(patch: Partial<FilterModel>): void {
    this.filter.update((f) => ({ ...f, ...patch }));
  }

  setSearch(term: string): void {
    this.filter.update((f) => ({ ...f, search: term }));
  }

  // Reset / Clear all: filters, the insight card and the loaded list / segment / saved filter.
  clearFilter(): void {
    this.filter.set(emptyFilter());
    this.membership.set(null);
    this.activeAudienceId.set(null);
    this.signalId.set(null);
  }

  // --- intelligence signals ---
  // Clicking the active card again turns it off; another card starts a fresh view with only that insight.
  applySignal(id: string): void {
    if (this.signalId() === id) {
      this.signalId.set(null);
      return;
    }
    this.filter.set(emptyFilter());
    this.membership.set(null);
    this.activeAudienceId.set(null);
    this.signalId.set(id);
    this.clearSelection();
  }

  clearSignal(): void {
    this.signalId.set(null);
  }

  removeChip(chip: FilterChip): void {
    this.filter.update((f) => {
      const next: FilterModel = structuredClone(f);
      const g = chip.group;
      if (g === 'atcCount' || g === 'upCount' || g === 'cpmCount') next[g] = emptyCondition();
      else if (g === 'ageMin') {
        next.ageMin = null;
        next.ageMax = null;
      } else if (g === 'subscription') next.subscription = { ...next.subscription, from: null, to: null };
      else if (g === 'consumed' || g === 'unconsumed') next[g] = next[g].filter((_, i) => String(i) !== chip.value);
      else if (chip.exclude) {
        const cg = g as CheckGroup;
        next.exclude = { ...next.exclude, [cg]: (next.exclude[cg] ?? []).filter((v) => v !== chip.value) };
      } else {
        const rec = next as unknown as Record<string, string[]>;
        rec[g as string] = (rec[g as string] ?? []).filter((v) => v !== chip.value);
      }
      return next;
    });
  }

  // Drops the loaded list / segment / saved filter but keeps the filters currently applied.
  removeAudience(): void {
    this.membership.set(null);
    this.activeAudienceId.set(null);
  }

  // --- selection ---
  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleOne(id: string): void {
    this.selectedIds.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleAllFiltered(checked: boolean): void {
    const ids = this.filtered().map((p) => p.profileid);
    this.selectedIds.update((s) => {
      const next = new Set(s);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  // --- columns ---
  addColumn(key: string): void {
    if (this.columnOrder().includes(key)) return;
    this.columnOrder.update((o) => [...o, key]);
  }

  removeColumn(key: string): void {
    if (key === 'name') return;
    this.columnOrder.update((o) => o.filter((c) => c !== key));
    this.pinned.update((p) => {
      const next = new Set(p);
      next.delete(key);
      return next;
    });
  }

  togglePin(key: string): void {
    this.pinned.update((p) => {
      const next = new Set(p);
      next.has(key) ? next.delete(key) : next.add(key);
      next.add('name');
      return next;
    });
  }

  moveColumn(key: string, dir: -1 | 1): void {
    this.columnOrder.update((o) => {
      const arr = [...o];
      const i = arr.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  // "View recommended": show / hide the three recommended-playlist columns (as analytics)
  toggleRecommendedColumns(): void {
    const shown = PLAYLIST_COLUMNS.every((c) => this.columnOrder().includes(c));
    this.columnOrder.update((o) => (shown ? o.filter((c) => !PLAYLIST_COLUMNS.includes(c)) : [...o, ...PLAYLIST_COLUMNS.filter((c) => !o.includes(c))]));
  }

  resetColumns(): void {
    this.columnOrder.set([...DEFAULT_VISIBLE_COLUMNS]);
    this.pinned.set(new Set(DEFAULT_PINNED_COLUMNS));
  }

  // --- audiences ---
  loadAudience(id: string): void {
    const aud = this.audiences().find((a) => a.id === id);
    if (!aud) return;
    this.activeAudienceId.set(id);
    if (aud.kind === 'filter' && aud.filter) {
      this.filter.set(structuredClone(aud.filter));
      this.membership.set(null);
    } else {
      this.filter.set(emptyFilter());
      this.membership.set(this.resolveAudienceIds(aud));
    }
    this.clearSelection();
  }

  // Names are unique within their own kind (case-insensitive, trimmed).
  nameTaken(kind: AudienceKind, name: string, exceptId: string | null = null): boolean {
    const key = name.trim().toLowerCase();
    return this.audiences().some((a) => a.kind === kind && a.id !== exceptId && a.name.trim().toLowerCase() === key);
  }

  saveCurrentAsAudience(name: string): Audience {
    const aud: Audience = {
      id: `aud-${Date.now()}`,
      name: name.trim(),
      kind: 'filter',
      isDefault: false,
      createdBy: 'You',
      createdDate: new Date().toISOString(),
      filter: structuredClone(this.filter()),
    };
    this.audiences.update((list) => [...list, aud]);
    this.activateSavedFilter(aud.id);
    this.data.persistAudience(aud).catch((e) => console.error('persistAudience failed', e));
    return aud;
  }

  saveSelectionAsList(name: string): Audience {
    const ids = this.selectedProfileIds();
    const aud: Audience = {
      id: `aud-${Date.now()}`,
      name: name.trim(),
      kind: 'list',
      isDefault: false,
      createdBy: 'You',
      createdDate: new Date().toISOString(),
      live: false,
      profileIds: ids,
    };
    this.audiences.update((list) => [...list, aud]);
    this.data.persistList(aud).catch((e) => console.error('persistList failed', e));
    return aud;
  }

  renameAudience(id: string, name: string): void {
    const aud = this.audiences().find((a) => a.id === id);
    if (!aud) return;
    this.audiences.update((list) => list.map((a) => (a.id === id ? { ...a, name: name.trim() } : a)));
    this.data.renameAudience(aud, name.trim()).catch((e) => console.error('renameAudience failed', e));
  }

  // Overwrites a saved filter with the current filter model.
  updateAudienceFilter(id: string): void {
    const aud = this.audiences().find((a) => a.id === id && a.kind === 'filter');
    if (!aud) return;
    const filter = structuredClone(this.filter());
    // saving "End between" writes its own end range over the analytics one
    const legacySubscriptionEnd = filter.subscription.relation === 'endBetween' ? undefined : aud.legacySubscriptionEnd;
    const updated: Audience = { ...aud, filter, legacySubscriptionEnd };
    this.audiences.update((list) => list.map((a) => (a.id === id ? updated : a)));
    this.activateSavedFilter(id);
    this.data.persistAudience(updated).catch((e) => console.error('persistAudience failed', e));
  }

  // A saved filter holds no list / segment membership, so it only becomes the loaded audience when
  // none is loaded; otherwise the label would hide the membership that still narrows the rows.
  private activateSavedFilter(id: string): void {
    if (!this.membership()) this.activeAudienceId.set(id);
  }

  deleteAudience(id: string): void {
    this.audiences.update((list) => list.filter((a) => a.id !== id));
    if (this.activeAudienceId() === id) this.removeAudience();
  }

  setDefaultAudience(id: string): void {
    this.audiences.update((list) => list.map((a) => ({ ...a, isDefault: a.id === id })));
  }

  toggleListLive(id: string): void {
    this.audiences.update((list) => list.map((a) => (a.id === id ? { ...a, live: !a.live } : a)));
  }

  private resolveAudienceIds(aud: Audience): Set<string> {
    if (aud.kind === 'filter' && aud.filter) {
      return new Set(applyFilters(this.all(), aud.filter, this.filterContext()).map((p) => p.profileid));
    }
    if (aud.kind === 'list') {
      return new Set(aud.profileIds ?? []);
    }
    // segment = union of members
    const out = new Set<string>();
    for (const memberId of aud.memberAudienceIds ?? []) {
      const member = this.audiences().find((a) => a.id === memberId);
      if (member) this.resolveAudienceIds(member).forEach((id) => out.add(id));
    }
    return out;
  }

  private async loadConfirmed(eventIds: string[]): Promise<void> {
    const missing = eventIds.filter((id) => !(id in this.confirmedByEvent()));
    if (!missing.length) return;
    this.confirmedLoading.set(true);
    try {
      const loaded = await this.data.loadConfirmed(missing);
      this.confirmedByEvent.update((c) => ({ ...c, ...loaded }));
    } catch (e) {
      console.error('loading confirmed event requests failed', e);
    } finally {
      this.confirmedLoading.set(false);
    }
  }

  // --- bulk mutations (optimistic local update + persisted via the data service) ---
  // Scope = filtered ∩ selected (selectedProfileIds), so hidden rows are never silently mutated.
  addRemarkToSelected(note: string, givenby = 'You'): void {
    const idList = this.selectedProfileIds();
    const ids = new Set(idList);
    const remark: Remark = { date: new Date().toISOString(), note, givenby };
    this.all.update((list) => list.map((p) => (ids.has(p.profileid) ? { ...p, remarks: [...p.remarks, remark] } : p)));
    this.data.persistRemark(idList, remark).catch((e) => console.error('persistRemark failed', e));
  }

  addTagsToSelected(tagIds: string[]): void {
    const idList = this.selectedProfileIds();
    const ids = new Set(idList);
    this.all.update((list) =>
      list.map((p) =>
        ids.has(p.profileid) ? { ...p, profiletags: Array.from(new Set([...p.profiletags, ...tagIds])) } : p
      )
    );
    this.data.persistTags(idList, tagIds, 'add').catch((e) => console.error('persistTags(add) failed', e));
  }

  removeTagsFromSelected(tagIds: string[]): void {
    const idList = this.selectedProfileIds();
    const ids = new Set(idList);
    this.all.update((list) =>
      list.map((p) => (ids.has(p.profileid) ? { ...p, profiletags: p.profiletags.filter((t) => !tagIds.includes(t)) } : p))
    );
    this.data.persistTags(idList, tagIds, 'remove').catch((e) => console.error('persistTags(remove) failed', e));
  }

  // Only participants with a subscription purchase (active / non active) can be extended.
  // Returns how many were extended.
  extendSubscriptionForSelected(ext: SubscriptionExtension): number {
    const targets = this.selectedParticipants().filter((p) => p.subscriptionPurchaseId);
    const ids = new Set(targets.map((p) => p.profileid));
    this.all.update((list) =>
      list.map((p) => {
        if (!ids.has(p.profileid)) return p;
        const end = extendedEnd(p.subscriptionend, ext).toISOString();
        return { ...p, subscriptionend: end, ...(p.isLastSubscription ? { lastSubscriptionEnd: end } : { currentSubscriptionEnd: end }) };
      })
    );
    this.data
      .extendSubscriptions(targets.map((p) => p.subscriptionPurchaseId as string), ext)
      .catch((e) => console.error('extendSubscriptions failed', e));
    return targets.length;
  }

  createTag(name: string, tagsfor: string[]): Tag {
    const tag: Tag = { id: `tg-${Date.now()}`, name, tagsfor, isActive: true };
    this.reference.update((r) => ({ ...r, tags: [...r.tags, tag] }));
    this.data.persistNewTag(tag).catch((e) => console.error('persistNewTag failed', e));
    return tag;
  }

  setTagFor(tagId: string, tagsfor: string[]): void {
    this.reference.update((r) => ({ ...r, tags: r.tags.map((t) => (t.id === tagId ? { ...t, tagsfor } : t)) }));
    this.data.persistTagFor(tagId, tagsfor).catch((e) => console.error('persistTagFor failed', e));
  }
}

// ================================================================================================
// Dialog: prompt
// ================================================================================================

export interface PromptData {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  confirmText?: string;
  icon?: string;
  value?: string;
  // returns an error message to block saving (e.g. a duplicate name), or null
  validate?: (value: string) => string | null;
}

@Component({
  selector: 'app-prompt-dialog',
  imports: [FormsModule],
  styles: `
    .dlg-error {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      color: var(--pi-status-banned);
    }
  `,
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">{{ data.icon || 'bookmark_add' }}</span></span>
        <div>
          <h2>{{ data.title }}</h2>
          @if (data.subtitle) {
            <p>{{ data.subtitle }}</p>
          }
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="dlg-body">
        <div class="dlg-field">
          <label class="dlg-label">{{ data.label }}</label>
          <input
            class="dlg-input"
            [(ngModel)]="value"
            [placeholder]="data.placeholder || ''"
            (keyup.enter)="confirm()"
            autofocus
          />
          @if (error()) {
            <span class="dlg-error">{{ error() }}</span>
          }
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!!error() || value.trim().length < 2" (click)="confirm()">
          {{ data.confirmText || 'Save' }}
        </button>
      </div>
    </div>
  `,
})
export class PromptDialogComponent {
  readonly ref = inject(MatDialogRef<PromptDialogComponent>);
  readonly data = inject<PromptData>(MAT_DIALOG_DATA);
  value = this.data.value ?? '';

  error(): string | null {
    const v = this.value.trim();
    return v.length >= 2 ? this.data.validate?.(v) ?? null : null;
  }

  confirm(): void {
    const v = this.value.trim();
    if (v.length >= 2 && !this.error()) this.ref.close(v);
  }
}

// ================================================================================================
// Dialog: remarks
// ================================================================================================

export interface RemarksData {
  count: number;
}

@Component({
  selector: 'app-remarks-dialog',
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">sticky_note_2</span></span>
        <div>
          <h2>Add remark</h2>
          <p>Applies to {{ data.count }} selected participant{{ data.count === 1 ? '' : 's' }}.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="dlg-body">
        <div class="dlg-field">
          <label class="dlg-label">Remark</label>
          <textarea class="dlg-textarea" [(ngModel)]="note" placeholder="Write a note that will be added to each participant's timeline…" autofocus></textarea>
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="note.trim().length < 2" (click)="ref.close(note.trim())">
          <span class="material-symbols-rounded">check</span> Add to {{ data.count }}
        </button>
      </div>
    </div>
  `,
})
export class RemarksDialogComponent {
  readonly ref = inject(MatDialogRef<RemarksDialogComponent>);
  readonly data = inject<RemarksData>(MAT_DIALOG_DATA);
  note = '';
}

// ================================================================================================
// Dialog: tag manager
// ================================================================================================

// What a tag is used for (participant tags.tagsfor), the same four options as analytics' tag-participants
const TAG_FOR_OPTIONS = ['live event', 'queue event', 'video ask', 'journey coach'];

@Component({
  selector: 'app-tag-manager-dialog',
  imports: [FormsModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">sell</span></span>
        <div>
          <h2>Manage tags</h2>
          <p>{{ data.count }} participant{{ data.count === 1 ? '' : 's' }} selected.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <label class="dlg-label">Select tags</label>
        <div class="taglist">
          @for (t of store.reference().tags; track t.id) {
            <div class="tagrow" [class.on]="picked().has(t.id)">
              <button class="tagpick" [attr.aria-pressed]="picked().has(t.id)" (click)="toggle(t.id)">
                <span class="material-symbols-rounded box">{{ picked().has(t.id) ? 'check_box' : 'check_box_outline_blank' }}</span>
                <span class="tname">{{ t.name }}</span>
              </button>
              <span class="forbadges">
                @for (f of t.tagsfor; track f) {
                  <span class="forbadge">{{ f }}</span>
                } @empty {
                  <span class="forbadge none">no “tag for”</span>
                }
              </span>
              <button
                data-testid="pi-tag-edit-for"
                class="edit"
                [class.on]="editing() === t.id"
                [attr.aria-expanded]="editing() === t.id"
                matTooltip="Edit what this tag is for"
                (click)="editing.set(editing() === t.id ? null : t.id)"
              >
                <span class="material-symbols-rounded">edit</span>
              </button>
            </div>
            @if (editing() === t.id) {
              <div class="tagedit">
                <span class="for-lbl">Tag for</span>
                @for (o of tagForOptions; track o) {
                  <!-- a tag keeps at least one "tag for", so its last one can't be switched off -->
                  <button
                    data-testid="pi-tag-edit-option"
                    class="forchip"
                    [class.on]="t.tagsfor.includes(o)"
                    [attr.aria-pressed]="t.tagsfor.includes(o)"
                    [disabled]="t.tagsfor.length === 1 && t.tagsfor.includes(o)"
                    (click)="toggleTagFor(t, o)"
                  >
                    {{ o }}
                  </button>
                }
              </div>
            }
          } @empty {
            <div class="none">No tags yet. Create one below.</div>
          }
        </div>

        <div class="create">
          <label class="dlg-label">Create a new tag</label>
          <input class="dlg-input" [(ngModel)]="newTag" placeholder="Tag name" (keyup.enter)="create()" />
          <div class="for-row">
            <span class="for-lbl">Tag for</span>
            @for (o of tagForOptions; track o) {
              <button data-testid="pi-tag-for" class="forchip" [class.on]="newFor().has(o)" [attr.aria-pressed]="newFor().has(o)" (click)="toggleNewFor(o)">
                {{ o }}
              </button>
            }
          </div>
          <div class="create-foot">
            <span class="hint" [class.err]="nameTaken()">{{ createHint() }}</span>
            <button data-testid="pi-tag-create" class="btn btn-primary" [disabled]="!canCreate()" (click)="create()">
              <span class="material-symbols-rounded">add</span> Create tag
            </button>
          </div>
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn btn-danger spacer" [disabled]="picked().size === 0" (click)="apply('remove')">
          <span class="material-symbols-rounded">label_off</span> Remove from {{ data.count }}
        </button>
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="picked().size === 0" (click)="apply('add')">
          <span class="material-symbols-rounded">check</span> Assign to {{ data.count }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .taglist {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 22px;
      padding: 4px;
      border: 1px solid var(--pi-border);
      border-radius: 10px;
    }
    .tagrow {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 4px 2px 2px;
      border-radius: 8px;
    }
    .tagrow:hover {
      background: var(--pi-surface-2);
    }
    .tagrow.on {
      background: var(--pi-accent-bg);
    }
    .tagpick {
      flex: 1;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: none;
      background: none;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--pi-text);
      padding: 6px;
      cursor: pointer;
      text-align: left;
    }
    .tagpick .box {
      font-size: 19px;
      color: var(--pi-text-3);
    }
    .tagrow.on .box {
      color: var(--pi-accent);
    }
    .tname {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .forbadges {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 4px;
      max-width: 55%;
    }
    .forbadge {
      font-size: 11px;
      font-weight: 600;
      color: var(--pi-text-2);
      background: var(--pi-fill);
      padding: 2px 7px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .forbadge.none {
      background: none;
      color: var(--pi-text-3);
      font-weight: 500;
    }
    .edit {
      flex-shrink: 0;
      display: inline-flex;
      border: none;
      background: none;
      color: var(--pi-text-3);
      padding: 4px;
      border-radius: 6px;
      cursor: pointer;
    }
    .edit:hover,
    .edit.on {
      color: var(--pi-accent);
      background: var(--pi-surface-3);
    }
    .edit .material-symbols-rounded {
      font-size: 17px;
    }
    .tagedit {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 8px 10px 36px;
    }
    .for-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
    }
    .for-lbl {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--pi-text-2);
      margin-right: 2px;
    }
    .forchip {
      border: 1px solid var(--pi-border-strong);
      background: #fff;
      color: var(--pi-text);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 500;
      padding: 5px 11px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .forchip:hover:not(:disabled) {
      border-color: var(--pi-accent);
    }
    .forchip.on {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
      color: #fff;
    }
    .forchip:disabled {
      cursor: default;
      opacity: 0.7;
    }
    .none {
      padding: 10px;
      font-size: 12.5px;
      color: var(--pi-text-3);
    }
    .create {
      border-top: 1px solid var(--pi-border);
      padding-top: 16px;
    }
    .create-foot {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
    }
    .hint {
      flex: 1;
      font-size: 12px;
      color: var(--pi-text-3);
    }
    .hint.err {
      color: var(--pi-status-banned);
    }
    .create-foot .btn {
      flex-shrink: 0;
    }
  `,
})
export class TagManagerDialogComponent {
  readonly ref = inject(MatDialogRef<TagManagerDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);
  readonly store = inject(ParticipantStore);
  private readonly snack = inject(MatSnackBar);

  readonly tagForOptions = TAG_FOR_OPTIONS;
  readonly picked = signal<Set<string>>(new Set());
  // the tag whose "tag for" is being edited
  readonly editing = signal<string | null>(null);
  readonly newFor = signal<Set<string>>(new Set());
  newTag = '';

  toggle(id: string): void {
    this.picked.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleNewFor(option: string): void {
    this.newFor.update((s) => {
      const next = new Set(s);
      next.has(option) ? next.delete(option) : next.add(option);
      return next;
    });
  }

  toggleTagFor(tag: Tag, option: string): void {
    const next = tag.tagsfor.includes(option) ? tag.tagsfor.filter((f) => f !== option) : [...tag.tagsfor, option];
    if (next.length) this.store.setTagFor(tag.id, next);
  }

  nameTaken(): boolean {
    const key = this.newTag.trim().toLowerCase();
    return !!key && this.store.reference().tags.some((t) => t.name.trim().toLowerCase() === key);
  }

  canCreate(): boolean {
    return this.newTag.trim().length >= 2 && this.newFor().size > 0 && !this.nameTaken();
  }

  // asks only for what is still missing
  createHint(): string {
    if (this.nameTaken()) return `A tag named “${this.newTag.trim()}” already exists.`;
    const needName = this.newTag.trim().length < 2;
    const needFor = !this.newFor().size;
    if (needName && needFor) return 'Name it (2+ characters) and pick at least one “Tag for”.';
    if (needName) return 'Name it (2+ characters).';
    return needFor ? 'Pick at least one “Tag for”.' : '';
  }

  create(): void {
    if (!this.canCreate()) return;
    // kept in the options' order, whatever order they were clicked in
    const tagsfor = TAG_FOR_OPTIONS.filter((o) => this.newFor().has(o));
    const tag = this.store.createTag(this.newTag.trim(), tagsfor);
    this.toggle(tag.id);
    this.newTag = '';
    this.newFor.set(new Set());
  }

  apply(mode: 'add' | 'remove'): void {
    const ids = [...this.picked()];
    if (mode === 'add') this.store.addTagsToSelected(ids);
    else this.store.removeTagsFromSelected(ids);
    this.snack.open(`${mode === 'add' ? 'Assigned' : 'Removed'} ${ids.length} tag(s) on ${this.data.count} participants`, 'Dismiss', { duration: 3000 });
    this.ref.close(true);
  }
}

// ================================================================================================
// Dialog: extend subscription
// ================================================================================================

export interface SubscriptionExtension {
  type: 'duration' | 'date';
  months: number;
  date: string; // yyyy-mm-dd, when type === 'date'
  reason: string;
}

// duration: add months to the participant's current end date; date: that day, end of day.
function extendedEnd(currentEndIso: string | null, ext: SubscriptionExtension): Date {
  if (ext.type === 'date') {
    const d = new Date(ext.date);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const d = currentEndIso ? new Date(currentEndIso) : new Date();
  d.setMonth(d.getMonth() + ext.months);
  return d;
}

@Component({
  selector: 'app-subscription-dialog',
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">event_repeat</span></span>
        <div>
          <h2>Extend subscription</h2>
          <p>{{ data.count }} participant{{ data.count === 1 ? '' : 's' }} selected.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <div class="dlg-field">
          <label class="dlg-label">Extend by</label>
          <div class="seg">
            <button [class.on]="mode() === 'duration'" (click)="mode.set('duration')">Duration</button>
            <button [class.on]="mode() === 'date'" (click)="mode.set('date')">Fixed date</button>
          </div>
        </div>

        @if (mode() === 'duration') {
          <div class="dlg-field">
            <label class="dlg-label">Months to add to each participant's current end date</label>
            <input class="dlg-input" type="number" min="1" [(ngModel)]="months" />
          </div>
        } @else {
          <div class="dlg-field">
            <label class="dlg-label">New end date</label>
            <input class="dlg-input" type="date" [(ngModel)]="date" />
          </div>
        }

        <div class="dlg-field">
          <label class="dlg-label">Reason</label>
          <input class="dlg-input" [(ngModel)]="reason" placeholder="e.g. goodwill extension, payment delay" />
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!valid()" (click)="confirm()">
          <span class="material-symbols-rounded">check</span> Extend {{ data.count }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .seg {
      display: inline-flex;
      border: 1px solid var(--pi-border-strong);
      border-radius: 9px;
      overflow: hidden;
    }
    .seg button {
      border: none;
      background: #fff;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--pi-text-2);
      padding: 9px 18px;
      cursor: pointer;
    }
    .seg button.on {
      background: var(--pi-accent);
      color: #fff;
    }
  `,
})
export class SubscriptionDialogComponent {
  readonly ref = inject(MatDialogRef<SubscriptionDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);

  readonly mode = signal<'duration' | 'date'>('duration');
  months = 3;
  date = '';
  reason = '';

  valid(): boolean {
    if (this.reason.trim().length < 2) return false;
    return this.mode() === 'duration' ? Number.isInteger(Number(this.months)) && this.months > 0 : !!this.date;
  }

  confirm(): void {
    const result: SubscriptionExtension = {
      type: this.mode(),
      months: Number(this.months),
      date: this.date,
      reason: this.reason.trim(),
    };
    this.ref.close(result);
  }
}

// ================================================================================================
// Dialog: manage audiences
// ================================================================================================

export interface ManageAudiencesData {
  tab: AudienceKind; // the tab it opens on
}

@Component({
  selector: 'app-manage-audiences-dialog',
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">tune</span></span>
        <div>
          <h2>Manage audiences</h2>
          <p>Saved filters, lists and segments.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <div class="tabs">
          @for (k of kinds; track k.key) {
            <button data-testid="pi-manage-tab" class="tab" [class.on]="tab() === k.key" (click)="tab.set(k.key)">
              {{ k.label }} <span class="tab-count">{{ ofKind(k.key).length }}</span>
            </button>
          }
        </div>
        <table class="aud-table">
          <thead>
            <tr>
              <th>Name</th>
              <th class="num">Members</th>
              <th>Created by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (a of ofKind(tab()); track a.id) {
              <tr>
                <td>
                  <button class="link" (click)="load(a.id)">{{ a.name }}</button>
                  @if (a.live) {
                    <span class="pi-badge live">Live</span>
                  }
                </td>
                <td class="num">{{ store.audienceCounts()[a.id] ?? '—' }}</td>
                <td class="by">{{ a.createdBy }}</td>
                <td class="row-actions">
                  @if (a.kind !== 'segment') {
                    <button data-testid="pi-manage-rename" class="ic" matTooltip="Rename" (click)="rename(a)">
                      <span class="material-symbols-rounded">edit</span>
                    </button>
                  }
                  @if (a.kind === 'filter') {
                    <button data-testid="pi-manage-update" class="ic" matTooltip="Update with current filters" (click)="updateFilter(a)">
                      <span class="material-symbols-rounded">save_as</span>
                    </button>
                  }
                  <button class="ic" [class.on]="a.isDefault" matTooltip="Set as default" (click)="store.setDefaultAudience(a.id)">
                    <span class="material-symbols-rounded">star</span>
                  </button>
                  @if (a.kind === 'list') {
                    <button class="ic" [class.on]="a.live" matTooltip="Toggle live" (click)="store.toggleListLive(a.id)">
                      <span class="material-symbols-rounded">{{ a.live ? 'toggle_on' : 'toggle_off' }}</span>
                    </button>
                  }
                  <button class="ic del" matTooltip="Delete" (click)="store.deleteAudience(a.id)">
                    <span class="material-symbols-rounded">delete</span>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (ofKind(tab()).length === 0) {
          <div class="empty">No {{ tabLabel().toLowerCase() }} yet.</div>
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-primary" (click)="ref.close()">Done</button>
      </div>
    </div>
  `,
  styles: `
    .aud-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
    }
    th {
      text-align: left;
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--pi-text-3);
      padding: 0 12px 8px;
      border-bottom: 1px solid var(--pi-border);
    }
    th.num {
      text-align: right;
    }
    td {
      padding: 11px 12px;
      border-bottom: 1px solid #eef1f4;
      vertical-align: middle;
    }
    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    td.by {
      color: var(--pi-text-2);
    }
    .link {
      border: none;
      background: none;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--pi-text);
      cursor: pointer;
      padding: 0;
    }
    .link:hover {
      color: var(--pi-accent);
    }
    .pi-badge {
      display: inline-flex;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      padding: 4px 9px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .pi-badge.live {
      background: var(--pi-status-active-bg);
      color: var(--pi-status-active);
      margin-left: 8px;
    }
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 14px;
    }
    .tab {
      border: none;
      background: none;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--pi-text-2);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
    }
    .tab.on {
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
    }
    .tab-count {
      font-size: 11.5px;
      color: var(--pi-text-3);
      margin-left: 2px;
    }
    .row-actions {
      display: flex;
      justify-content: flex-end;
      gap: 2px;
    }
    .ic {
      border: none;
      background: none;
      color: var(--pi-text-3);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: inline-flex;
    }
    .ic:hover {
      background: var(--pi-surface-3);
      color: var(--pi-text);
    }
    .ic.on {
      color: #d8a200;
    }
    .ic.del:hover {
      color: var(--pi-status-banned);
    }
    .ic .material-symbols-rounded {
      font-size: 19px;
    }
    .empty {
      text-align: center;
      color: var(--pi-text-3);
      padding: 30px;
      font-size: 13.5px;
    }
  `,
})
export class ManageAudiencesDialogComponent {
  readonly ref = inject(MatDialogRef<ManageAudiencesDialogComponent>);
  private readonly data = inject<ManageAudiencesData | null>(MAT_DIALOG_DATA);
  readonly store = inject(ParticipantStore);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly snack = inject(MatSnackBar);

  readonly kinds: { key: AudienceKind; label: string }[] = [
    { key: 'filter', label: 'Saved filters' },
    { key: 'list', label: 'Lists' },
    { key: 'segment', label: 'Segments' },
  ];
  readonly tab = signal<AudienceKind>(this.data?.tab ?? 'filter');
  readonly tabLabel = computed(() => this.kinds.find((k) => k.key === this.tab())?.label ?? '');

  ofKind(kind: AudienceKind): Audience[] {
    return this.store.audiences().filter((a) => a.kind === kind);
  }

  rename(a: Audience): void {
    const noun = a.kind === 'filter' ? 'saved filter' : 'list';
    this.dialog
      .open(PromptDialogComponent, {
        panelClass: 'pi-dialog',
        width: '440px',
        injector: this.injector,
        data: {
          title: `Rename ${noun}`,
          label: 'Name',
          value: a.name,
          confirmText: 'Rename',
          icon: 'edit',
          validate: (v: string) => (this.store.nameTaken(a.kind, v, a.id) ? `A ${noun} named “${v}” already exists.` : null),
        } as PromptData,
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (name && name !== a.name) this.store.renameAudience(a.id, name);
      });
  }

  updateFilter(a: Audience): void {
    this.store.updateAudienceFilter(a.id);
    this.snack.open(`Updated "${a.name}" with the current filters`, 'Dismiss', { duration: 3000 });
  }

  load(id: string): void {
    this.store.loadAudience(id);
    this.ref.close();
  }
}

// ================================================================================================
// Dialog: evolution summary
// ================================================================================================

export interface EvolutionRow {
  name: string;
  journey: string;
  tier: string;
  atc: number | null;
  consumed: number;
  score: number;
}

@Component({
  selector: 'app-evolution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">insights</span></span>
        <div>
          <h2>Participant evolution summary</h2>
          <p>{{ rows().length }} participants — engagement snapshot.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <table class="evo">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Journey</th>
              <th>Tier</th>
              <th class="num">ATC</th>
              <th class="num">Consumed</th>
              <th class="num">Engagement</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows().slice(0, 200); track $index) {
              <tr>
                <td>{{ r.name }}</td>
                <td>{{ r.journey }}</td>
                <td>{{ r.tier }}</td>
                <td class="num">{{ r.atc ?? '—' }}</td>
                <td class="num">{{ r.consumed }}</td>
                <td class="num">
                  <span class="score" [style.width.%]="bar(r.score)"></span>
                  <b>{{ r.score }}</b>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (rows().length > 200) {
          <p class="more">Showing first 200 of {{ rows().length }}. Export CSV for the full set.</p>
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost spacer" (click)="ref.close()">Close</button>
        <button class="btn btn-primary" (click)="exportCsv()">
          <span class="material-symbols-rounded">download</span> Export CSV
        </button>
      </div>
    </div>
  `,
  styles: `
    .evo {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--pi-text-3);
      padding: 0 12px 8px;
      border-bottom: 1px solid var(--pi-border);
      position: sticky;
      top: 0;
      background: var(--pi-surface);
    }
    th.num,
    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    td {
      padding: 9px 12px;
      border-bottom: 1px solid #eef1f4;
    }
    td.num {
      position: relative;
    }
    .score {
      position: absolute;
      left: 12px;
      bottom: 4px;
      height: 3px;
      background: var(--pi-accent);
      border-radius: 2px;
      opacity: 0.5;
    }
    .more {
      text-align: center;
      color: var(--pi-text-3);
      font-size: 12.5px;
      margin-top: 12px;
    }
  `,
})
export class EvolutionDialogComponent {
  readonly ref = inject(MatDialogRef<EvolutionDialogComponent>);
  readonly data = inject<{ participants: Participant[] }>(MAT_DIALOG_DATA);
  private readonly store = inject(ParticipantStore);

  readonly rows = computed<EvolutionRow[]>(() => {
    const jm = toNameMap(this.store.reference().journeys);
    const tm = toNameMap(this.store.reference().tiers);
    return this.data.participants
      .map((p) => ({
        name: p.name,
        journey: p.activejourney ? jm[p.activejourney] : '—',
        tier: p.tier.length ? tm[p.tier[0]] : '—',
        atc: p.atccount,
        consumed: p.consumedproducts.length,
        score: (p.atccount ?? 0) * 2 + p.consumedproducts.length * 3,
      }))
      .sort((a, b) => b.score - a.score);
  });

  bar(score: number): number {
    const max = Math.max(...this.rows().map((r) => r.score), 1);
    return Math.round((score / max) * 100);
  }

  exportCsv(): void {
    const header = ['Participant', 'Journey', 'Tier', 'ATC', 'Consumed', 'Engagement'];
    const lines = this.rows().map((r) => [r.name, r.journey, r.tier, r.atc, r.consumed, r.score].join(','));
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'participant-evolution-summary.csv');
  }
}

// ================================================================================================
// Dialog: checklist viewer
// ================================================================================================

@Component({
  selector: 'app-checklist-viewer-dialog',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">checklist</span></span>
        <div>
          <h2>{{ data.def.label }}</h2>
          <p>{{ data.def.description }}</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        @if (!data.def.wired) {
          <div class="notwired">
            <span class="material-symbols-rounded">cloud_off</span>
            <p>{{ data.def.note }}</p>
          </div>
        } @else if (data.participants.length === 0) {
          <div class="notwired">
            <span class="material-symbols-rounded">task_alt</span>
            <p>Nothing to reconcile — no participants match this checklist.</p>
          </div>
        } @else {
          <div class="cnt">{{ data.participants.length }} participant{{ data.participants.length === 1 ? '' : 's' }} to review</div>
          <table class="cl">
            @if (data.def.watson) {
              <thead><tr><th>Participant</th><th>Watson status</th><th>Subscription</th><th class="num">Balance</th><th></th></tr></thead>
              <tbody>
                @for (p of data.participants.slice(0, 250); track p.profileid) {
                  <tr>
                    <td><div class="nm">{{ p.name }}</div><div class="em">{{ p.email }}</div></td>
                    <td>{{ label(p.financialstatus) }}</td>
                    <td>{{ label(p.customerstatus) }}</td>
                    <td class="num">{{ p.balance == null ? '—' : (p.balance | number) }}</td>
                    <td class="act">
                      <!-- review only: statuses are corrected on the profile, never from this list -->
                      <a data-testid="pi-watson-view-profile" class="vp" [href]="'/userprofile/' + p.profileid" target="_blank" rel="noopener">
                        View profile <span class="material-symbols-rounded">open_in_new</span>
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            } @else {
              <thead><tr><th>Participant</th><th>Status</th><th>Journey</th><th>Products</th></tr></thead>
              <tbody>
                @for (p of data.participants.slice(0, 250); track p.profileid) {
                  <tr>
                    <td><div class="nm">{{ p.name }}</div><div class="em">{{ p.email }}</div></td>
                    <td>{{ label(p.customerstatus) }}</td>
                    <td>{{ p.activejourney ? journeyMap()[p.activejourney] : '—' }}</td>
                    <td>{{ p.activeproduct.length }}</td>
                  </tr>
                }
              </tbody>
            }
          </table>
          @if (data.participants.length > 250) {
            <p class="more">Showing first 250 of {{ data.participants.length }}.</p>
          }
        }
      </div>

      <div class="dlg-foot">
        @if (data.def.watson && data.participants.length) {
          <button data-testid="pi-watson-export" class="btn btn-ghost spacer" (click)="exportCsv()">
            <span class="material-symbols-rounded">download</span> Export CSV
          </button>
        }
        <button class="btn btn-primary" (click)="ref.close()">Done</button>
      </div>
    </div>
  `,
  styles: `
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .cnt { font-size: 13px; color: var(--pi-text-2); margin-bottom: 10px; }
    .cl { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--pi-text-3); padding: 0 12px 8px; border-bottom: 1px solid var(--pi-border); }
    td { padding: 9px 12px; border-bottom: 0.5px solid var(--pi-border); vertical-align: middle; }
    .nm { font-weight: 600; }
    .em { font-size: 11px; color: var(--pi-text-3); }
    .act { text-align: right; white-space: nowrap; }
    .vp { display: inline-flex; align-items: center; gap: 3px; font-size: 12.5px; font-weight: 600; color: var(--pi-accent); text-decoration: none; }
    .vp:hover { text-decoration: underline; }
    .vp .material-symbols-rounded { font-size: 15px; }
    .more { text-align: center; color: var(--pi-text-3); font-size: 12.5px; margin-top: 12px; }
    .notwired { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 40px 20px; color: var(--pi-text-2); }
    .notwired .material-symbols-rounded { font-size: 40px; color: var(--pi-text-3); }
    .notwired p { margin: 0; font-size: 13.5px; max-width: 36ch; }
  `,
})
export class ChecklistViewerDialogComponent {
  readonly ref = inject(MatDialogRef<ChecklistViewerDialogComponent>);
  readonly data = inject<{ def: ChecklistDef; participants: Participant[] }>(MAT_DIALOG_DATA);
  private readonly store = inject(ParticipantStore);

  readonly journeyMap = computed(() => toNameMap(this.store.reference().journeys));

  label(status: string): string {
    return status === 'none' ? '—' : status;
  }

  exportCsv(): void {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Email', 'Watson status', 'Subscription', 'Purchase value', 'Paid', 'Balance'];
    const lines = this.data.participants.map((p) =>
      [p.name, p.email, p.financialstatus, p.customerstatus, p.purchasevalue, p.paid, p.balance].map(esc).join(',')
    );
    const csv = '\ufeff' + [header.join(','), ...lines].join('\n');
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${this.data.def.id}.csv`);
  }
}

// ================================================================================================
// Filter rail
// ================================================================================================

export interface FilterOption {
  value: string;
  label: string;
  hint?: string; // second line, e.g. when a journey segment's list was last updated
  count?: number | null; // participants per option (events / queues); null = not loaded yet
}
export interface FilterSection {
  group: CheckGroup;
  label: string;
  options: FilterOption[];
  keywords?: string; // extra words the filter search matches, e.g. the Event switch states
}

const STATUS_OPTS: FilterOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'non active', label: 'Non active' },
  { value: 'late', label: 'Late' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'banned', label: 'Banned' },
  { value: 'none', label: 'No status' },
];
const FIN_OPTS: FilterOption[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'fully paid', label: 'Fully paid' },
  { value: 'locked', label: 'Locked' },
  { value: 'late', label: 'Late' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'banned', label: 'Banned' },
  { value: 'none', label: 'None' },
];

// What each subscription relation means, shown under its select.
const RELATION_HELP: Record<SubscriptionRelation, string> = {
  startBetween: 'The start date falls in the range.',
  endBetween: 'The end date falls in the range.',
  within: 'Both the start and the end date fall in the range.',
  startInEndAfter: 'Starts in the range and ends after it.',
  startBeforeEndIn: 'Starts before the range and ends in it.',
  throughout: 'Active on every day of the range.',
  anyTime: 'Active on at least one day of the range.',
  notActive: 'Not active on any day of the range.',
};

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

// yyyy-mm-dd as local midnight, for the date range picker.
const dayToDate = (day: string | null): Date | null => (day ? new Date(`${day}T00:00:00`) : null);

// A half-filled "Is between" is still being typed: it gets a prompt, not a red error.
function conditionPending(c: CountCondition): boolean {
  return c.op === 'between' && isCount(c.a) && isCount(c.b) && (c.a == null) !== (c.b == null);
}

// Invalid numbers or a reversed range: red inputs; the engine doesn't apply the condition.
function conditionInvalid(c: CountCondition): boolean {
  return !!conditionError(c) && !conditionPending(c);
}

// One count condition in words (At least / At most / Exact / Is between), shared by the ATC, uP! and
// CPM counts and every product-count rule.
@Component({
  selector: 'app-count-condition',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cond" [class.between]="value().op === 'between'">
      <select data-testid="pi-cond-op" aria-label="Condition" (change)="setOp($any($event.target).value)">
        @for (o of ops; track o.value) {
          <option [value]="o.value" [selected]="o.value === value().op">{{ o.label }}</option>
        }
      </select>
      <input
        data-testid="pi-cond-a"
        type="number"
        min="0"
        step="1"
        inputmode="numeric"
        placeholder="0"
        [attr.aria-label]="value().op === 'between' ? 'From' : 'Count'"
        [class.bad]="invalid()"
        [value]="value().a ?? ''"
        (input)="setNum('a', $any($event.target).value)"
      />
      @if (value().op === 'between') {
        <span class="and">and</span>
        <input
          data-testid="pi-cond-b"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          placeholder="0"
          aria-label="To"
          [class.bad]="invalid()"
          [value]="value().b ?? ''"
          (input)="setNum('b', $any($event.target).value)"
        />
      }
    </div>
    @if (error()) {
      <span class="msg" [class.err]="invalid()">{{ error() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cond {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 72px;
      gap: 6px;
      align-items: center;
    }
    .cond.between {
      grid-template-columns: minmax(0, 1fr) 52px auto 52px;
      gap: 5px;
    }
    select,
    input {
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text);
      border: 1px solid var(--pi-border-strong);
      border-radius: 8px;
      padding: 7px 8px;
      background: #fff;
      width: 100%;
      min-width: 0;
      outline: none;
    }
    select:focus,
    input:focus {
      border-color: var(--pi-accent);
    }
    input.bad {
      border-color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }
    .and {
      font-size: 12.5px;
      color: var(--pi-text-2);
    }
    .msg {
      font-size: 11.5px;
      color: var(--pi-text-3);
    }
    .msg.err {
      color: var(--pi-status-banned);
    }
  `,
})
export class CountConditionComponent {
  readonly value = input.required<CountCondition>();
  readonly valueChange = output<CountCondition>();

  readonly ops = COUNT_OPS;
  readonly error = computed(() => conditionError(this.value()));
  readonly invalid = computed(() => conditionInvalid(this.value()));

  // the second number only means something for "Is between"
  setOp(op: CountOp): void {
    const c = this.value();
    this.valueChange.emit({ ...c, op, b: op === 'between' ? c.b : null });
  }
  // no clamping: a negative or fractional number is flagged, not silently changed
  setNum(edge: 'a' | 'b', value: string): void {
    this.valueChange.emit({ ...this.value(), [edge]: num(value) });
  }
}

type CustomSection = 'atc' | 'programs' | 'age' | 'dates' | 'activity';
type RuleKind = 'consumed' | 'unconsumed';

@Component({
  selector: 'app-filter-rail',
  imports: [DecimalPipe, NgTemplateOutlet, MatDatepickerModule, MatFormFieldModule, CountConditionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rail-head">
      <div class="title">
        <span class="material-symbols-rounded">filter_alt</span>
        <span>Filters</span>
        @if (store.activeFilterCount()) {
          <span class="count">{{ store.activeFilterCount() }}</span>
        }
      </div>
      <div class="head-actions">
        <button data-testid="pi-filter-close" class="icon" title="Close filters" (click)="close.emit()">
          <span class="material-symbols-rounded">left_panel_close</span>
        </button>
        <button data-testid="pi-filter-toggle-all" class="icon" [title]="allOpen() ? 'Collapse all' : 'Expand all'" (click)="toggleAll()">
          <span class="material-symbols-rounded">{{ allOpen() ? 'unfold_less' : 'unfold_more' }}</span>
        </button>
        <button class="reset" title="Clear filters, the insight and the loaded audience" [disabled]="!canReset()" (click)="store.clearFilter()">Reset</button>
      </div>
    </div>

    <div class="saved">
      <div class="saved-head">
        <button class="saved-toggle" [attr.aria-expanded]="savedOpen()" (click)="savedOpen.set(!savedOpen())">
          <span class="material-symbols-rounded lead">bookmarks</span>
          <span class="saved-title">Saved filters</span>
          @if (savedFilters().length) {
            <span class="sec-count">{{ savedFilters().length }}</span>
          }
          <span class="material-symbols-rounded chev">{{ savedOpen() ? 'expand_less' : 'expand_more' }}</span>
        </button>
        <button data-testid="pi-rail-saved-manage" class="link" (click)="manage.emit()">Manage</button>
      </div>
      @if (savedOpen()) {
        @if (savedFilters().length) {
          <div class="mini-search">
            <span class="material-symbols-rounded">search</span>
            <input data-testid="pi-rail-saved-search" type="text" placeholder="Search saved filters…" [value]="savedQuery()" (input)="savedQuery.set($any($event.target).value)" />
          </div>
          <div class="saved-list">
            @for (a of visibleSaved(); track a.id) {
              <button
                data-testid="pi-rail-saved-item"
                class="saved-item"
                [class.on]="a.id === store.activeAudienceId()"
                [attr.aria-pressed]="a.id === store.activeAudienceId()"
                [title]="a.name"
                (click)="store.loadAudience(a.id)"
              >
                <span class="saved-name">{{ a.name }}</span>
                @if (a.id === store.activeAudienceId() && store.audienceModified()) {
                  <span class="saved-mod">modified</span>
                }
                <span class="saved-count">{{ (store.audienceCounts()[a.id] | number) ?? '—' }}</span>
              </button>
            } @empty {
              <div class="saved-none">No saved filters match “{{ savedQuery() }}”.</div>
            }
          </div>
        } @else {
          <div class="saved-none">None yet. Set some filters, then use Save filter below.</div>
        }
      }
    </div>

    <div class="rail-search">
      <span class="material-symbols-rounded">search</span>
      <input data-testid="pi-filter-search" type="text" placeholder="Search filters…" [value]="query()" (input)="query.set($any($event.target).value)" />
      @if (query()) {
        <button class="clear" (click)="query.set('')" aria-label="Clear filter search">
          <span class="material-symbols-rounded">close</span>
        </button>
      }
    </div>

    <div class="rail-body">
      @for (sec of visibleSections(); track sec.group) {
        <div class="section" [class.open]="isOpen(sec.group)">
          <button class="sec-head" (click)="toggleSection(sec.group)">
            <span class="sec-label">{{ sec.label }}</span>
            @if (countFor(sec.group)) {
              <span class="sec-count">{{ countFor(sec.group) }}</span>
            }
            <span class="material-symbols-rounded chev">{{ isOpen(sec.group) ? 'expand_less' : 'expand_more' }}</span>
          </button>
          @if (isOpen(sec.group)) {
            <div class="sec-body">
              <!-- Event / Queue: the switch says what a ticked option means; the lists are long, so they get a search -->
              @if (sec.group === 'events') {
                <div class="seg">
                  <button data-testid="pi-filter-event-attended" [class.on]="eventStatus() === 'attended'" (click)="setEventStatus('attended')">Attended</button>
                  <button data-testid="pi-filter-event-confirmed" [class.on]="eventStatus() === 'confirmed'" (click)="setEventStatus('confirmed')">Confirmed</button>
                </div>
                <span class="hint">{{ eventHint() }}</span>
                <div class="mini-search">
                  <span class="material-symbols-rounded">search</span>
                  <input data-testid="pi-filter-event-search" type="text" placeholder="Search events…" [value]="sectionQuery().events ?? ''" (input)="setSectionQuery('events', $any($event.target).value)" />
                </div>
              } @else if (sec.group === 'queues') {
                <div class="seg">
                  <button data-testid="pi-filter-queue-completed" [class.on]="queueStatus() === 'completed'" (click)="setQueueStatus('completed')">Completed</button>
                  <button data-testid="pi-filter-queue-live" [class.on]="queueStatus() === 'live'" (click)="setQueueStatus('live')">Live</button>
                </div>
                <span class="hint">{{ queueStatus() === 'live' ? 'Participants currently in the ticked queues.' : 'Participants who completed the ticked queues.' }}</span>
                <div class="mini-search">
                  <span class="material-symbols-rounded">search</span>
                  <input data-testid="pi-filter-queue-search" type="text" placeholder="Search queues…" [value]="sectionQuery().queues ?? ''" (input)="setSectionQuery('queues', $any($event.target).value)" />
                </div>
              }
              <div class="opts" [class.scroll]="sec.group === 'events' || sec.group === 'queues'">
                @for (o of sec.options; track o.value) {
                  <button
                    data-testid="pi-filter-option"
                    class="opt"
                    role="checkbox"
                    [attr.aria-checked]="state(sec.group, o.value) === 'in' ? 'true' : state(sec.group, o.value) === 'out' ? 'mixed' : 'false'"
                    [class.in]="state(sec.group, o.value) === 'in'"
                    [class.out]="state(sec.group, o.value) === 'out'"
                    [title]="cycleHint(sec.group, o.value)"
                    (click)="cycle(sec.group, o.value)"
                  >
                    <span class="box"></span>
                    <span class="opt-text">
                      <span class="opt-label">
                        {{ o.label }}
                        @if (o.count != null) {
                          <span class="opt-count">({{ o.count | number }})</span>
                        }
                      </span>
                      @if (o.hint) {
                        <span class="opt-hint">{{ o.hint }}</span>
                      }
                    </span>
                  </button>
                } @empty {
                  <span class="hint">{{ sectionQuery()[sec.group] ? 'No matches.' : 'Nothing to choose from yet.' }}</span>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- ATC count -->
      @if (showCustom('atc')) {
        <div class="section" [class.open]="isOpen('atc')">
          <button class="sec-head" (click)="toggleSection('atc')">
            <span class="sec-label">ATC count</span>
            @if (customErrors().atc) {
              <span class="material-symbols-rounded sec-err" title="Check the numbers">error</span>
            } @else if (customCounts().atc) {
              <span class="sec-count">{{ customCounts().atc }}</span>
            }
            <span class="material-symbols-rounded chev">{{ isOpen('atc') ? 'expand_less' : 'expand_more' }}</span>
          </button>
          @if (isOpen('atc')) {
            <div class="sec-body">
              <app-count-condition data-testid="pi-filter-atc-count" [value]="store.filter().atcCount" (valueChange)="setCount('atcCount', $event)" />
              <span class="hint">Participants without an ATC count are excluded.</span>
            </div>
          }
        </div>
      }

      <!-- uP! / CPM -->
      @if (showCustom('programs')) {
        <div class="section" [class.open]="isOpen('programs')">
          <button class="sec-head" (click)="toggleSection('programs')">
            <span class="sec-label">uP! &amp; CPM</span>
            @if (customErrors().programs) {
              <span class="material-symbols-rounded sec-err" title="Check the numbers">error</span>
            } @else if (customCounts().programs) {
              <span class="sec-count">{{ customCounts().programs }}</span>
            }
            <span class="material-symbols-rounded chev">{{ isOpen('programs') ? 'expand_less' : 'expand_more' }}</span>
          </button>
          @if (isOpen('programs')) {
            <div class="sec-body">
              <span class="mini-label">uP! attendance</span>
              @for (o of upStatusOpts; track o.value) {
                <button
                  data-testid="pi-filter-up-status"
                  class="opt"
                  role="checkbox"
                  [attr.aria-checked]="state('upStatus', o.value) === 'in' ? 'true' : state('upStatus', o.value) === 'out' ? 'mixed' : 'false'"
                  [class.in]="state('upStatus', o.value) === 'in'"
                  [class.out]="state('upStatus', o.value) === 'out'"
                  [title]="cycleHint('upStatus', o.value)"
                  (click)="cycle('upStatus', o.value)"
                >
                  <span class="box"></span>
                  <span class="opt-label">{{ o.label }}</span>
                </button>
              }
              <span class="mini-label">uP! count</span>
              <app-count-condition data-testid="pi-filter-up-count" [value]="store.filter().upCount" (valueChange)="setCount('upCount', $event)" />
              <span class="mini-label">CPM count</span>
              <app-count-condition data-testid="pi-filter-cpm-count" [value]="store.filter().cpmCount" (valueChange)="setCount('cpmCount', $event)" />
            </div>
          }
        </div>
      }

      <!-- age -->
      @if (showCustom('age')) {
        <div class="section" [class.open]="isOpen('age')">
          <button class="sec-head" (click)="toggleSection('age')">
            <span class="sec-label">Age</span>
            @if (customErrors().age) {
              <span class="material-symbols-rounded sec-err" title="Check the numbers">error</span>
            } @else if (customCounts().age) {
              <span class="sec-count">{{ customCounts().age }}</span>
            }
            <span class="material-symbols-rounded chev">{{ isOpen('age') ? 'expand_less' : 'expand_more' }}</span>
          </button>
          @if (isOpen('age')) {
            <div class="sec-body">
              <div class="field-row two">
                <input
                  data-testid="pi-filter-age-min"
                  class="num-input"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  placeholder="Min"
                  aria-label="Minimum age"
                  [class.bad]="ageError()"
                  [value]="store.filter().ageMin ?? ''"
                  (input)="setNum('ageMin', $any($event.target).value)"
                />
                <input
                  data-testid="pi-filter-age-max"
                  class="num-input"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  placeholder="Max"
                  aria-label="Maximum age"
                  [class.bad]="ageError()"
                  [value]="store.filter().ageMax ?? ''"
                  (input)="setNum('ageMax', $any($event.target).value)"
                />
              </div>
              @if (ageError()) {
                <span class="msg">{{ ageError() }}</span>
              }
              <span class="hint">Participants without a date of birth are excluded.</span>
            </div>
          }
        </div>
      }

      <!-- subscription dates -->
      @if (showCustom('dates')) {
        <div class="section" [class.open]="isOpen('dates')">
          <button class="sec-head" (click)="toggleSection('dates')">
            <span class="sec-label">Subscription dates</span>
            @if (customErrors().dates) {
              <span class="material-symbols-rounded sec-err" title="Check the dates">error</span>
            } @else if (customCounts().dates) {
              <span class="sec-count">{{ customCounts().dates }}</span>
            }
            @if (legacyEnd()) {
              <span class="material-symbols-rounded sec-info" title="This saved filter has an older end date range that isn't applied here">info</span>
            }
            <span class="material-symbols-rounded chev">{{ isOpen('dates') ? 'expand_less' : 'expand_more' }}</span>
          </button>
          @if (isOpen('dates')) {
            <div class="sec-body">
              <span class="mini-label">Match subscriptions that…</span>
              <select data-testid="pi-filter-sub-relation" class="rule-sel" aria-label="Match subscriptions that" (change)="setRelation($any($event.target).value)">
                @for (r of relations; track r.value) {
                  <option [value]="r.value" [selected]="r.value === subscription().relation">{{ r.label }}</option>
                }
              </select>
              <span class="hint">{{ relationHelp[subscription().relation] }}</span>
              <mat-form-field data-testid="pi-filter-sub-range" class="range" [class.bad]="subError()" appearance="outline" subscriptSizing="dynamic">
                <mat-label>Date range</mat-label>
                <mat-date-range-input [rangePicker]="subPicker">
                  <input data-testid="pi-filter-sub-from" matStartDate placeholder="From" [value]="subFrom()" (dateChange)="setDate('from', $event.value)" />
                  <input data-testid="pi-filter-sub-to" matEndDate placeholder="To" [value]="subTo()" (dateChange)="setDate('to', $event.value)" />
                </mat-date-range-input>
                <mat-datepicker-toggle matIconSuffix [for]="subPicker" />
                <mat-date-range-picker #subPicker />
              </mat-form-field>
              @if (subError()) {
                <span class="msg">{{ subError() }}</span>
              }
              <span class="hint">
                Both days count. An empty side has no limit. Non active and discontinued participants are matched on their last
                subscription; anyone without the dates is excluded.
              </span>
              @if (legacyEnd(); as range) {
                <span data-testid="pi-filter-sub-legacy" class="msg info">
                  This saved filter also has an older end date range ({{ range }}). Only one range applies here, so it isn't
                  applied; saving keeps it for analytics.
                </span>
              }
              @if (subscription().from || subscription().to) {
                <button data-testid="pi-filter-sub-clear" class="link start" (click)="clearDates()">Clear dates</button>
              }
            </div>
          }
        </div>
      }

      <!-- product activity -->
      @if (showCustom('activity')) {
        <div class="section" [class.open]="isOpen('activity')">
          <button class="sec-head" (click)="toggleSection('activity')">
            <span class="sec-label">Product activity</span>
            @if (customErrors().activity) {
              <span class="material-symbols-rounded sec-err" title="Check the numbers">error</span>
            } @else if (customCounts().activity) {
              <span class="sec-count">{{ customCounts().activity }}</span>
            }
            <span class="material-symbols-rounded chev">{{ isOpen('activity') ? 'expand_less' : 'expand_more' }}</span>
          </button>
          @if (isOpen('activity')) {
            <!-- one wrapper hook per rule kind, so a spec can tell consumed from unconsumed rules -->
            <div class="sec-body">
              <div data-testid="pi-filter-consumed" class="rule-kind">
                <ng-container [ngTemplateOutlet]="ruleKind" [ngTemplateOutletContext]="{ $implicit: ruleRows().consumed }" />
              </div>
              <div data-testid="pi-filter-unconsumed" class="rule-kind">
                <ng-container [ngTemplateOutlet]="ruleKind" [ngTemplateOutletContext]="{ $implicit: ruleRows().unconsumed }" />
              </div>
            </div>
            <ng-template #ruleKind let-kind>
              <span class="mini-label">{{ kind.label }}</span>
              @for (row of kind.rules; track $index) {
                <div data-testid="pi-filter-rule" class="rule">
                  <div class="rule-top">
                    <select data-testid="pi-filter-rule-product" class="rule-sel" aria-label="Product" (change)="updateRule(kind.key, $index, { productId: $any($event.target).value })">
                      <!-- a rule on a product that no longer exists (or none) must not show another product -->
                      <option value="" disabled [selected]="!productIds().has(row.productId)">Choose a product</option>
                      @for (p of products(); track p.id) {
                        <option [value]="p.id" [selected]="p.id === row.productId">{{ p.name }}</option>
                      }
                    </select>
                    <button data-testid="pi-filter-rule-remove" class="rule-del" aria-label="Remove rule" (click)="removeRule(kind.key, $index)">
                      <span class="material-symbols-rounded">close</span>
                    </button>
                  </div>
                  <app-count-condition [value]="row.condition" (valueChange)="setRuleCondition(kind.key, $index, $event)" />
                </div>
              }
              <button data-testid="pi-filter-rule-add" class="add-rule" (click)="addRule(kind.key)">
                <span class="material-symbols-rounded">add</span> Add rule
              </button>
            </ng-template>
          }
        </div>
      }

      @if (query() && !visibleSections().length && !anyCustomVisible()) {
        <div class="no-match">No filters match “{{ query() }}”.</div>
      }
    </div>

    <div class="rail-foot">
      <button data-testid="pi-filter-save" class="save-btn" [disabled]="!store.activeFilterCount()" (click)="save.emit()">
        <span class="material-symbols-rounded">bookmark_add</span> Save filter
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--pi-surface);
      border-right: 1px solid var(--pi-border);
    }

    .rail-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--pi-border);
      flex-shrink: 0;
    }
    .title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 700;
      color: var(--pi-text);
    }
    .title .material-symbols-rounded {
      font-size: 19px;
      color: var(--pi-accent);
    }
    .title .count {
      background: var(--pi-accent);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
    }
    .head-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .icon {
      border: none;
      background: none;
      color: var(--pi-text-3);
      cursor: pointer;
      display: inline-flex;
      padding: 3px;
      border-radius: 6px;
    }
    .icon:hover {
      background: var(--pi-surface-3);
      color: var(--pi-text);
    }
    .icon .material-symbols-rounded {
      font-size: 19px;
    }
    .reset {
      border: none;
      background: none;
      color: var(--pi-accent);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .reset:disabled {
      color: var(--pi-text-3);
      cursor: default;
    }
    .link {
      border: none;
      background: none;
      padding: 0;
      color: var(--pi-accent);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .link:hover {
      text-decoration: underline;
    }
    .link.start {
      align-self: flex-start;
      margin-top: 6px;
    }

    /* saved filters: fixed above the filter search, the list scrolls on its own */
    .saved {
      flex-shrink: 0;
      padding: 6px 12px 8px;
      border-bottom: 1px solid var(--pi-border);
    }
    .saved-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .saved-toggle {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 4px;
      border: none;
      background: none;
      border-radius: 7px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--pi-text);
      cursor: pointer;
      text-align: left;
    }
    .saved-toggle:hover {
      background: var(--pi-surface-3);
    }
    .saved-toggle .lead {
      font-size: 18px;
      color: var(--pi-accent);
    }
    .saved-title {
      flex: 1;
    }
    .saved-list {
      max-height: 160px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .saved-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 8px;
      border: none;
      background: none;
      border-radius: 7px;
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text-2);
      cursor: pointer;
      text-align: left;
    }
    .saved-item:hover {
      background: var(--pi-surface-3);
    }
    .saved-item.on {
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
      font-weight: 600;
    }
    .saved-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .saved-mod {
      font-size: 11px;
      font-weight: 600;
      color: var(--pi-status-late);
    }
    .saved-count {
      font-size: 12px;
      font-weight: 500;
      color: var(--pi-text-3);
      font-variant-numeric: tabular-nums;
    }
    .saved-none {
      padding: 4px 4px 2px;
      font-size: 12px;
      color: var(--pi-text-3);
    }

    .rail-search {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 10px 12px 4px;
      padding: 0 10px;
      height: 34px;
      background: var(--pi-surface-3);
      border: 1px solid transparent;
      border-radius: var(--pi-radius-sm);
      flex-shrink: 0;
    }
    .rail-search:focus-within {
      background: #fff;
      border-color: var(--pi-accent);
    }
    .rail-search > .material-symbols-rounded {
      font-size: 18px;
      color: var(--pi-text-3);
    }
    .rail-search input {
      flex: 1;
      min-width: 0;
      border: none;
      background: none;
      outline: none;
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text);
    }
    .rail-search .clear {
      border: none;
      background: none;
      color: var(--pi-text-3);
      cursor: pointer;
      display: inline-flex;
      padding: 0;
    }
    .rail-search .clear .material-symbols-rounded {
      font-size: 16px;
    }
    /* the smaller search used by saved filters and the Event / Queue lists */
    .mini-search {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 8px;
      margin: 6px 0 4px;
      background: var(--pi-surface-3);
      border: 1px solid transparent;
      border-radius: var(--pi-radius-sm);
    }
    .mini-search:focus-within {
      background: #fff;
      border-color: var(--pi-accent);
    }
    .mini-search .material-symbols-rounded {
      font-size: 16px;
      color: var(--pi-text-3);
    }
    .mini-search input {
      flex: 1;
      min-width: 0;
      border: none;
      background: none;
      outline: none;
      font-family: inherit;
      font-size: 12.5px;
      color: var(--pi-text);
    }
    .no-match {
      padding: 18px 16px;
      font-size: 12.5px;
      color: var(--pi-text-3);
    }
    .hint {
      font-size: 11.5px;
      color: var(--pi-text-3);
      margin-top: 6px;
    }
    .msg {
      font-size: 11.5px;
      color: var(--pi-status-banned);
      margin-top: 4px;
    }
    .msg.info {
      color: var(--pi-text-2);
    }
    .seg {
      display: inline-flex;
      border: 1px solid var(--pi-border-strong);
      border-radius: 8px;
      overflow: hidden;
      align-self: flex-start;
    }
    .seg button {
      border: none;
      background: #fff;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--pi-text-2);
      padding: 6px 14px;
      cursor: pointer;
    }
    .seg button.on {
      background: var(--pi-accent);
      color: #fff;
    }

    .rail-body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 4px 0;
    }

    .section {
      border-bottom: 1px solid #eef1f4;
    }
    .sec-head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 16px;
      border: none;
      background: none;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--pi-text);
      cursor: pointer;
      text-align: left;
    }
    .sec-head:hover {
      background: var(--pi-surface-3);
    }
    .sec-label {
      flex: 1;
    }
    .sec-count {
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
      font-size: 11px;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
    }
    .sec-err {
      font-size: 18px;
      color: var(--pi-status-banned);
    }
    .sec-info {
      font-size: 18px;
      color: var(--pi-text-3);
    }
    .chev {
      font-size: 19px;
      color: var(--pi-text-3);
    }
    .sec-body {
      padding: 2px 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .opts {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .opts.scroll {
      max-height: 280px;
      overflow-y: auto;
    }

    .opt {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 5px 6px;
      border: none;
      background: none;
      border-radius: 7px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text-2);
      text-align: left;
      user-select: none;
    }
    .opt:hover {
      background: var(--pi-surface-3);
    }
    .opt .box {
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--pi-border-strong);
      border-radius: 5px;
      background: #fff;
      position: relative;
      flex-shrink: 0;
      transition: all 0.1s ease;
    }
    .opt-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .opt-count {
      color: var(--pi-text-3);
      font-variant-numeric: tabular-nums;
    }
    .opt-hint {
      font-size: 11px;
      color: var(--pi-text-3);
    }
    /* include: blue tick */
    .opt.in .box {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
    }
    .opt.in .box::after {
      content: '';
      position: absolute;
      left: 4.5px;
      top: 1px;
      width: 4px;
      height: 9px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .opt.in .opt-label {
      color: var(--pi-text);
      font-weight: 500;
    }
    /* exclude: red cross, struck-through label */
    .opt.out .box {
      background: var(--pi-status-banned);
      border-color: var(--pi-status-banned);
    }
    .opt.out .box::before,
    .opt.out .box::after {
      content: '';
      position: absolute;
      left: 6px;
      top: 2px;
      width: 1.8px;
      height: 9px;
      background: #fff;
      border-radius: 1px;
    }
    .opt.out .box::before {
      transform: rotate(45deg);
    }
    .opt.out .box::after {
      transform: rotate(-45deg);
    }
    .opt.out .opt-label {
      color: var(--pi-status-banned);
      text-decoration: line-through;
    }

    .mini-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--pi-text-3);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 8px 2px 4px;
    }
    .field-row.two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .num-input,
    .rule-sel {
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text);
      border: 1px solid var(--pi-border-strong);
      border-radius: 8px;
      padding: 7px 9px;
      background: #fff;
      width: 100%;
      min-width: 0;
      outline: none;
    }
    .num-input:focus,
    .rule-sel:focus {
      border-color: var(--pi-accent);
    }
    .num-input.bad {
      border-color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }

    /* Material date range field, sized and coloured to match the rail's inputs */
    .range {
      width: 100%;
      margin-top: 8px;
      --mat-form-field-container-height: 40px;
      --mat-form-field-container-vertical-padding: 9px;
      --mat-form-field-container-text-size: 13px;
      --mat-form-field-container-text-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, 'Segoe UI', sans-serif;
      --mdc-outlined-text-field-label-text-size: 13px;
      --mdc-outlined-text-field-label-text-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, 'Segoe UI', sans-serif;
      --mdc-outlined-text-field-container-shape: 8px;
      --mdc-outlined-text-field-outline-color: var(--pi-border-strong);
      --mdc-outlined-text-field-hover-outline-color: var(--pi-accent);
      --mdc-outlined-text-field-focus-outline-color: var(--pi-accent);
      --mdc-outlined-text-field-focus-label-text-color: var(--pi-accent);
      --mdc-icon-button-state-layer-size: 36px;
    }
    .range.bad {
      --mdc-outlined-text-field-outline-color: var(--pi-status-banned);
      --mdc-outlined-text-field-hover-outline-color: var(--pi-status-banned);
      --mdc-outlined-text-field-focus-outline-color: var(--pi-status-banned);
      --mdc-outlined-text-field-label-text-color: var(--pi-status-banned);
      --mdc-outlined-text-field-focus-label-text-color: var(--pi-status-banned);
    }

    .rule-kind {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .rule {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      margin-bottom: 6px;
      border: 1px solid var(--pi-border);
      border-radius: 8px;
      background: var(--pi-surface-2);
    }
    .rule-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      gap: 6px;
      align-items: center;
    }
    .rule-del {
      border: none;
      background: none;
      color: var(--pi-text-3);
      cursor: pointer;
      display: inline-flex;
      padding: 2px;
    }
    .rule-del:hover {
      color: var(--pi-status-banned);
    }
    .rule-del .material-symbols-rounded {
      font-size: 17px;
    }
    .add-rule {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px dashed var(--pi-border-strong);
      background: none;
      color: var(--pi-accent);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      padding: 7px 10px;
      border-radius: 8px;
      cursor: pointer;
      margin: 2px 0 10px;
      width: 100%;
      justify-content: center;
    }
    .add-rule:hover {
      background: var(--pi-accent-bg);
    }
    .add-rule .material-symbols-rounded {
      font-size: 16px;
    }

    .rail-foot {
      flex-shrink: 0;
      padding: 12px 16px;
      border-top: 1px solid var(--pi-border);
    }
    .save-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      height: 38px;
      border: 1px solid var(--pi-accent);
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      border-radius: var(--pi-radius);
      cursor: pointer;
    }
    .save-btn:hover:not(:disabled) {
      background: #cfe7e7;
    }
    .save-btn:disabled {
      border-color: var(--pi-border);
      background: var(--pi-surface-3);
      color: var(--pi-text-3);
      cursor: default;
    }
    .save-btn .material-symbols-rounded {
      font-size: 18px;
    }
  `,
})
export class FilterRailComponent {
  readonly store = inject(ParticipantStore);
  readonly save = output<void>();
  readonly close = output<void>();
  readonly manage = output<void>();

  readonly relations = SUBSCRIPTION_RELATIONS;
  readonly relationHelp = RELATION_HELP;

  // every section starts collapsed; clicking its name expands it
  readonly open = signal<Set<string>>(new Set());

  // filter-panel search: hides non-matching options and opens every section with a match
  readonly query = signal('');
  // the Event / Queue sections' own searches: narrow the list without hiding the section
  readonly sectionQuery = signal<Partial<Record<CheckGroup, string>>>({});

  // --- saved filters (the top block) ---
  readonly savedOpen = signal(true);
  readonly savedQuery = signal('');
  readonly savedFilters = computed(() => this.store.audiences().filter((a) => a.kind === 'filter').sort(byName));
  readonly visibleSaved = computed(() => {
    const q = this.savedQuery().trim().toLowerCase();
    return q ? this.savedFilters().filter((a) => a.name.toLowerCase().includes(q)) : this.savedFilters();
  });

  // Reset = Clear all, so it also clears input that makes no chip (e.g. a reversed age range), the
  // insight and the loaded audience.
  readonly canReset = computed(() => this.store.filterTouched() || !!this.store.activeSignal() || !!this.store.activeAudienceId());

  // hand-built sections (not option lists), matched by these words
  private readonly customLabels: Record<CustomSection, string> = {
    atc: 'ATC count',
    programs: 'uP! & CPM count attendance new already attended',
    age: 'Age',
    dates: 'Subscription dates start end range',
    activity: 'Product activity consumed unconsumed count',
  };

  readonly upStatusOpts: FilterOption[] = [
    { value: 'new', label: 'New (no uP! yet)' },
    { value: 'returning', label: 'Already attended uP!' },
  ];

  readonly eventStatus = computed(() => this.store.filter().eventStatus);
  readonly queueStatus = computed(() => this.store.filter().queueStatus);
  readonly subscription = computed(() => this.store.filter().subscription);

  readonly eventHint = computed(() => {
    if (this.eventStatus() === 'attended') return 'Participants who attended the ticked events.';
    return this.store.confirmedLoading()
      ? 'Loading confirmed participants…'
      : 'Participants with an approved request. Counts show once an event is ticked.';
  });

  private opt = (arr: { id: string; name: string }[]): FilterOption[] => arr.map((a) => ({ value: a.id, label: a.name }));

  // Event / queue names repeat, so the date tells them apart ("Name · 12 Mar 2026"); journey segments
  // say when their saved list was last updated. Built per reference load, not on every filter change.
  private readonly referenceOptions = computed(() => {
    const ref = this.store.reference();
    const dated = (items: DatedRef[]): FilterOption[] => items.map((d) => ({ value: d.id, label: datedLabel(d) }));
    return {
      events: dated(ref.events),
      queues: dated(ref.queues),
      segments: ref.journeySegments.map((s): FilterOption => {
        const day = toDay(s.lastupdated);
        return { value: s.id, label: s.name, hint: day ? `updated ${formatDay(day)}` : 'not updated yet' };
      }),
    };
  });

  readonly sections = computed<FilterSection[]>(() => {
    const ref = this.store.reference();
    const opts = this.referenceOptions();
    const confirmed = this.eventStatus() === 'confirmed';
    // a missing count is 0 once its data is loaded; Confirmed loads per ticked event, queues with the page
    const counted = (options: FilterOption[], counts: Record<string, number>, missing: number | null) =>
      options.map((o) => ({ ...o, count: counts[o.value] ?? missing }));
    return [
      { group: 'customerstatus', label: 'Customer status', options: STATUS_OPTS },
      { group: 'financialstatus', label: 'Financial status', options: FIN_OPTS },
      {
        group: 'registered',
        label: 'Registration',
        options: [
          { value: 'registered', label: 'Registered' },
          { value: 'non-registered', label: 'Guest' },
        ],
      },
      {
        group: 'customersupport',
        label: 'Support',
        options: [
          { value: 'Open', label: 'Open ticket' },
          { value: 'Closed', label: 'Closed ticket' },
        ],
      },
      { group: 'activejourney', label: 'Active journey', options: this.opt(ref.journeys) },
      { group: 'lastcompletedjourney', label: 'Last completed journey', options: this.opt(ref.journeys) },
      { group: 'journeysegments', label: 'Journey segment', options: opts.segments },
      { group: 'activeproduct', label: 'Active products', options: this.opt(ref.products) },
      { group: 'tier', label: 'Tier', options: this.opt(ref.tiers) },
      { group: 'participantmode', label: 'Mode', options: [...this.opt(ref.modes), { value: 'none', label: 'None' }] },
      { group: 'profiletags', label: 'Tags', options: ref.tags.map((t) => ({ value: t.id, label: t.name })) },
      { group: 'addons', label: 'Add-ons', options: this.opt(ref.products) },
      { group: 'gifts', label: 'Gifts', options: this.opt(ref.products) },
      { group: 'bonus', label: 'Bonus', options: this.opt(ref.products) },
      {
        group: 'events',
        label: `Event · ${confirmed ? 'Confirmed' : 'Attended'}`,
        keywords: 'attended confirmed',
        options: counted(opts.events, this.store.eventCounts(), confirmed ? null : 0),
      },
      {
        group: 'queues',
        label: `Queue · ${this.queueStatus() === 'live' ? 'Live' : 'Completed'}`,
        keywords: 'completed live',
        options: counted(opts.queues, this.store.queueCounts(), this.store.queueTokensLoaded() ? 0 : null),
      },
    ];
  });

  readonly products = computed(() => [...this.store.reference().products].sort(byName));
  readonly productIds = computed(() => new Set(this.store.reference().products.map((p) => p.id)));

  readonly visibleSections = computed<FilterSection[]>(() => {
    const q = this.query().trim().toLowerCase();
    const own = this.sectionQuery();
    const matching = (options: FilterOption[], term: string) => options.filter((o) => o.label.toLowerCase().includes(term));
    const shown = !q
      ? this.sections()
      : this.sections()
          .map((sec) => (`${sec.label} ${sec.keywords ?? ''}`.toLowerCase().includes(q) ? sec : { ...sec, options: matching(sec.options, q) }))
          .filter((sec) => sec.options.length > 0);
    return shown.map((sec) => {
      const term = own[sec.group]?.trim().toLowerCase();
      return term ? { ...sec, options: matching(sec.options, term) } : sec;
    });
  });

  private readonly allKeys = computed(() => [...this.sections().map((s) => s.group as string), ...Object.keys(this.customLabels)]);
  readonly allOpen = computed(() => this.allKeys().every((k) => this.open().has(k)));

  // section badges: how many filters a hand-built section applies (invalid and no-op ones don't count)
  readonly customCounts = computed<Record<CustomSection, number>>(() => {
    const f = this.store.filter();
    return {
      atc: conditionActive(f.atcCount) ? 1 : 0,
      programs: f.upStatus.length + (f.exclude.upStatus?.length ?? 0) + [f.upCount, f.cpmCount].filter(conditionActive).length,
      age: ageActive(f) ? 1 : 0,
      dates: subscriptionActive(f.subscription) ? 1 : 0,
      activity: [...f.consumed, ...f.unconsumed].filter(productRuleActive).length,
    };
  });
  // a red mark on the section head, so a mistake inside a collapsed section still shows
  readonly customErrors = computed<Record<CustomSection, boolean>>(() => {
    const f = this.store.filter();
    return {
      atc: conditionInvalid(f.atcCount),
      programs: conditionInvalid(f.upCount) || conditionInvalid(f.cpmCount),
      age: !!ageRangeError(f.ageMin, f.ageMax),
      dates: !!subscriptionFilterError(f.subscription),
      activity: [...f.consumed, ...f.unconsumed].some((r) => conditionInvalid(ruleCondition(r))),
    };
  });

  readonly ageError = computed(() => ageRangeError(this.store.filter().ageMin, this.store.filter().ageMax));
  readonly subError = computed(() => subscriptionFilterError(this.subscription()));
  // the loaded saved filter's analytics end range, which this screen doesn't apply
  readonly legacyEnd = computed(() => {
    const range = this.store.activeAudience()?.legacySubscriptionEnd;
    return range ? describeRange(range.from, range.to) : null;
  });

  // the range picker works with Dates, the filter with local yyyy-mm-dd days; keyed on the day
  // strings so the picker only gets a new Date when a day actually changes
  private readonly subFromDay = computed(() => this.subscription().from);
  private readonly subToDay = computed(() => this.subscription().to);
  readonly subFrom = computed(() => dayToDate(this.subFromDay()));
  readonly subTo = computed(() => dayToDate(this.subToDay()));

  // product-count rules, with each condition built here rather than in the template so it stays the
  // same object between change-detection passes
  readonly ruleRows = computed(() => {
    const f = this.store.filter();
    const kind = (key: RuleKind, label: string) => ({
      key,
      label,
      rules: f[key].map((r) => ({ productId: r.productId, condition: ruleCondition(r) })),
    });
    return { consumed: kind('consumed', 'Consumed count'), unconsumed: kind('unconsumed', 'Unconsumed count') };
  });

  showCustom(key: CustomSection): boolean {
    const q = this.query().trim().toLowerCase();
    return !q || this.customLabels[key].toLowerCase().includes(q);
  }
  anyCustomVisible(): boolean {
    return (Object.keys(this.customLabels) as CustomSection[]).some((k) => this.showCustom(k));
  }

  toggleSection(key: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  toggleAll(): void {
    this.open.set(this.allOpen() ? new Set() : new Set(this.allKeys()));
  }
  // while searching, every visible section is open; clearing the search restores the user's layout
  isOpen(key: string): boolean {
    return !!this.query().trim() || this.open().has(key);
  }

  setSectionQuery(group: CheckGroup, value: string): void {
    this.sectionQuery.update((q) => ({ ...q, [group]: value }));
  }

  // include / exclude state of one option
  state(group: CheckGroup, value: string): 'in' | 'out' | null {
    const f = this.store.filter();
    if ((f[group] as string[]).includes(value)) return 'in';
    if (f.exclude[group]?.includes(value)) return 'out';
    return null;
  }
  countFor(group: CheckGroup): number {
    const f = this.store.filter();
    return (f[group] as string[]).length + (f.exclude[group]?.length ?? 0);
  }
  cycleHint(group: CheckGroup, value: string): string {
    const st = this.state(group, value);
    return st === 'in' ? 'Included — click to exclude' : st === 'out' ? 'Excluded — click to clear' : 'Click to include';
  }
  // click cycle: off → include → exclude → off
  cycle(group: CheckGroup, value: string): void {
    const f = this.store.filter();
    const inc = f[group] as string[];
    const exc = f.exclude[group] ?? [];
    const st = this.state(group, value);
    const nextInc = st === null ? [...inc, value] : inc.filter((v) => v !== value);
    const nextExc = st === 'in' ? [...exc, value] : exc.filter((v) => v !== value);
    this.store.patchFilter({ [group]: nextInc, exclude: { ...f.exclude, [group]: nextExc } } as Partial<FilterModel>);
  }

  // no clamping: an out-of-range number is flagged by the validation instead of silently changed
  setNum(key: 'ageMin' | 'ageMax', value: string): void {
    this.store.patchFilter({ [key]: num(value) });
  }
  setCount(key: 'atcCount' | 'upCount' | 'cpmCount', condition: CountCondition): void {
    this.store.patchFilter({ [key]: condition });
  }
  setQueueStatus(status: QueueStatus): void {
    this.store.patchFilter({ queueStatus: status });
  }
  setEventStatus(status: EventStatus): void {
    this.store.patchFilter({ eventStatus: status });
  }

  // subscription dates: the filter keeps the picker's dates as local yyyy-mm-dd days
  setRelation(relation: SubscriptionRelation): void {
    this.store.patchFilter({ subscription: { ...this.subscription(), relation } });
  }
  setDate(edge: 'from' | 'to', value: Date | null): void {
    this.store.patchFilter({ subscription: { ...this.subscription(), [edge]: dayKey(value) } });
  }
  clearDates(): void {
    this.store.patchFilter({ subscription: { ...this.subscription(), from: null, to: null } });
  }

  // product activity rules
  addRule(kind: RuleKind): void {
    const first = this.products()[0]?.id ?? '';
    this.store.patchFilter({ [kind]: [...this.store.filter()[kind], { productId: first, comparison: 'atLeast', count: 1, count2: null }] });
  }
  updateRule(kind: RuleKind, index: number, patch: Partial<ProductCountRule>): void {
    this.store.patchFilter({ [kind]: this.store.filter()[kind].map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }
  setRuleCondition(kind: RuleKind, index: number, c: CountCondition): void {
    this.updateRule(kind, index, { comparison: c.op, count: c.a, count2: c.b });
  }
  removeRule(kind: RuleKind, index: number): void {
    this.store.patchFilter({ [kind]: this.store.filter()[kind].filter((_, i) => i !== index) });
  }
}

// ================================================================================================
// Active filter chips
// ================================================================================================

@Component({
  selector: 'app-active-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.chips().length || store.activeSignal() || membershipAudience()) {
      <div class="bar">
        @if (store.activeSignal(); as sig) {
          <button class="chip signal" (click)="store.clearSignal()">
            <span class="material-symbols-rounded lead-ic">insights</span>
            <span class="txt">{{ sig.chipLabel ?? sig.label }}</span>
            <span class="material-symbols-rounded">close</span>
          </button>
        }
        @if (membershipAudience(); as aud) {
          <!-- removing the loaded list / segment keeps the filters applied on top of it -->
          <button
            data-testid="pi-chip-audience"
            class="chip audience"
            [title]="'Remove the ' + aud.kind.toLowerCase() + ' and keep the other filters'"
            (click)="store.removeAudience()"
          >
            <span class="material-symbols-rounded lead-ic">groups</span>
            <span class="txt">{{ aud.kind }}: {{ aud.name }}</span>
            <span class="material-symbols-rounded">close</span>
          </button>
        }
        @if (store.chips().length) {
          <span class="lead">Filters</span>
          <!-- tracked by what the chip removes: two labels can match (e.g. two product rules alike) -->
          @for (chip of store.chips(); track chip.group + '|' + chip.value + (chip.exclude ? '|x' : '')) {
            <button class="chip" [class.exclude]="chip.exclude" (click)="store.removeChip(chip)">
              <span class="txt">{{ chip.label }}</span>
              <span class="material-symbols-rounded">close</span>
            </button>
          }
          <button data-testid="pi-chips-save-filter" class="save" (click)="save.emit()">
            <span class="material-symbols-rounded">bookmark_add</span> Save filter
          </button>
        }
        <button class="clear" (click)="store.clearFilter()">Clear all</button>
      </div>
    }
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--pi-border);
      background: var(--pi-surface);
    }
    .lead {
      font-size: 12px;
      font-weight: 600;
      color: var(--pi-text-3);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-right: 2px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--pi-border-strong);
      background: var(--pi-surface);
      color: var(--pi-text);
      font-size: 12.5px;
      font-weight: 500;
      font-family: inherit;
      padding: 4px 6px 4px 11px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .chip:hover {
      border-color: var(--pi-status-banned);
      color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }
    .chip .material-symbols-rounded {
      font-size: 15px;
    }
    .chip.exclude {
      border-color: var(--pi-status-banned);
      color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }
    .chip.signal {
      border-color: var(--pi-accent);
      color: var(--pi-accent-text);
      background: var(--pi-accent-bg);
      font-weight: 600;
    }
    .chip.signal:hover {
      border-color: var(--pi-status-banned);
      color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }
    .chip.signal .lead-ic,
    .chip.audience .lead-ic {
      font-size: 16px;
    }
    .chip.audience {
      border-color: var(--pi-accent);
      color: var(--pi-accent-text);
      font-weight: 600;
    }
    .chip.audience:hover {
      border-color: var(--pi-status-banned);
      color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }
    .save {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 4px;
      border: 1px solid var(--pi-accent);
      border-radius: 999px;
      background: var(--pi-surface);
      color: var(--pi-accent-text);
      font-size: 12.5px;
      font-weight: 600;
      font-family: inherit;
      padding: 3px 10px 3px 8px;
      cursor: pointer;
    }
    .save:hover {
      background: var(--pi-accent-bg);
    }
    .save .material-symbols-rounded {
      font-size: 16px;
    }
    .clear {
      border: none;
      background: none;
      color: var(--pi-accent);
      font-size: 12.5px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      padding: 4px 8px;
      margin-left: 2px;
    }
    .clear:hover {
      text-decoration: underline;
    }
  `,
})
export class ActiveFilterChipsComponent {
  readonly store = inject(ParticipantStore);
  readonly save = output<void>();

  // Only a list / segment gets a chip. A saved filter's conditions are already chips of their own
  // (the switcher and the rail name it), so removing it would change no rows.
  readonly membershipAudience = computed(() => (this.store.activeAudience()?.kind === 'filter' ? null : this.store.audienceLabel()));
}

// ================================================================================================
// Audience switcher
// ================================================================================================

@Component({
  selector: 'app-audience-switcher',
  imports: [MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button data-testid="pi-aud-trigger" class="trigger" [matMenuTriggerFor]="menu" [title]="triggerTitle()">
      <span class="material-symbols-rounded lead">groups</span>
      @if (store.audienceLabel(); as aud) {
        <span class="label"><span class="kind">{{ aud.kind }}</span> {{ aud.name }}</span>
        @if (aud.refinement) {
          <span class="refine" [class.mod]="aud.refinement === 'modified'">· {{ aud.refinement }}</span>
        }
      } @else {
        <span class="label">All participants</span>
      }
      <span class="material-symbols-rounded chev">expand_more</span>
    </button>
    @if (store.audienceModified()) {
      <button data-testid="pi-aud-update" class="update" matTooltip="Save the current filters into this saved filter" (click)="updateSavedFilter()">
        <span class="material-symbols-rounded">save_as</span>
        <span class="lbl">Update saved filter</span>
      </button>
    }

    <mat-menu #menu="matMenu" class="aud-menu" xPosition="before" (closed)="query.set('')">
      <div class="menu-top" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
        <div class="tabs">
          @for (kind of kinds; track kind.key) {
            <button data-testid="pi-aud-tab" class="tab" [class.on]="tab() === kind.key" (click)="tab.set(kind.key)">
              <span class="material-symbols-rounded">{{ kind.icon }}</span>{{ kind.label }}
              <span class="tab-count">{{ byKind(kind.key).length }}</span>
            </button>
          }
        </div>
        <div class="search">
          <span class="material-symbols-rounded">search</span>
          <input data-testid="pi-aud-search" type="text" placeholder="Search {{ tabLabel() }}…" [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
      </div>
      @if (store.activeAudienceId()) {
        <button mat-menu-item class="aud-item" (click)="store.clearFilter()">
          <span class="material-symbols-rounded all-ic">groups</span>
          <span class="aud-name">All participants</span>
          <span class="aud-count">{{ store.totalCount() }}</span>
        </button>
      }
      @for (aud of visible(); track aud.id) {
        <button mat-menu-item class="aud-item" (click)="store.loadAudience(aud.id)">
          <span class="dot" [class.on]="store.activeAudienceId() === aud.id"></span>
          <span class="aud-name">{{ aud.name }}</span>
          <span class="aud-count">{{ store.audienceCounts()[aud.id] ?? 0 }}</span>
          @if (aud.isDefault) {
            <span class="material-symbols-rounded star" matTooltip="Default">star</span>
          }
        </button>
      } @empty {
        <div class="none" (click)="$event.stopPropagation()">
          {{ query() ? 'No ' + tabLabel().toLowerCase() + ' match “' + query() + '”.' : 'No ' + tabLabel().toLowerCase() + ' yet.' }}
        </div>
      }
      <div class="menu-foot">
        <button mat-menu-item (click)="manage.emit(tab())">
          <span class="material-symbols-rounded">tune</span> Manage audiences
        </button>
      </div>
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 38px;
      padding: 0 10px 0 12px;
      border: 1px solid var(--pi-border-strong);
      border-radius: var(--pi-radius);
      background: var(--pi-surface);
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--pi-text);
      cursor: pointer;
      min-width: 0;
      max-width: 340px;
    }
    .trigger:hover {
      border-color: var(--pi-accent);
    }
    .lead {
      font-size: 19px;
      color: var(--pi-accent);
    }
    .label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .kind {
      font-weight: 500;
      color: var(--pi-text-2);
    }
    /* the refinement never truncates; the name gives way instead */
    .refine {
      flex-shrink: 0;
      white-space: nowrap;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--pi-accent-text);
    }
    .refine.mod {
      color: var(--pi-status-late);
    }
    .chev {
      font-size: 19px;
      color: var(--pi-text-3);
      margin-left: auto;
    }
    .update {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 38px;
      padding: 0 12px;
      border: 1px solid var(--pi-accent);
      border-radius: var(--pi-radius);
      background: var(--pi-accent-bg);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--pi-accent-text);
      cursor: pointer;
      white-space: nowrap;
    }
    .update:hover {
      background: var(--pi-accent);
      color: #fff;
    }
    .update .material-symbols-rounded {
      font-size: 18px;
    }
    /* narrow: the name keeps the room (the full label stays in the tooltip) */
    @media (max-width: 1200px) {
      .trigger {
        max-width: 240px;
      }
      .kind {
        display: none;
      }
      .update {
        padding: 0 10px;
      }
      .update .lbl {
        display: none;
      }
    }
    .menu-top {
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--pi-border);
      position: sticky;
      top: 0;
      background: var(--pi-surface);
      z-index: 1;
    }
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: none;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--pi-text-2);
      padding: 5px 8px;
      border-radius: 7px;
      cursor: pointer;
      white-space: nowrap;
    }
    .tab .material-symbols-rounded {
      font-size: 15px;
    }
    .tab.on {
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
    }
    .tab-count {
      font-size: 11px;
      color: var(--pi-text-3);
    }
    .search {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 9px;
      background: var(--pi-surface-3);
      border-radius: var(--pi-radius-sm);
    }
    .search .material-symbols-rounded {
      font-size: 17px;
      color: var(--pi-text-3);
    }
    .search input {
      flex: 1;
      min-width: 0;
      border: none;
      background: none;
      outline: none;
      font-family: inherit;
      font-size: 13px;
    }
    .none {
      padding: 14px 16px;
      font-size: 12.5px;
      color: var(--pi-text-3);
    }
    .all-ic {
      font-size: 17px;
      color: var(--pi-text-3);
    }
    .aud-item {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .aud-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .aud-count {
      font-size: 12px;
      color: var(--pi-text-3);
      font-variant-numeric: tabular-nums;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: transparent;
      border: 1.5px solid var(--pi-border-strong);
      flex-shrink: 0;
    }
    .dot.on {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
    }
    .star {
      font-size: 16px;
      color: #d8a200;
    }
    .menu-foot {
      border-top: 1px solid var(--pi-border);
      margin-top: 4px;
    }
  `,
})
export class AudienceSwitcherComponent {
  readonly store = inject(ParticipantStore);
  private readonly snack = inject(MatSnackBar);

  // emits the open tab, so Manage audiences opens on the same kind
  readonly manage = output<AudienceKind>();

  // Saved filters live in the filter rail's own block; this dropdown holds lists and segments.
  readonly kinds: { key: AudienceKind; label: string; icon: string }[] = [
    { key: 'list', label: 'Lists', icon: 'format_list_bulleted' },
    { key: 'segment', label: 'Segments', icon: 'donut_small' },
  ];

  readonly tab = signal<AudienceKind>('list');
  readonly query = signal('');

  readonly triggerTitle = computed(() => {
    const aud = this.store.audienceLabel();
    if (!aud) return 'All participants';
    return `${aud.kind}: ${aud.name}${aud.refinement ? ` · ${aud.refinement}` : ''}`;
  });

  readonly tabLabel = computed(() => this.kinds.find((k) => k.key === this.tab())?.label ?? '');

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.byKind(this.tab()).filter((a) => !q || a.name.toLowerCase().includes(q));
  });

  byKind(kind: AudienceKind): Audience[] {
    return this.store.audiences().filter((a) => a.kind === kind);
  }

  updateSavedFilter(): void {
    const aud = this.store.activeAudience();
    if (aud?.kind !== 'filter') return;
    this.store.updateAudienceFilter(aud.id);
    this.snack.open(`Updated "${aud.name}" with the current filters`, 'Dismiss', { duration: 3000 });
  }
}

// ================================================================================================
// Participant table
// ================================================================================================

export type SortDir = 'asc' | 'desc' | null;

// A–Z for labels: case-insensitive, numbers inside names in numeric order
const LABEL_ORDER = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

// Columns that show the last subscription's dates for non active / discontinued participants
const LAST_SUBSCRIPTION_KEYS = new Set(['subscriptionstart', 'subscriptionend']);

@Component({
  selector: 'app-participant-table',
  imports: [DecimalPipe, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <div class="skeleton">
        @for (r of [1,2,3,4,5,6,7,8,9,10]; track r) {
          <div class="sk-row">
            <span class="sk sk-cbx"></span>
            <span class="sk sk-avatar"></span>
            <span class="sk sk-line"></span>
            <span class="sk sk-pill"></span>
            <span class="sk sk-line short"></span>
          </div>
        }
      </div>
    } @else if (store.loadError()) {
      <div class="empty">
        <span class="material-symbols-rounded">cloud_off</span>
        <h3>Couldn't load participants</h3>
        <p>The data read failed — check you're signed in and have access to the participant collections.</p>
      </div>
    } @else if (rows().length === 0) {
      <div class="empty">
        <span class="material-symbols-rounded">filter_alt_off</span>
        <h3>No participants match these filters</h3>
        <p>Try removing a filter chip above, or reset to see the full base.</p>
      </div>
    } @else {
      <div class="table-scroll" #scroller>
        <div class="table-inner" [style.min-width.px]="minWidth()">
          <div class="thead" [style.grid-template-columns]="gridTemplate()">
            <div
              class="th th-select"
              [class.frozen]="isFrozen('select')"
              [class.frozen-edge]="lastFrozenKey() === 'select'"
              [style.left.px]="leftOf('select')"
            >
              <label class="cbx" (click)="$event.stopPropagation()">
                <input
                  type="checkbox"
                  aria-label="Select all participants"
                  [checked]="store.allFilteredSelected()"
                  (change)="store.toggleAllFiltered($any($event.target).checked)"
                />
                <span class="box"></span>
              </label>
            </div>
            @for (def of columnDefs(); track def.key) {
              <div
                class="th"
                [class.num]="def.type === 'number' || def.type === 'money'"
                [class.frozen]="isFrozen(def.key)"
                [class.frozen-edge]="lastFrozenKey() === def.key"
                [style.left.px]="leftOf(def.key)"
                (click)="toggleSort(def.key)"
              >
                <span class="th-label">{{ def.label }}</span>
                @if (sortKey() === def.key && sortDir(); as dir) {
                  <span class="material-symbols-rounded sort" [matTooltip]="sortBasis(def, dir)">{{ dir === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</span>
                }
              </div>
            }
          </div>

          <div class="tbody">
            @for (p of pageRows(); track p.profileid) {
            <div
              class="tr"
              [class.selected]="store.isSelected(p.profileid)"
              [style.grid-template-columns]="gridTemplate()"
              (click)="store.toggleOne(p.profileid)"
            >
              <div
                class="td td-select"
                [class.frozen]="isFrozen('select')"
                [class.frozen-edge]="lastFrozenKey() === 'select'"
                [style.left.px]="leftOf('select')"
                (click)="$event.stopPropagation()"
              >
                <label class="cbx">
                  <input type="checkbox" [attr.aria-label]="'Select ' + p.name" [checked]="store.isSelected(p.profileid)" (change)="store.toggleOne(p.profileid)" />
                  <span class="box"></span>
                </label>
              </div>

              @for (def of columnDefs(); track def.key) {
                <div
                  class="td"
                  [class.num]="def.type === 'number' || def.type === 'money'"
                  [class.frozen]="isFrozen(def.key)"
                  [class.frozen-edge]="lastFrozenKey() === def.key"
                  [style.left.px]="leftOf(def.key)"
                >
                  @switch (def.type) {
                  @case ('name') {
                    <span class="avatar">{{ initials(p) }}</span>
                    <span class="name-block">
                      <span class="name" (click)="openProfile(p, $event)">{{ p.name }}</span>
                      <span class="email" [title]="p.email">{{ p.email }}</span>
                    </span>
                    <span class="disc material-symbols-rounded" matTooltip="Open profile" (click)="openProfile(p, $event)">chevron_right</span>
                  }

                  @case ('status') {
                    @if (statusValue(p, def.key) === 'none') {
                      <span class="st muted"><span class="d"></span>—</span>
                    } @else {
                      <span class="st tone-{{ tone(statusValue(p, def.key)) }}"><span class="d"></span>{{ statusLabel(p, def.key) }}</span>
                    }
                  }

                  @case ('array') {
                    @if (arrayValues(p, def).length === 0) {
                      <span class="muted">—</span>
                    } @else if (def.resolve === 'product') {
                      <!-- products: grouped with counts, up to 3 lines -->
                      <span class="plist" [matTooltip]="productTooltip(p, def)" matTooltipClass="pi-multiline-tip">
                        @for (line of productLines(p, def).slice(0, 3); track line.name) {
                          <span class="pline">{{ line.name }} ({{ line.count }})</span>
                        }
                        @if (productLines(p, def).length > 3) {
                          <span class="pmore">+{{ productLines(p, def).length - 3 }} more</span>
                        }
                      </span>
                    } @else {
                      <span class="chips">
                        @for (v of arrayValues(p, def).slice(0, 2); track v) {
                          <span class="chip">{{ v }}</span>
                        }
                        @if (arrayValues(p, def).length > 2) {
                          <span class="chip more" [matTooltip]="arrayValues(p, def).join(', ')">+{{ arrayValues(p, def).length - 2 }}</span>
                        }
                      </span>
                    }
                  }

                  @case ('tags') {
                    @if (arrayValues(p, def).length === 0) {
                      <span class="muted">—</span>
                    } @else {
                      <span class="chips">
                        @for (v of arrayValues(p, def).slice(0, 3); track v) {
                          <span class="chip tag">{{ v }}</span>
                        }
                        @if (arrayValues(p, def).length > 3) {
                          <span class="chip tag more" [matTooltip]="arrayValues(p, def).join(', ')">+{{ arrayValues(p, def).length - 3 }}</span>
                        }
                      </span>
                    }
                  }

                  @case ('remarks') {
                    @if (p.remarks.length === 0) {
                      <span class="muted">—</span>
                    } @else {
                      <span class="remark" [matTooltip]="p.remarks[p.remarks.length - 1].note">
                        <span class="material-symbols-rounded">sticky_note_2</span>
                        {{ p.remarks.length }}
                      </span>
                    }
                  }

                  @case ('date') {
                    @if (isLastSubscriptionDate(p, def)) {
                      <span class="last-sub" matTooltip="Last subscription (not currently subscribed)">
                        {{ cellText(p, def) }} <span class="last-tag">· last</span>
                      </span>
                    } @else {
                      <span [class.muted]="cellText(p, def) === '—'">{{ cellText(p, def) }}</span>
                    }
                  }

                  @default {
                    <span [class.muted]="cellText(p, def) === '—'">{{ cellText(p, def) }}</span>
                  }
                  }
                </div>
              }
            </div>
            }
          </div>
        </div>
      </div>

      <!-- pager: only one page of rows is drawn; filters, sort and select-all cover every filtered row -->
      <div class="pager">
        <span class="range">{{ rangeStart() | number }}–{{ rangeEnd() | number }} of {{ rows().length | number }}</span>
        <label class="size">
          Rows per page
          <select data-testid="pi-page-size" (change)="setPageSize($any($event.target).value)">
            @for (n of pageSizes; track n) {
              <option [value]="n" [selected]="n === pageSize()">{{ n }}</option>
            }
          </select>
        </label>
        <div class="nav">
          <button data-testid="pi-page-first" [disabled]="pageIndex() === 0" (click)="goTo(0)" aria-label="First page">
            <span class="material-symbols-rounded">first_page</span>
          </button>
          <button data-testid="pi-page-prev" [disabled]="pageIndex() === 0" (click)="goTo(pageIndex() - 1)" aria-label="Previous page">
            <span class="material-symbols-rounded">chevron_left</span>
          </button>
          <span class="page-no">Page {{ pageIndex() + 1 }} of {{ pageCount() }}</span>
          <button data-testid="pi-page-next" [disabled]="pageIndex() >= pageCount() - 1" (click)="goTo(pageIndex() + 1)" aria-label="Next page">
            <span class="material-symbols-rounded">chevron_right</span>
          </button>
          <button data-testid="pi-page-last" [disabled]="pageIndex() >= pageCount() - 1" (click)="goTo(pageCount() - 1)" aria-label="Last page">
            <span class="material-symbols-rounded">last_page</span>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--pi-surface);
    }

    /* wraps rather than widening the frame on a narrow screen; only the rows scroll sideways */
    .pager {
      flex-shrink: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 18px;
      padding: 8px 14px;
      border-top: 1px solid var(--pi-border);
      background: var(--pi-surface-2);
      font-size: 12.5px;
      color: var(--pi-text-2);
    }
    .pager .range {
      font-variant-numeric: tabular-nums;
      color: var(--pi-text);
      font-weight: 500;
    }
    .pager .size {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }
    .pager select {
      font-family: inherit;
      font-size: 12.5px;
      border: 1px solid var(--pi-border-strong);
      border-radius: 6px;
      padding: 3px 6px;
      background: #fff;
    }
    .pager .nav {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .pager .nav button {
      border: none;
      background: none;
      color: var(--pi-text-2);
      cursor: pointer;
      display: inline-flex;
      padding: 3px;
      border-radius: 6px;
    }
    .pager .nav button:hover:not(:disabled) {
      background: var(--pi-surface-3);
      color: var(--pi-text);
    }
    .pager .nav button:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .pager .nav .material-symbols-rounded {
      font-size: 20px;
    }
    .pager .page-no {
      padding: 0 6px;
      font-variant-numeric: tabular-nums;
    }

    .table-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }

    .table-inner {
      display: block;
      min-height: 100%;
    }

    /* header */
    .thead {
      display: grid;
      align-items: center;
      height: 44px;
      border-bottom: 1px solid var(--pi-border);
      background: var(--pi-surface-2);
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .th {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--pi-text-2);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
    }
    .th:hover {
      color: var(--pi-text);
    }
    .th.num {
      justify-content: flex-end;
    }
    .th-select {
      justify-content: center;
      padding: 0;
      cursor: default;
    }
    .th .sort {
      font-size: 15px;
      color: var(--pi-accent);
    }

    /* body */
    .tbody {
      display: block;
    }

    .tr {
      display: grid;
      align-items: stretch;
      min-height: 46px;
      border-bottom: 0.5px solid var(--pi-border);
      cursor: pointer;
      transition: background 0.08s ease;
    }
    .tr:hover {
      background: var(--pi-surface-2);
    }
    .tr.selected {
      background: rgba(0, 122, 255, 0.07);
    }
    .tr.selected:hover {
      background: rgba(0, 122, 255, 0.1);
    }

    .td {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      font-size: 13px;
      color: var(--pi-text);
      min-width: 0;
      overflow: hidden;
    }
    .plist {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      line-height: 1.3;
    }
    .pline {
      font-size: 12.5px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .pmore {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--pi-accent-text);
    }
    .td.num {
      justify-content: flex-end;
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum';
    }
    .td-select {
      justify-content: center;
      padding: 0;
    }
    .muted {
      color: var(--pi-text-3);
    }
    .last-sub {
      white-space: nowrap;
      color: var(--pi-text-2);
    }
    .last-tag {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--pi-text-3);
    }

    /* frozen (sticky-left) columns */
    .th.frozen,
    .td.frozen {
      position: sticky;
      z-index: 2;
    }
    .thead .th.frozen {
      z-index: 4;
      background: var(--pi-surface-2);
    }
    .td.frozen {
      background: var(--pi-surface);
    }
    .tr:hover .td.frozen {
      background: var(--pi-surface-3);
    }
    .tr.selected .td.frozen {
      background: var(--pi-accent-bg);
    }
    .tr.selected:hover .td.frozen {
      background: #d2e9e9;
    }
    .frozen-edge {
      box-shadow: 6px 0 8px -6px rgba(20, 30, 40, 0.22);
    }

    /* checkbox */
    .cbx {
      position: relative;
      display: inline-flex;
      cursor: pointer;
    }
    .cbx input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    .cbx .box {
      width: 17px;
      height: 17px;
      border: 1.5px solid var(--pi-border-strong);
      border-radius: 5px;
      background: #fff;
      display: inline-block;
      position: relative;
      transition: all 0.12s ease;
    }
    .cbx input:checked + .box {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
    }
    .cbx input:checked + .box::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 1.5px;
      width: 4px;
      height: 9px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    /* name cell — neutral iOS avatar + link-on-hover + disclosure chevron */
    .avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--pi-fill);
      color: var(--pi-text-2);
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .name-block {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.25;
    }
    .name {
      font-weight: 600;
      font-size: 13.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tr:hover .name {
      color: var(--pi-accent);
    }
    .email {
      font-size: 11px;
      color: var(--pi-text-3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .disc {
      margin-left: auto;
      color: var(--pi-text-3);
      font-size: 19px;
      opacity: 0;
      transition: opacity 0.12s ease;
      flex-shrink: 0;
    }
    .tr:hover .disc {
      opacity: 1;
    }
    .disc:hover {
      color: var(--pi-accent);
    }

    /* calm status — colored dot + neutral text (iOS) */
    .st {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 13px;
      color: var(--pi-text);
    }
    .st .d {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--pi-status-none);
    }
    .st.muted {
      color: var(--pi-text-3);
    }
    .st.tone-active .d {
      background: var(--pi-status-active);
    }
    .st.tone-late .d {
      background: var(--pi-status-late);
    }
    .st.tone-discontinued .d {
      background: var(--pi-status-discontinued);
    }
    .st.tone-banned .d {
      background: var(--pi-status-banned);
    }
    .st.tone-none .d {
      background: var(--pi-status-none);
    }

    /* chips */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      min-width: 0;
    }
    .chip {
      font-size: 11.5px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--pi-surface-3);
      color: var(--pi-text-2);
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .chip.more {
      background: #e7ebef;
      color: var(--pi-text-2);
      cursor: default;
    }
    .chip.tag {
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
    }

    .remark {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12.5px;
      color: var(--pi-text-2);
    }
    .remark .material-symbols-rounded {
      font-size: 16px;
      color: var(--pi-accent-2);
    }

    /* skeleton */
    .skeleton {
      padding: 8px 0;
    }
    .sk-row {
      display: flex;
      align-items: center;
      gap: 16px;
      height: 52px;
      padding: 0 18px;
    }
    .sk {
      display: inline-block;
      border-radius: 6px;
      background: linear-gradient(90deg, #eef1f4 25%, #e3e8ec 37%, #eef1f4 63%);
      background-size: 400% 100%;
      animation: sh 1.3s ease infinite;
    }
    .sk-cbx {
      width: 17px;
      height: 17px;
      border-radius: 5px;
    }
    .sk-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
    }
    .sk-line {
      height: 12px;
      width: 220px;
    }
    .sk-line.short {
      width: 90px;
    }
    .sk-pill {
      height: 18px;
      width: 70px;
      border-radius: 999px;
    }
    @keyframes sh {
      0% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0 50%;
      }
    }

    /* empty */
    .empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--pi-text-2);
      padding: 60px 20px;
    }
    .empty .material-symbols-rounded {
      font-size: 44px;
      color: var(--pi-text-3);
      margin-bottom: 12px;
    }
    .empty h3 {
      margin: 0 0 6px;
      font-size: 16px;
      font-weight: 600;
      color: var(--pi-text);
    }
    .empty p {
      margin: 0;
      font-size: 13.5px;
    }
  `,
})
export class ParticipantTableComponent {
  readonly store = inject(ParticipantStore);

  readonly sortKey = signal<string>('name');
  readonly sortDir = signal<SortDir>('asc');

  private readonly journeyMap = computed(() => toNameMap(this.store.reference().journeys));
  private readonly productMap = computed(() => toNameMap(this.store.reference().products));
  private readonly tierMap = computed(() => toNameMap(this.store.reference().tiers));
  private readonly modeMap = computed(() => toNameMap(this.store.reference().modes));
  private readonly tagMap = computed(() => toNameMap(this.store.reference().tags));

  readonly columnDefs = computed<ColumnDef[]>(() =>
    this.store.displayedColumns().filter((k) => k !== 'select').map((k) => COLUMN_DEF_MAP[k])
  );

  // Width per column, sized to its content. Rows are separate grids, so widths must be fixed to
  // keep columns aligned; only the last column stretches to take up spare space.
  private colWidth(c: string): number {
    if (c === 'select') return 44;
    if (c === 'name') return 250;
    const def = COLUMN_DEF_MAP[c];
    if (!def) return 150;
    if (def.resolve === 'product' || def.resolve === 'playlist') return 280;
    if (def.type === 'tags') return 230;
    if (def.type === 'number') return 96;
    if (def.type === 'money') return 120;
    if (LAST_SUBSCRIPTION_KEYS.has(c)) return 150; // room for "<date> · last"
    if (def.type === 'date') return 124;
    if (def.type === 'status') return 132;
    if (def.type === 'remarks') return 96;
    if (c === 'email') return 230;
    return 160;
  }

  // Frozen (sticky-left) columns = the select column + any pinned columns, taken contiguously
  // from the front of displayedColumns. Maps each frozen column key to its left offset in px.
  readonly frozenLefts = computed<Record<string, number>>(() => {
    const cols = this.store.displayedColumns();
    const pin = this.store.pinned();
    const map: Record<string, number> = {};
    if (!pin.size) return map; // nothing pinned: the checkbox column scrolls with the rest too
    let left = 0;
    for (const c of cols) {
      if (c !== 'select' && !pin.has(c)) break;
      map[c] = left;
      left += this.colWidth(c);
    }
    return map;
  });

  readonly lastFrozenKey = computed<string | null>(() => {
    const keys = Object.keys(this.frozenLefts());
    return keys.length ? keys[keys.length - 1] : null;
  });

  isFrozen(c: string): boolean {
    return c in this.frozenLefts();
  }
  leftOf(c: string): number {
    return this.frozenLefts()[c] ?? 0;
  }

  // Profile drill-down — opens the participant's profile in a new tab (without toggling row selection).
  openProfile(p: Participant, ev?: Event): void {
    ev?.stopPropagation();
    window.open(`/userprofile/${p.profileid}`, '_blank');
  }

  readonly gridTemplate = computed(() => {
    const cols = this.store.displayedColumns();
    const frozen = this.frozenLefts();
    return cols
      .map((c, i) => (i === cols.length - 1 && !(c in frozen) ? `minmax(${this.colWidth(c)}px, 1fr)` : `${this.colWidth(c)}px`))
      .join(' ');
  });

  readonly minWidth = computed(() => this.store.displayedColumns().reduce((w, c) => w + this.colWidth(c), 0));

  // sort value computed once per row, not on every comparison; blanks go last in both directions
  readonly rows = computed<Participant[]>(() => {
    const data = this.store.filtered();
    const def = COLUMN_DEF_MAP[this.sortKey()];
    const dir = this.sortDir();
    if (!dir || !def) return data;
    const sign = dir === 'asc' ? 1 : -1;
    return data
      .map((p) => ({ p, v: this.sortValue(p, def) }))
      .sort((a, b) => {
        if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? 0 : 1) : -1;
        const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : LABEL_ORDER.compare(String(a.v), String(b.v));
        return c * sign;
      })
      .map((x) => x.p);
  });

  // ---- pagination ----
  readonly pageSizes = [25, 50, 100, 200];
  readonly pageSize = signal(50);
  readonly pageIndex = signal(0);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.rows().length / this.pageSize())));
  readonly pageRows = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
  });
  readonly rangeStart = computed(() => (this.rows().length ? this.pageIndex() * this.pageSize() + 1 : 0));
  readonly rangeEnd = computed(() => Math.min(this.rows().length, (this.pageIndex() + 1) * this.pageSize()));

  constructor() {
    // back to page 1 whenever the filtered / sorted rows change
    effect(() => {
      this.rows();
      untracked(() => this.goTo(0));
    });
  }

  goTo(index: number): void {
    this.pageIndex.set(Math.min(Math.max(0, index), this.pageCount() - 1));
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTop = 0;
  }

  setPageSize(value: string): void {
    this.pageSize.set(Number(value) || 50);
    this.goTo(0);
  }

  toggleSort(key: string): void {
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDir.set('asc');
      return;
    }
    const cur = this.sortDir();
    this.sortDir.set(cur === 'asc' ? 'desc' : cur === 'desc' ? null : 'asc');
  }

  // What a column sorts by (null = blank): numbers / money / dates by value, remarks by count, lists by
  // the first item shown (products in their shown order, most held first), everything else by its label.
  private sortValue(p: Participant, def: ColumnDef): string | number | null {
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    switch (def.type) {
      case 'number':
      case 'money':
        return raw == null ? null : Number(raw);
      case 'date': {
        // a stored date that doesn't parse is a blank, so it sorts last instead of breaking the order
        const t = raw ? new Date(raw as string).getTime() : NaN;
        return Number.isNaN(t) ? null : t;
      }
      case 'remarks':
        return p.remarks.length || null;
      case 'array':
      case 'tags':
        return (def.resolve === 'product' ? this.productLines(p, def)[0]?.name : this.arrayValues(p, def)[0]) ?? null;
      case 'status':
        return this.statusValue(p, def.key) === 'none' ? null : this.statusLabel(p, def.key);
      default: {
        const text = this.cellText(p, def);
        return text === '—' || text === '' ? null : text;
      }
    }
  }

  // Header tooltip naming what the sorted column is ordered by, in the current direction.
  sortBasis(def: ColumnDef, dir: 'asc' | 'desc'): string {
    const asc = dir === 'asc';
    const az = asc ? 'A–Z' : 'Z–A';
    const item: Record<string, string> = { product: 'product (most held first)', tag: 'tag', tier: 'tier', playlist: 'playlist' };
    let basis: string;
    switch (def.type) {
      case 'number':
      case 'money':
        basis = `by value, ${asc ? 'lowest' : 'highest'} first`;
        break;
      case 'date':
        basis = `by date, ${asc ? 'oldest' : 'newest'} first`;
        break;
      case 'remarks':
        basis = `by number of remarks, ${asc ? 'fewest' : 'most'} first`;
        break;
      case 'array':
      case 'tags':
        basis = `by the first ${item[def.resolve ?? ''] ?? 'item'} shown, ${az}`;
        break;
      default:
        basis = az;
    }
    return `Sorted ${basis}; blanks last`;
  }

  // Subscription start / end cells holding the last (not the current) subscription's date
  isLastSubscriptionDate(p: Participant, def: ColumnDef): boolean {
    return p.isLastSubscription && LAST_SUBSCRIPTION_KEYS.has(def.key) && !!(p as unknown as Record<string, unknown>)[def.key];
  }

  private resolve(resolve: ColumnDef['resolve'], id: string): string {
    switch (resolve) {
      case 'journey':
        return this.journeyMap()[id] ?? id;
      case 'product':
        return this.productMap()[id] ?? id;
      case 'tier':
        return this.tierMap()[id] ?? id;
      case 'mode':
        return this.modeMap()[id] ?? id;
      case 'tag':
        return this.tagMap()[id] ?? id;
      case 'playlist':
        return this.store.playlistNames()[id] ?? id;
      default:
        return id;
    }
  }

  // cell rendering helpers
  initials(p: Participant): string {
    return p.name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  // Product ids grouped by name with counts, most frequent first. Cached per participant object
  // (rows are replaced, not mutated, when their data changes).
  private readonly productLineCache = new WeakMap<Participant, Record<string, { name: string; count: number }[]>>();

  productLines(p: Participant, def: ColumnDef): { name: string; count: number }[] {
    const cached = this.productLineCache.get(p) ?? {};
    if (!cached[def.key]) {
      const counts = new Map<string, number>();
      for (const name of this.arrayValues(p, def)) counts.set(name, (counts.get(name) ?? 0) + 1);
      cached[def.key] = [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      this.productLineCache.set(p, cached);
    }
    return cached[def.key];
  }

  productTooltip(p: Participant, def: ColumnDef): string {
    return this.productLines(p, def)
      .map((l) => `${l.name} (${l.count})`)
      .join('\n');
  }

  arrayValues(p: Participant, def: ColumnDef): string[] {
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    if (!Array.isArray(raw)) return [];
    return (raw as string[]).map((id) => this.resolve(def.resolve, id));
  }

  cellText(p: Participant, def: ColumnDef): string {
    if (!def) return '';
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    if (def.type === 'date') return raw ? this.formatDate(raw as string) : '—';
    if (def.type === 'number') return raw == null ? '—' : String(raw);
    if (def.type === 'money') return raw == null ? '—' : Number(raw).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    if (def.resolve && typeof raw === 'string') return this.resolve(def.resolve, raw);
    if (def.key === 'customersupport') return p.customersupport.status === 'none' ? '—' : p.customersupport.status;
    if (def.key === 'registered') return p.registered ? 'Registered' : 'Guest';
    return raw == null || raw === 'none' ? '—' : String(raw);
  }

  statusValue(p: Participant, key: string): string {
    if (key === 'registered') return p.registered ? 'registered' : 'guest';
    if (key === 'customersupport') return p.customersupport.status;
    return String((p as unknown as Record<string, unknown>)[key] ?? 'none');
  }

  statusLabel(p: Participant, key: string): string {
    const v = this.statusValue(p, key);
    if (v === 'registered') return 'Registered';
    if (v === 'guest') return 'Guest';
    if (v === 'none') return '—';
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  tone(value: string): string {
    switch (value) {
      case 'active':
      case 'regular':
      case 'fully paid':
      case 'on-track':
      case 'registered':
        return 'active';
      case 'late':
      case 'locked':
      case 'overdue':
      case 'Open':
        return 'late';
      case 'banned':
      case 'defaulted':
        return 'banned';
      case 'completed':
      case 'Closed':
        return 'discontinued';
      case 'none':
      case 'guest':
        return 'none';
      default:
        return 'discontinued';
    }
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

}

// ================================================================================================
// Bulk action bar
// ================================================================================================

export type BulkAction =
  | 'email'
  | 'whatsapp'
  | 'notify'
  | 'watiMessages'
  | 'broadcast'
  | 'watiConfig'
  | 'tag'
  | 'addToList'
  | 'manageLists'
  | 'playlist'
  | 'viewRecommended'
  | 'interim'
  | 'wishlist'
  | 'appActionPending'
  | 'remarks'
  | 'subscription'
  | 'products'
  | 'evolution'
  | 'exportSelection'
  | 'exportTable'
  | 'contentConsumption';

@Component({
  selector: 'app-bulk-action-bar',
  imports: [MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.selectedCount() > 0) {
      <div class="bar">
        <div class="count">
          <span class="num">{{ store.selectedCount() }}</span>
          <span>selected</span>
          @if (store.hiddenSelectedCount() > 0) {
            <span class="hidden">{{ store.hiddenSelectedCount() }} hidden by filters</span>
          }
          <button class="link" (click)="store.clearSelection()">Clear</button>
        </div>

        <div class="actions">
          <button data-testid="pi-bulk-comm" class="act" [matMenuTriggerFor]="comm">
            <span class="material-symbols-rounded">campaign</span> Communication
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button data-testid="pi-bulk-org" class="act" [matMenuTriggerFor]="org">
            <span class="material-symbols-rounded">label</span> Organize
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button data-testid="pi-bulk-app" class="act" [matMenuTriggerFor]="app">
            <span class="material-symbols-rounded">smartphone</span> App Actions
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button data-testid="pi-bulk-upd" class="act" [matMenuTriggerFor]="upd">
            <span class="material-symbols-rounded">edit_note</span> Update
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button data-testid="pi-bulk-reports" class="act primary" [matMenuTriggerFor]="reports">
            <span class="material-symbols-rounded">summarize</span> Reports
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
        </div>
      </div>

      <mat-menu #comm="matMenu">
        <button data-testid="pi-bulk-email" mat-menu-item (click)="action.emit('email')">
          <span class="material-symbols-rounded mi">mail</span> Send Email
        </button>
        <button data-testid="pi-bulk-whatsapp" mat-menu-item (click)="action.emit('whatsapp')">
          <span class="material-symbols-rounded mi">chat</span> Send WhatsApp
        </button>
        <button data-testid="pi-bulk-notify" mat-menu-item (click)="action.emit('notify')">
          <span class="material-symbols-rounded mi">notifications</span> Send In-App Notification
        </button>
        <button data-testid="pi-bulk-wati-messages" mat-menu-item (click)="action.emit('watiMessages')">
          <span class="material-symbols-rounded mi">forum</span> Send Wati Messages
        </button>
        <button data-testid="pi-bulk-broadcast" mat-menu-item (click)="action.emit('broadcast')">
          <span class="material-symbols-rounded mi">podcasts</span> Send Broadcast in Breakthroughs
        </button>
        <button data-testid="pi-bulk-wati-config" mat-menu-item (click)="action.emit('watiConfig')">
          <span class="material-symbols-rounded mi">settings</span> Wati Configuration
        </button>
      </mat-menu>

      <mat-menu #org="matMenu">
        <button data-testid="pi-bulk-tags" mat-menu-item (click)="action.emit('tag')">
          <span class="material-symbols-rounded mi">sell</span> Manage Tags
        </button>
        <button data-testid="pi-bulk-make-list" mat-menu-item (click)="action.emit('addToList')">
          <span class="material-symbols-rounded mi">playlist_add</span> Make as List
        </button>
        <button data-testid="pi-bulk-manage-lists" mat-menu-item (click)="action.emit('manageLists')">
          <span class="material-symbols-rounded mi">format_list_bulleted</span> Manage Lists &amp; Segments
        </button>
      </mat-menu>

      <mat-menu #app="matMenu">
        <button data-testid="pi-bulk-recommend" mat-menu-item (click)="action.emit('playlist')">
          <span class="material-symbols-rounded mi">queue_music</span> Recommend Playlist
        </button>
        <button data-testid="pi-bulk-view-recommended" mat-menu-item (click)="action.emit('viewRecommended')">
          <span class="material-symbols-rounded mi">visibility</span> View Recommended
        </button>
        <button data-testid="pi-bulk-interim" mat-menu-item (click)="action.emit('interim')">
          <span class="material-symbols-rounded mi">description</span> Manage Interim Report
        </button>
        <button data-testid="pi-bulk-wishlist" mat-menu-item (click)="action.emit('wishlist')">
          <span class="material-symbols-rounded mi">favorite</span> Manage Evolution Wishlist
        </button>
        <button data-testid="pi-bulk-app-action-pending" mat-menu-item (click)="action.emit('appActionPending')">
          <span class="material-symbols-rounded mi">pending_actions</span> App Action Pending
        </button>
      </mat-menu>

      <mat-menu #upd="matMenu">
        <button data-testid="pi-bulk-remarks" mat-menu-item (click)="action.emit('remarks')">
          <span class="material-symbols-rounded mi">sticky_note_2</span> Add Remarks
        </button>
        <button data-testid="pi-bulk-subscription" mat-menu-item (click)="action.emit('subscription')">
          <span class="material-symbols-rounded mi">event_repeat</span> Extend Subscription
        </button>
        <button data-testid="pi-bulk-add-product" mat-menu-item (click)="action.emit('products')">
          <span class="material-symbols-rounded mi">inventory_2</span> Add Product
        </button>
      </mat-menu>

      <mat-menu #reports="matMenu">
        <button data-testid="pi-bulk-evolution" mat-menu-item (click)="action.emit('evolution')">
          <span class="material-symbols-rounded mi">insights</span> Participant Evolution Summary
        </button>
        <button data-testid="pi-bulk-export-selection" mat-menu-item (click)="action.emit('exportSelection')">
          <span class="material-symbols-rounded mi">download</span> Export Selection
        </button>
        <button data-testid="pi-bulk-export-table" mat-menu-item (click)="action.emit('exportTable')">
          <span class="material-symbols-rounded mi">table_view</span> Export Table
        </button>
        <button data-testid="pi-bulk-content" mat-menu-item (click)="action.emit('contentConsumption')">
          <span class="material-symbols-rounded mi">play_circle</span> Content Consumption
        </button>
      </mat-menu>
    }
  `,
  styles: `
    .bar {
      position: absolute;
      left: 50%;
      bottom: 22px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 9px 12px 9px 18px;
      background: #16222e;
      color: #fff;
      border-radius: 14px;
      box-shadow: var(--pi-shadow-lg);
      z-index: 40;
      animation: rise 0.18s ease;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translate(-50%, 8px);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    }
    .count {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 13.5px;
      color: #c4ced8;
      white-space: nowrap;
    }
    .hidden {
      font-size: 11.5px;
      color: #f0b34a;
      background: rgba(240, 149, 0, 0.16);
      padding: 2px 8px;
      border-radius: 999px;
    }
    .num {
      background: var(--pi-accent-2);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 2px 9px;
      border-radius: 999px;
    }
    .link {
      border: none;
      background: none;
      color: #8fb6c0;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      padding: 0 2px;
    }
    .link:hover {
      color: #fff;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 6px;
      border-left: 1px solid #2c3a48;
      padding-left: 14px;
    }
    .act {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 12px;
      border: none;
      border-radius: 9px;
      background: transparent;
      color: #e6edf3;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.1s ease;
      white-space: nowrap;
    }
    .act:hover {
      background: #243341;
    }
    .act .material-symbols-rounded {
      font-size: 18px;
    }
    .act .chev {
      font-size: 16px;
      opacity: 0.6;
      margin-left: -2px;
    }
    .act.primary {
      background: var(--pi-accent-2);
    }
    .act.primary:hover {
      background: #0fa0a4;
    }
    .mi {
      margin-right: 8px;
      font-size: 19px;
      vertical-align: middle;
      color: var(--pi-text-2);
    }
  `,
})
export class BulkActionBarComponent {
  readonly store = inject(ParticipantStore);
  readonly action = output<BulkAction>();
}

// ================================================================================================
// Column config
// ================================================================================================

@Component({
  selector: 'app-column-config',
  imports: [MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="tbtn" [matMenuTriggerFor]="menu" matTooltip="Configure columns">
      <span class="material-symbols-rounded">view_column</span>
      <span class="lbl">Columns</span>
    </button>

    <mat-menu #menu="matMenu" class="col-menu" (closed)="query.set('')">
      <div class="head" (click)="$event.stopPropagation()">
        <span>Visible columns</span>
        <button class="reset" (click)="store.resetColumns()">Reset</button>
      </div>
      <div class="list" (click)="$event.stopPropagation()">
        @for (key of store.columnOrder(); track key) {
          <div class="row">
            <span class="name">{{ label(key) }}</span>
            <div class="row-actions">
              <button class="ic" [class.on]="store.pinned().has(key)" matTooltip="Pin to front" (click)="store.togglePin(key)" [disabled]="key === 'name'">
                <span class="material-symbols-rounded">push_pin</span>
              </button>
              <button class="ic" matTooltip="Move up" (click)="store.moveColumn(key, -1)">
                <span class="material-symbols-rounded">arrow_upward</span>
              </button>
              <button class="ic" matTooltip="Move down" (click)="store.moveColumn(key, 1)">
                <span class="material-symbols-rounded">arrow_downward</span>
              </button>
              <button class="ic del" matTooltip="Remove" (click)="store.removeColumn(key)" [disabled]="key === 'name'">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          </div>
        }
      </div>
      @if (store.availableColumns().length) {
        <div class="head sub" (click)="$event.stopPropagation()">Add column</div>
        <!-- keys stay in the input (the menu's typeahead would move focus), except Escape, which closes the
             menu; clicks never reach the menu panel, so it stays open while several columns are added -->
        <div class="col-search" (click)="$event.stopPropagation()" (keydown)="$event.key !== 'Escape' && $event.stopPropagation()">
          <span class="material-symbols-rounded">search</span>
          <input data-testid="pi-col-search" type="text" placeholder="Search columns…" [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
        <div class="add-list" (click)="$event.stopPropagation()">
          @for (def of available(); track def.key) {
            <button class="add" (click)="store.addColumn(def.key)">
              <span class="material-symbols-rounded">add</span>{{ def.label }}
            </button>
          } @empty {
            <div class="none">No columns match “{{ query() }}”.</div>
          }
        </div>
      }
    </mat-menu>
  `,
  styles: `
    .tbtn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 38px;
      padding: 0 12px;
      border: 1px solid var(--pi-border-strong);
      border-radius: var(--pi-radius);
      background: var(--pi-surface);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--pi-text);
      cursor: pointer;
    }
    .tbtn:hover {
      border-color: var(--pi-accent);
    }
    .tbtn .material-symbols-rounded {
      font-size: 19px;
      color: var(--pi-text-2);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--pi-text-3);
      padding: 12px 16px 6px;
    }
    .head.sub {
      border-top: 1px solid var(--pi-border);
      margin-top: 4px;
    }
    .reset {
      border: none;
      background: none;
      color: var(--pi-accent);
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .list,
    .add-list {
      max-height: 300px;
      overflow-y: auto;
      padding: 0 8px 6px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      border-radius: 7px;
    }
    .row:hover {
      background: var(--pi-surface-3);
    }
    .name {
      font-size: 13px;
      color: var(--pi-text);
    }
    .row-actions {
      display: flex;
      gap: 1px;
    }
    .ic {
      border: none;
      background: none;
      color: var(--pi-text-3);
      cursor: pointer;
      padding: 3px;
      display: inline-flex;
      border-radius: 5px;
    }
    .ic:hover:not(:disabled) {
      color: var(--pi-text);
      background: #e7ebef;
    }
    .ic.on {
      color: var(--pi-accent);
    }
    .ic.del:hover:not(:disabled) {
      color: var(--pi-status-banned);
    }
    .ic:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .ic .material-symbols-rounded {
      font-size: 16px;
    }
    .add {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      border: none;
      background: none;
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text-2);
      padding: 6px 8px;
      border-radius: 7px;
      cursor: pointer;
      text-align: left;
    }
    .add:hover {
      background: var(--pi-accent-bg);
      color: var(--pi-accent-text);
    }
    .add .material-symbols-rounded {
      font-size: 16px;
    }
    .col-search {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      margin: 2px 16px 6px;
      padding: 0 9px;
      background: var(--pi-surface-3);
      border-radius: var(--pi-radius-sm);
    }
    .col-search .material-symbols-rounded {
      font-size: 17px;
      color: var(--pi-text-3);
    }
    .col-search input {
      flex: 1;
      min-width: 0;
      border: none;
      background: none;
      outline: none;
      font-family: inherit;
      font-size: 13px;
    }
    .none {
      padding: 8px;
      font-size: 12.5px;
      color: var(--pi-text-3);
    }
    @media (max-width: 1200px) {
      .tbtn {
        padding: 0 10px;
      }
      .tbtn .lbl {
        display: none;
      }
    }
  `,
})
export class ColumnConfigComponent {
  readonly store = inject(ParticipantStore);
  readonly query = signal('');
  readonly available = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.store.availableColumns();
    return q ? all.filter((c) => c.label.toLowerCase().includes(q)) : all;
  });

  label(key: string): string {
    return COLUMN_DEF_MAP[key]?.label ?? key;
  }
}

// ================================================================================================
// Signals panel
// ================================================================================================

@Component({
  selector: 'app-signals-panel',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
    <div class="panel">
      @for (cat of categories; track cat.key) {
        <div class="cat">
          <span class="cat-head">{{ cat.label }}</span>
          <div class="cards">
            @for (s of byCat(cat.key); track s.id) {
              <button
                class="card sev-{{ s.severity }}"
                [class.active]="store.signalId() === s.id"
                [class.empty]="count(s.id) === 0"
                [disabled]="count(s.id) === 0"
                [title]="s.description"
                (click)="store.applySignal(s.id)"
              >
                <span class="count">{{ count(s.id) | number }}</span>
                <span class="label">{{ s.label }}</span>
              </button>
            }
          </div>
        </div>
      }
    </div>
    <button data-testid="pi-insights-minimize" class="min" title="Minimise insights" (click)="minimize.emit()">
      <span class="material-symbols-rounded">expand_less</span>
    </button>
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      background: var(--pi-surface-2);
      border-bottom: 1px solid var(--pi-border);
    }
    .panel {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      gap: 22px;
      padding: 14px 18px;
      overflow-x: auto;
    }
    .min {
      flex-shrink: 0;
      align-self: flex-start;
      margin: 10px 10px 0 0;
      border: none;
      background: none;
      color: var(--pi-text-3);
      cursor: pointer;
      display: inline-flex;
      padding: 3px;
      border-radius: 6px;
    }
    .min:hover {
      background: var(--pi-surface-3);
      color: var(--pi-text);
    }
    .cat {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }
    .cat-head {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--pi-text-3);
    }
    .cards {
      display: flex;
      gap: 8px;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      width: 132px;
      min-height: 64px;
      padding: 9px 11px 10px;
      border: 1px solid var(--pi-border);
      border-left: 3px solid var(--pi-border-strong);
      border-radius: var(--pi-radius);
      background: var(--pi-surface);
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      transition: all 0.1s ease;
    }
    .card:hover:not(:disabled) {
      border-color: var(--pi-accent);
      box-shadow: var(--pi-shadow-sm);
    }
    .card.active {
      border-color: var(--pi-accent);
      background: var(--pi-accent-bg);
      box-shadow: 0 0 0 1px var(--pi-accent);
    }
    .card.empty {
      cursor: default;
      opacity: 0.5;
    }
    .count {
      font-size: 19px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--pi-text);
    }
    .label {
      font-size: 11.5px;
      font-weight: 500;
      line-height: 1.25;
      color: var(--pi-text-2);
    }
    .sev-critical {
      border-left-color: var(--pi-status-banned);
    }
    .sev-warn {
      border-left-color: var(--pi-status-late);
    }
    .sev-opportunity {
      border-left-color: var(--pi-accent);
    }
    .card.empty .count {
      color: var(--pi-text-3);
    }
  `,
})
export class SignalsPanelComponent {
  readonly store = inject(ParticipantStore);
  readonly minimize = output<void>();
  // categories with no cards (e.g. Financial) are hidden
  readonly categories = SIGNAL_CATEGORIES.filter((c) => SIGNALS.some((s) => s.category === c.key));

  byCat(cat: SignalCategory): SignalDef[] {
    return SIGNALS.filter((s) => s.category === cat);
  }
  count(id: string): number {
    return this.store.signalCounts()[id] ?? 0;
  }
}

// ================================================================================================
// Page component
// ================================================================================================

// "Send Wati Messages" cloud function per Firebase project (as analytics' getWhatsAppFunctionUrl)
const WHATSAPP_FUNCTION_URL: Record<string, string> = {
  'test-environment-841c3': 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage',
  'starlabs-test': 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage',
  'fir-sample-aae4a': 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage',
};
const WHATSAPP_CHUNK_SIZE = 200;
const WHATSAPP_CHUNK_DELAY_MS = 1000;

// One export cell: ids resolved to names, dates as yyyy-mm-dd, lists joined.
function exportValue(p: Participant, def: ColumnDef, names: Record<string, Record<string, string>>): string | number {
  const raw = (p as unknown as Record<string, unknown>)[def.key];
  const name = (id: string) => (def.resolve ? names[def.resolve]?.[id] ?? id : id);
  switch (def.key) {
    case 'registered':
      return p.registered ? 'Registered' : 'Guest';
    case 'customersupport':
      return p.customersupport.status === 'none' ? '' : p.customersupport.status;
    case 'remarks':
      return p.remarks.map((r) => r.note).join(' | ');
  }
  if (raw == null || raw === 'none') return '';
  if (Array.isArray(raw)) return (raw as string[]).map(name).join(', ');
  if (def.type === 'date') return String(raw).slice(0, 10);
  if (typeof raw === 'number') return raw;
  return name(String(raw));
}

@Component({
  selector: 'app-participant-intelligence',
  imports: [
    DecimalPipe,
    FormsModule,
    MatMenuModule,
    MatTooltipModule,
    FilterRailComponent,
    ActiveFilterChipsComponent,
    AudienceSwitcherComponent,
    ParticipantTableComponent,
    BulkActionBarComponent,
    ColumnConfigComponent,
    SignalsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-intelligence.component.html',
  styleUrl: './participant-intelligence.component.css',
  providers: [ParticipantStore, ParticipantDataService],
})
export class ParticipantIntelligenceComponent implements OnInit {
  readonly store = inject(ParticipantStore);
  private readonly data = inject(ParticipantDataService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly injector = inject(Injector);
  private readonly firestore = inject(Firestore);
  private readonly http = inject(HttpClient);
  private readonly authguard = inject(AuthguardService);

  // dialogs that inject ParticipantStore must resolve THIS screen's store instance
  private dlg(width: string): MatDialogConfig {
    return { panelClass: 'pi-dialog', width, injector: this.injector };
  }

  readonly railOpen = signal(true);
  readonly insightsOpen = signal(true);
  readonly checklists = CHECKLISTS;
  readonly watsonChecklists = WATSON_CHECKLISTS;

  ngOnInit(): void {
    this.store.init();
  }

  openChecklist(def: ChecklistDef): void {
    const participants = def.wired && def.predicate ? this.store.all().filter(def.predicate) : [];
    this.dialog.open(ChecklistViewerDialogComponent, { ...this.dlg('720px'), data: { def, participants } });
  }

  get search(): string {
    return this.store.filter().search;
  }
  set search(v: string) {
    this.store.setSearch(v);
  }

  // Notification record screen in a new tab
  openNotificationRecord(): void {
    window.open('/notificationrecord', '_blank');
  }

  refresh(): void {
    this.store.init();
    this.snack.open('Refreshed', '', { duration: 1500 });
  }

  saveAudience(): void {
    this.dialog
      .open(PromptDialogComponent, {
        ...this.dlg('440px'),
        data: {
          title: 'Save filter',
          subtitle: `${this.store.filteredCount()} participants match the current filter.`,
          label: 'Filter name',
          placeholder: 'e.g. Active gold-tier renewals',
          confirmText: 'Save filter',
          icon: 'bookmark_add',
          validate: (v: string) => (this.store.nameTaken('filter', v) ? `A saved filter named “${v}” already exists.` : null),
        } as PromptData,
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (name) {
          this.store.saveCurrentAsAudience(name);
          this.snack.open(`Saved filter "${name}"`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  // The rail's Saved filters block opens it on Saved filters; the audience dropdown on its own tab.
  openManageAudiences(tab: AudienceKind = 'filter'): void {
    this.dialog.open(ManageAudiencesDialogComponent, { ...this.dlg('720px'), data: { tab } as ManageAudiencesData });
  }

  // ---- bulk actions ----
  handleBulk(action: BulkAction): void {
    // actions that don't need a selection
    switch (action) {
      case 'exportTable':
        return this.exportExcel(false);
      case 'contentConsumption':
        return void this.exportContentConsumption();
      case 'viewRecommended':
        return this.store.toggleRecommendedColumns();
    }
    const count = this.store.selectedCount();
    if (count === 0) return;
    switch (action) {
      case 'email':
        return this.composeEmail();
      case 'whatsapp':
        return this.composeWhatsapp();
      case 'notify':
        return this.notify();
      case 'watiMessages':
        return this.sendWatiMessages();
      case 'broadcast':
        return this.broadcast();
      case 'watiConfig':
        this.dialog.open(WatiConfigDialogComponent, { data: this.rawSelected(), width: '70vw', height: '80vh', disableClose: true });
        return;
      case 'tag':
        this.dialog.open(TagManagerDialogComponent, { ...this.dlg('520px'), data: { count } });
        return;
      case 'addToList':
        return this.saveAsList();
      case 'manageLists':
        this.dialog.open(ManageParticipantlistDialogComponent, { width: '80vw', height: '85vh', data: this.rawSelected(), autoFocus: false });
        return;
      case 'playlist':
        this.dialog.open(MapRecommendedplaylistToparticipantComponentComponent, {
          data: { participantlist: this.rawSelected() },
          minWidth: '500px',
          disableClose: true,
        });
        return;
      case 'interim':
        return this.interimReport();
      case 'wishlist':
        return this.evolutionWishlist();
      case 'appActionPending':
        this.dialog.open(AddPendingActionComponent, {
          disableClose: true,
          autoFocus: false,
          data: {
            profilelist: this.store.selectedParticipants().map((p) => p.profileid),
            formlist: [],
            mandatoryaction: [],
            videoask: [],
            data: null,
            bulk: true,
          },
        });
        return;
      case 'remarks':
        return this.addRemark();
      case 'subscription':
        return this.extendSubscription();
      case 'products':
        this.dialog.open(BulkAddProductsComponent, {
          panelClass: 'bap-overlay',
          maxHeight: '92vh',
          width: '640px',
          data: { participants: this.rawSelected(), loggedInProfileId: this.data.profileId },
        });
        return;
      case 'evolution':
        this.dialog.open(EvolutionDialogComponent, {
          ...this.dlg('760px'),
          data: { participants: this.store.selectedParticipants() },
        });
        return;
      case 'exportSelection':
        return this.exportExcel(true);
    }
  }

  // the analytics dialogs expect the raw participant metadata docs
  private rawSelected(): Dict[] {
    return this.store.selectedParticipants().map((p) => p.raw);
  }

  // Send Wati Messages: template picker, then the chunked send with progress (as analytics'
  // sendWattiWorkshop / workshopmessageChunked).
  private sendWatiMessages(): void {
    const people = this.store.selectedParticipants();
    this.dialog
      .open(SendmessagesComponent, {
        width: '1000px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        data: { type: 'whatsapp', selectedprofiles: people.map((p) => p.raw) },
      })
      .afterClosed()
      .subscribe((result) => void this.sendWhatsappChunked(result, people));
  }

  private async sendWhatsappChunked(result: any, people: Participant[]): Promise<void> {
    if (result?.action !== 'sent' || result.type !== 'whatsapp') {
      if (result?.action === 'sent' && result.type === 'mail') this.snack.open('Only WhatsApp is supported here', 'Dismiss', { duration: 3000 });
      return;
    }
    const { templateName, customParams } = result;
    const recipients = people
      .filter((p) => p.phonenumber && p.name)
      .map((p) => {
        let cc = (p.countrycode || '').trim();
        if (cc && !cc.startsWith('+')) cc = '+' + cc;
        const phone = p.phonenumber.trim().replace(/^\+/, '');
        return {
          phonenumber: cc ? `${cc}${phone}` : phone,
          name: p.name,
          customParams: (customParams ?? []).map((param: any) => ({
            name: param.name,
            value: String(param.value ?? '').replace(/\{\{name\}\}/g, p.name),
          })),
        };
      });
    if (!recipients.length) {
      this.snack.open('No participants with a phone number', 'Dismiss', { duration: 3000 });
      return;
    }
    const url = WHATSAPP_FUNCTION_URL[environment.firebase?.projectId ?? ''] ?? '';
    const progressDialog = this.dialog.open(WhatsappProgressDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      disableClose: true,
      data: { totalParticipants: recipients.length, templateName } as WhatsAppProgressData,
    });
    const progress = progressDialog.componentInstance;
    const chunks: (typeof recipients)[] = [];
    for (let i = 0; i < recipients.length; i += WHATSAPP_CHUNK_SIZE) chunks.push(recipients.slice(i, i + WHATSAPP_CHUNK_SIZE));
    progress.updateProgress({ totalChunks: chunks.length });
    let success = 0;
    let failed = 0;
    let cancelled = false;
    const cancelSub = progress.cancel$.subscribe(() => (cancelled = true));
    for (let i = 0; i < chunks.length && !cancelled; i++) {
      const chunk = chunks[i];
      progress.updateProgress({ currentChunk: i + 1, isProcessingChunk: true });
      try {
        const response = await firstValueFrom(
          this.http.post<any>(url, {
            type: 'whatsapp',
            templateName,
            participants: chunk,
            chunkInfo: { chunkIndex: i + 1, totalChunks: chunks.length, chunkSize: chunk.length },
          })
        );
        success += response.successCount || chunk.length;
        failed += response.failureCount || 0;
        progress.updateProgress({
          processedCount: success + failed,
          successCount: success,
          failedCount: failed,
          isProcessingChunk: false,
          errors: response.errors || [],
          watiErrors: response.watiErrors || [],
        });
      } catch (e: any) {
        failed += chunk.length;
        progress.updateProgress({
          processedCount: success + failed,
          successCount: success,
          failedCount: failed,
          isProcessingChunk: false,
          errors: [`Chunk ${i + 1} failed: ${e?.message || 'Unknown error'}`],
        });
      }
      if (i < chunks.length - 1 && !cancelled) await new Promise((r) => setTimeout(r, WHATSAPP_CHUNK_DELAY_MS));
    }
    cancelSub.unsubscribe();
    progress.complete(cancelled ? (success ? 'partial' : 'error') : !failed ? 'success' : success ? 'partial' : 'error');
  }

  // Broadcast in Breakthroughs: template picker (analytics' BroadcastComponent), confirm, then send.
  private broadcast(): void {
    const people = this.store.selectedParticipants();
    this.dialog
      .open(BroadcastComponent, { data: {}, minWidth: '50vw', maxWidth: '70vw', disableClose: true })
      .afterClosed()
      .subscribe(async (template) => {
        if (!template) return;
        if (!confirm(`Send the broadcast to ${people.length} selected participants?`)) return;
        try {
          const { sent, skipped } = await this.data.sendBroadcast(template, people);
          const note = skipped ? ` (${skipped} skipped — no app account)` : '';
          this.snack.open(`Broadcast sent to ${sent} participants${note}`, 'Dismiss', { duration: 4000 });
        } catch (e) {
          console.error('broadcast failed', e);
          this.snack.open('Sending the broadcast failed', 'Dismiss', { duration: 4000 });
        }
      });
  }

  // ---- export (as analytics: visible columns, filtered or selected rows) ----
  exportExcel(selectedOnly: boolean): void {
    const rows = selectedOnly ? this.store.selectedParticipants() : this.store.filtered();
    if (!rows.length) {
      this.snack.open('Nothing to export', '', { duration: 2000 });
      return;
    }
    const keys = this.store.columnOrder().filter((k) => k !== 'name' && k !== 'email' && k !== 'phonenumber');
    const ref = this.store.reference();
    const names: Record<string, Record<string, string>> = {
      journey: toNameMap(ref.journeys),
      product: toNameMap(ref.products),
      tier: toNameMap(ref.tiers),
      mode: toNameMap(ref.modes),
      tag: toNameMap(ref.tags),
      playlist: this.store.playlistNames(),
    };
    const data = rows.map((p) => {
      const row: Record<string, string | number> = { Name: p.name, Email: p.email, Phone: `${p.countrycode} ${p.phonenumber}`.trim() };
      for (const key of keys) {
        const def = COLUMN_DEF_MAP[key];
        if (def) row[def.label] = exportValue(p, def, names);
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    XLSX.writeFile(wb, `participants_${selectedOnly ? 'selection_' : ''}${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.snack.open(`Exported ${data.length} participants`, 'Dismiss', { duration: 2500 });
  }

  // `content analytics` rows for the filtered participants, as CSV (analytics built this but never saved it).
  async exportContentConsumption(): Promise<void> {
    const byId = new Map(this.store.filtered().map((p) => [p.profileid, p]));
    try {
      const rows = (await this.data.loadContentAnalytics()).filter((r) => byId.has(r['profileid']));
      if (!rows.length) {
        this.snack.open('No content consumption for these participants', 'Dismiss', { duration: 3000 });
        return;
      }
      const headers = ['name', ...new Set(rows.flatMap((r) => Object.keys(r)))].filter((h, i, a) => a.indexOf(h) === i);
      const cell = (v: unknown) => {
        const text = v && typeof v === 'object' && 'toDate' in (v as any) ? (v as any).toDate().toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
        return `"${text.replace(/"/g, '""')}"`;
      };
      const lines = rows.map((r) => headers.map((h) => cell(h === 'name' ? byId.get(r['profileid'])?.name : r[h])).join(','));
      const csv = '\ufeff' + [headers.join(','), ...lines].join('\n');
      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `content-consumption_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      console.error('content consumption export failed', e);
      this.snack.open('Content consumption export failed', 'Dismiss', { duration: 3000 });
    }
  }

  // Reuses the production interim-report dialog (writes `interimreport log` itself). Takes profile IDs.
  private interimReport(): void {
    this.dialog.open(SendInterimReportComponent, {
      panelClass: 'pi-dialog',
      maxWidth: '90vw',
      maxHeight: '90vh',
      autoFocus: false,
      disableClose: true,
      data: this.store.selectedParticipants().map((p) => p.profileid),
    });
  }

  // Reuses the production evolution-wishlist dialog (writes `evolutionwishlistlog` itself). Takes profile IDs.
  private evolutionWishlist(): void {
    this.dialog.open(EvolutionWishlistLogComponent, {
      panelClass: 'pi-dialog',
      maxWidth: '90vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: this.store.selectedParticipants().map((p) => p.profileid),
    });
  }

  // Reuses the production email composer (email-input) from the analytics screen.
  // It returns a result with {docid, status}; the parent persists to `email archive`
  // and/or triggers the sendBatchEmail cloud function (mirrors the old screen's afterClosed).
  private composeEmail(): void {
    this.dialog
      .open(EmailInputComponent, { panelClass: 'pi-dialog', minWidth: '600px', disableClose: true, data: this.rawSelected() })
      .afterClosed()
      .subscribe(async (result: any) => {
        if (!result) return;
        const n = this.store.selectedCount();
        try {
          if (result.status === 'queued' || result.status === 'send') {
            await setDoc(doc(collection(this.firestore, 'email archive'), result.docid), result, { merge: true });
            this.snack.open(result.status === 'queued' ? `Email queued for ${n} participants` : `Email sent to ${n} participants`, 'Dismiss', { duration: 3000 });
          } else if (result.status === 'validated') {
            const url = `https://us-central1-${environment.firebase?.projectId}.cloudfunctions.net/sendBatchEmail`;
            const data = { ...result, archiveid: result.docid };
            this.http
              .post(url, JSON.stringify(data), { responseType: 'text', headers: new HttpHeaders().set('Content-Type', 'application/json') })
              .subscribe({
                next: () => this.snack.open(`Email sent to ${n} participants`, 'Dismiss', { duration: 3000 }),
                error: () => this.snack.open('Error sending email', 'Dismiss', { duration: 4000 }),
              });
          }
        } catch {
          this.snack.open('Error sending email', 'Dismiss', { duration: 4000 });
        }
      });
  }

  // Reuses the production WhatsApp composer (wati-input) from the analytics screen.
  // It writes the `wati archive` doc and triggers the send itself; we just react to the close result.
  private composeWhatsapp(): void {
    this.dialog
      .open(WatiInputComponent, {
        panelClass: 'pi-dialog',
        width: '70vw',
        height: '80vh',
        disableClose: true,
        data: this.rawSelected(),
      })
      .afterClosed()
      .subscribe((r: any) => {
        if (!r) return;
        const n = this.store.selectedCount();
        if (r === 'queued') {
          this.snack.open(`WhatsApp queued for ${n} participants`, 'Dismiss', { duration: 3000 });
        } else if (r === 'failed' || r?.status === 'failed') {
          this.snack.open('Sending WhatsApp failed', 'Dismiss', { duration: 4000 });
        } else if (r?.status) {
          this.snack.open(`WhatsApp ${r.status} for ${n} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  // Reuses the production in-app notification composer (ah-notification). It saves the template;
  // the parent (here) uploads any image and pushes via authguard.saveNotificationRecord to the
  // registered (firebaseuserref) profiles — mirrors the old analytics screen's afterClosed.
  private notify(): void {
    this.dialog
      .open(AhNotificationComponent, {
        panelClass: 'pi-dialog',
        width: '80vw',
        maxHeight: '90vh',
        disableClose: true,
        autoFocus: false,
        data: this.rawSelected(),
      })
      .afterClosed()
      .subscribe(async (result: any) => {
        if (!result) return;
        const profileID = this.store.selectedParticipants().filter((p) => p.registered).map((p) => p.profileid);
        let notificationimage = null;
        if (result['notificationimage'] != null) {
          try {
            const filepath = 'Notification Images/' + new Date().toISOString() + result['notificationimage'].name;
            const uploadResult = await uploadBytes(ref(getStorage(), filepath), result['notificationimage']);
            notificationimage = await getDownloadURL(uploadResult.ref);
          } catch (e) {
            console.error('notification image upload error', e);
          }
        }
        await this.authguard.saveNotificationRecord({
          title: result['title'],
          message: result['message'],
          subtitle: result['subtitle'] ?? null,
          notificationtype: 'ahupdate',
          notificationimage,
          sticky: result['sticky'],
          logged: true,
          landingpage: result['landingpage'],
          profileid: profileID,
        });
        this.snack.open(`Notification sent to ${profileID.length} app users`, 'Dismiss', { duration: 3000 });
      });
  }

  private saveAsList(): void {
    this.dialog
      .open(PromptDialogComponent, {
        ...this.dlg('440px'),
        data: {
          title: 'Save as list',
          subtitle: `${this.store.selectedCount()} participants will be saved as a static list.`,
          label: 'List name',
          placeholder: 'e.g. March outreach',
          confirmText: 'Create list',
          icon: 'playlist_add',
          validate: (v: string) => (this.store.nameTaken('list', v) ? `A list named “${v}” already exists.` : null),
        } as PromptData,
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (name) {
          this.store.saveSelectionAsList(name);
          this.snack.open(`Created list "${name}" with ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  private extendSubscription(): void {
    this.dialog
      .open(SubscriptionDialogComponent, { ...this.dlg('460px'), data: { count: this.store.selectedCount() } })
      .afterClosed()
      .subscribe((r?: SubscriptionExtension) => {
        if (!r) return;
        const selected = this.store.selectedCount();
        const extended = this.store.extendSubscriptionForSelected(r);
        const skipped = selected - extended;
        const note = skipped ? ` (${skipped} skipped — not active / non active)` : '';
        this.snack.open(`Extended subscription for ${extended} participants${note}`, 'Dismiss', { duration: 4000 });
      });
  }

  private addRemark(): void {
    this.dialog
      .open(RemarksDialogComponent, { ...this.dlg('480px'), data: { count: this.store.selectedCount() } })
      .afterClosed()
      .subscribe((note?: string) => {
        if (note) {
          const n = this.store.selectedCount();
          this.store.addRemarkToSelected(note);
          this.snack.open(`Added remark to ${n} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

}
