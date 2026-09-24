/*
 * Participant Intelligence
 *
 * Everything for this screen lives in this file, in dependency order: models, data service,
 * filter engine, signals, checklists, store, dialogs, child components and finally the page
 * component (ParticipantIntelligenceComponent).
 */

import { ChangeDetectionStrategy, Component, Injectable, Injector, OnInit, computed, inject, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Firestore, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, writeBatch } from '@angular/fire/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, forkJoin, from } from 'rxjs';
import { saveAs } from 'file-saver';

import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { SendInterimReportComponent } from '../../Participants Profile Management/participants-analytics/send-interim-report/send-interim-report.component';
import { EvolutionWishlistLogComponent } from '../../Participants Profile Management/participants-analytics/evolution-wishlist-log/evolution-wishlist-log.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';

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

export type FinancialStatus =
  | 'regular'
  | 'locked'
  | 'defaulted'
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
  atccount: number;
  customersupport: { status: SupportStatus; category: string | null };
  remarks: Remark[];
  subscriptionstart: string | null;
  subscriptionend: string | null;
  lastpaymentdate: string | null;
  purchasedate: string | null;
  dateofbirth: string | null;
  emiStatus: EmiStatus;
  productevent: Record<string, string[]>; // productId -> event ids
  queueevent: Record<string, string[]>; // productId -> queue ids
  // participantjourneyproduct doc that holds the subscription: purchaseref (active) or
  // lastsubscribedpurchaseref (non active); null for any other status
  subscriptionPurchaseId: string | null;
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

// Lookup tables loaded once; the table and filters resolve ids to names through these.
export interface ReferenceData {
  journeys: NamedRef[];
  products: NamedRef[];
  modes: NamedRef[];
  tiers: NamedRef[];
  tags: Tag[];
  events: NamedRef[];
  queues: NamedRef[];
}

export type Comparison = 'eq' | 'gte' | 'lte';

export interface ProductCountRule {
  productId: string;
  comparison: Comparison;
  count: number;
}

export interface DateRange {
  start: string | null;
  end: string | null;
}

export type RegisteredFilter = 'registered' | 'non-registered';

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
  atcCountMin: number | null;
  subscriptionStart: DateRange;
  subscriptionEnd: DateRange;
  consumed: ProductCountRule[];
  unconsumed: ProductCountRule[];
}

function emptyFilter(): FilterModel {
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
    atcCountMin: null,
    subscriptionStart: { start: null, end: null },
    subscriptionEnd: { start: null, end: null },
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
  count: number;
  filter?: FilterModel; // kind === 'filter'
  profileIds?: string[]; // kind === 'list'
  memberAudienceIds?: string[]; // kind === 'segment'
  live?: boolean; // lists only
}

export type ColumnType =
  | 'name'
  | 'text'
  | 'date'
  | 'number'
  | 'array'
  | 'tags'
  | 'status'
  | 'remarks';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  // how to resolve array/id columns to display text
  resolve?: 'journey' | 'product' | 'tag' | 'tier' | 'mode';
}

// A removable filter pill shown above the table.
export interface FilterChip {
  group: keyof FilterModel;
  label: string;
  value: string; // identifies the specific value to remove (or '' for whole-group resets)
}

// --- communications analytics (email / whatsapp / notification) ---
export type CommsChannel = 'email' | 'whatsapp' | 'notification';

export interface CommsCampaign {
  name: string;
  status: string; // queued | sent | scheduled | failed | ...
  recipients: number;
  date: string | null; // ISO
}

export interface CommsChannelStats {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  recent: CommsCampaign[];
}

export interface CommsAnalytics {
  email: CommsChannelStats;
  whatsapp: CommsChannelStats;
  notification: CommsChannelStats;
}

function emptyChannelStats(): CommsChannelStats {
  return { total: 0, queued: 0, sent: 0, failed: 0, recent: [] };
}

// ================================================================================================
// Column catalog
// ================================================================================================

// Every column the user can add to the table. `name` is always present and pinned.
const COLUMN_CATALOG: ColumnDef[] = [
  { key: 'name', label: 'Participant', type: 'name' },
  { key: 'customerstatus', label: 'Customer status', type: 'status' },
  { key: 'financialstatus', label: 'Financial status', type: 'status' },
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
  { key: 'registered', label: 'Registered', type: 'status' },
  { key: 'emiStatus', label: 'EMI status', type: 'status' },
  { key: 'customersupport', label: 'Support', type: 'status' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phonenumber', label: 'Phone', type: 'text' },
  { key: 'subscriptionstart', label: 'Subscription start', type: 'date' },
  { key: 'subscriptionend', label: 'Subscription end', type: 'date' },
  { key: 'purchasedate', label: 'Purchase date', type: 'date' },
  { key: 'lastpaymentdate', label: 'Last payment', type: 'date' },
  { key: 'dateofbirth', label: 'Date of birth', type: 'date' },
  { key: 'remarks', label: 'Remarks', type: 'remarks' },
];

const COLUMN_DEF_MAP: Record<string, ColumnDef> = COLUMN_CATALOG.reduce(
  (acc, c) => ((acc[c.key] = c), acc),
  {} as Record<string, ColumnDef>
);

// What the table shows on first load.
const DEFAULT_VISIBLE_COLUMNS = [
  'name',
  'financialstatus',
  'customerstatus',
  'activejourney',
  'activeproduct',
  'profiletags',
  'atccount',
  'subscriptionend',
];

// Columns frozen (sticky-left) by default — Participant + Financial status.
const DEFAULT_PINNED_COLUMNS = ['name', 'financialstatus'];

// ================================================================================================
// Filter engine
// ================================================================================================

// Pure AND-combination filter over the loaded participants.

function inAny<T>(selected: T[], value: T | null): boolean {
  if (!selected.length) return true;
  if (value === null) return false;
  return selected.includes(value);
}

function arrayIntersects<T>(selected: T[], values: T[]): boolean {
  if (!selected.length) return true;
  return values.some((v) => selected.includes(v));
}

// True if the productId->ids[] map contains any of the selected ids (used for events/queues).
function mapHasAny(selected: string[], map: Record<string, string[]> | undefined): boolean {
  if (!selected.length) return true;
  if (!map) return false;
  for (const ids of Object.values(map)) {
    if (Array.isArray(ids) && ids.some((id) => selected.includes(id))) return true;
  }
  return false;
}

function dateInRange(value: string | null, start: string | null, end: string | null): boolean {
  if (!start && !end) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (start && t < new Date(start).getTime()) return false;
  if (end && t > new Date(end).getTime() + 86400000) return false;
  return true;
}

// How many times the product appears in the participant's consumed / unconsumed list.
function matchesProductCount(products: string[], rule: ProductCountRule): boolean {
  const count = products.filter((id) => id === rule.productId).length;
  switch (rule.comparison) {
    case 'eq':
      return count === rule.count;
    case 'gte':
      return count >= rule.count;
    case 'lte':
      return count <= rule.count;
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

function applyFilters(participants: Participant[], f: FilterModel): Participant[] {
  return participants.filter((p) => {
    if (!matchesSearch(p, f.search)) return false;
    if (!inAny(f.participantmode, p.participantmode)) return false;
    if (!inAny(f.customerstatus, p.customerstatus)) return false;
    if (!inAny(f.financialstatus, p.financialstatus)) return false;
    if (!inAny(f.activejourney, p.activejourney)) return false;
    if (!inAny(f.lastcompletedjourney, p.lastcompletedjourney)) return false;
    if (!arrayIntersects(f.activeproduct, p.activeproduct)) return false;
    if (!arrayIntersects(f.addons, p.addons)) return false;
    if (!arrayIntersects(f.gifts, p.gifts)) return false;
    if (!arrayIntersects(f.bonus, p.bonus)) return false;
    if (!mapHasAny(f.events, p.productevent)) return false;
    if (!mapHasAny(f.queues, p.queueevent)) return false;
    if (!arrayIntersects(f.profiletags, p.profiletags)) return false;
    if (!arrayIntersects(f.tier, p.tier)) return false;
    if (f.registered.length) {
      const flag = p.registered ? 'registered' : 'non-registered';
      if (!f.registered.includes(flag)) return false;
    }
    if (f.customersupport.length && !f.customersupport.includes(p.customersupport.status)) return false;
    if (f.atcCountMin != null && p.atccount < f.atcCountMin) return false;
    if (!dateInRange(p.subscriptionstart, f.subscriptionStart.start, f.subscriptionStart.end)) return false;
    if (!dateInRange(p.subscriptionend, f.subscriptionEnd.start, f.subscriptionEnd.end)) return false;
    for (const rule of f.consumed) if (!matchesProductCount(p.consumedproducts, rule)) return false;
    for (const rule of f.unconsumed) if (!matchesProductCount(p.unconsumedproducts, rule)) return false;
    return true;
  });
}

// Builds the removable pills shown above the table from the current filter model.
function deriveChips(f: FilterModel, ref: ReferenceData): FilterChip[] {
  const chips: FilterChip[] = [];
  const journeyName = (id: string) => ref.journeys.find((j) => j.id === id)?.name ?? id;
  const productName = (id: string) => ref.products.find((p) => p.id === id)?.name ?? id;
  const modeName = (id: string) => ref.modes.find((m) => m.id === id)?.name ?? id;
  const tierName = (id: string) => ref.tiers.find((t) => t.id === id)?.name ?? id;
  const tagName = (id: string) => ref.tags.find((t) => t.id === id)?.name ?? id;
  const eventName = (id: string) => ref.events.find((e) => e.id === id)?.name ?? id;
  const queueName = (id: string) => ref.queues.find((q) => q.id === id)?.name ?? id;

  const addEach = (group: keyof FilterModel, values: string[], prefix: string, fmt: (v: string) => string = (v) => v) => {
    for (const v of values) chips.push({ group, value: v, label: `${prefix}: ${fmt(v)}` });
  };

  addEach('customerstatus', f.customerstatus, 'Status');
  addEach('financialstatus', f.financialstatus, 'Financial');
  addEach('participantmode', f.participantmode, 'Mode', modeName);
  addEach('activejourney', f.activejourney, 'Journey', journeyName);
  addEach('lastcompletedjourney', f.lastcompletedjourney, 'Completed', journeyName);
  addEach('activeproduct', f.activeproduct, 'Product', productName);
  addEach('addons', f.addons, 'Add-on', productName);
  addEach('gifts', f.gifts, 'Gift', productName);
  addEach('bonus', f.bonus, 'Bonus', productName);
  addEach('events', f.events, 'Event', eventName);
  addEach('queues', f.queues, 'Queue', queueName);
  addEach('tier', f.tier, 'Tier', tierName);
  addEach('profiletags', f.profiletags, 'Tag', tagName);
  addEach('registered', f.registered, 'Registered');
  addEach('customersupport', f.customersupport, 'Support');

  if (f.atcCountMin != null) chips.push({ group: 'atcCountMin', value: '', label: `ATC ≥ ${f.atcCountMin}` });
  if (f.subscriptionStart.start || f.subscriptionStart.end)
    chips.push({ group: 'subscriptionStart', value: '', label: 'Subscription start range' });
  if (f.subscriptionEnd.start || f.subscriptionEnd.end)
    chips.push({ group: 'subscriptionEnd', value: '', label: 'Subscription end range' });
  for (const r of f.consumed) chips.push({ group: 'consumed', value: r.productId, label: `Consumed ${productName(r.productId)} ${cmp(r.comparison)} ${r.count}` });
  for (const r of f.unconsumed) chips.push({ group: 'unconsumed', value: r.productId, label: `Unconsumed ${productName(r.productId)} ${cmp(r.comparison)} ${r.count}` });

  return chips;
}

// id -> name lookup for a reference list.
function toNameMap(items: { id: string; name: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const i of items) m[i.id] = i.name;
  return m;
}

function cmp(c: string): string {
  return c === 'eq' ? '=' : c === 'gte' ? '≥' : '≤';
}

// ================================================================================================
// Signals
// ================================================================================================

// "Gap" / health detectors. Each is a pure predicate over a participant; the screen
// runs them across the base, counts matches, and turns each into a clickable cohort.

export type SignalCategory = 'integrity' | 'retention' | 'financial' | 'opportunity';
export type SignalSeverity = 'critical' | 'warn' | 'opportunity';

export interface SignalDef {
  id: string;
  label: string;
  description: string;
  category: SignalCategory;
  severity: SignalSeverity;
  predicate: (p: Participant) => boolean;
}

// thresholds — single place to tune the intelligence
const HIGH_ATC = 8;
const VALUE_CONSUMED = 3;
const IDLE_DAYS = 90;
const EXPIRING_DAYS = 30;
const LAPSED_DAYS = 30;

const daysUntil = (iso: string | null): number | null =>
  iso ? (new Date(iso).getTime() - Date.now()) / 86_400_000 : null;
const daysSince = (iso: string | null): number | null =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : null;
const recentMoney = (p: Participant, days: number): boolean => {
  const a = daysSince(p.lastpaymentdate);
  const b = daysSince(p.purchasedate);
  return (a != null && a <= days) || (b != null && b <= days);
};

const SIGNALS: SignalDef[] = [
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
    description: 'Customer status is active while the subscription end date is in the past.',
    category: 'integrity',
    severity: 'critical',
    predicate: (p) => p.customerstatus === 'active' && (daysUntil(p.subscriptionend) ?? 1) < 0,
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
    id: 'active-no-product',
    label: 'Active, but no active product',
    description: 'Paying/active status with nothing currently to deliver.',
    category: 'integrity',
    severity: 'warn',
    predicate: (p) => p.customerstatus === 'active' && p.activeproduct.length === 0,
  },
  {
    id: 'status-none-engaged',
    label: 'No customer status, but engaged',
    description: 'Has an active product or journey yet customer status is unset.',
    category: 'integrity',
    severity: 'warn',
    predicate: (p) => p.customerstatus === 'none' && (p.activeproduct.length > 0 || !!p.activejourney),
  },
  {
    id: 'product-never-consumed',
    label: 'Has product, never consumed any',
    description: 'An active product exists but nothing has been consumed — fulfillment gap.',
    category: 'integrity',
    severity: 'warn',
    predicate: (p) => p.activeproduct.length > 0 && p.consumedproducts.length === 0,
  },

  // --- retention: churn risk / revive ---
  {
    id: 'idle-active-product',
    label: 'Active product, idle a long time',
    description: `No coach activity and no purchase/payment in ${IDLE_DAYS} days while a product is active.`,
    category: 'retention',
    severity: 'warn',
    predicate: (p) => p.activeproduct.length > 0 && p.atccount === 0 && !recentMoney(p, IDLE_DAYS),
  },
  {
    id: 'expiring-soon',
    label: `Subscription expiring in ${EXPIRING_DAYS} days`,
    description: 'Active subscription ends soon — reach out before it lapses.',
    category: 'retention',
    severity: 'warn',
    predicate: (p) => {
      const d = daysUntil(p.subscriptionend);
      return p.customerstatus === 'active' && d != null && d >= 0 && d <= EXPIRING_DAYS;
    },
  },
  {
    id: 'recently-lapsed',
    label: 'Lapsed recently, not renewed',
    description: `Subscription ended within ${LAPSED_DAYS} days and they are no longer active — warm win-back.`,
    category: 'retention',
    severity: 'critical',
    predicate: (p) => {
      const d = daysSince(p.subscriptionend);
      return d != null && d > 0 && d <= LAPSED_DAYS && p.customerstatus !== 'active';
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

  // --- financial ---
  {
    id: 'finance-overdue',
    label: 'Overdue / defaulted payment',
    description: 'EMI overdue or financial status defaulted.',
    category: 'financial',
    severity: 'critical',
    predicate: (p) => p.emiStatus === 'overdue' || p.financialstatus === 'defaulted',
  },
  {
    id: 'finance-locked',
    label: 'Finance locked',
    description: 'Financial standing locked.',
    category: 'financial',
    severity: 'warn',
    predicate: (p) => p.financialstatus === 'locked',
  },

  // --- opportunity: upsell / relationship ---
  {
    id: 'power-user-no-upgrade',
    label: 'Power user, no upgrade yet',
    description: `High coach engagement (${HIGH_ATC}+ ATC) with no higher-order purchase — upsell.`,
    category: 'opportunity',
    severity: 'opportunity',
    predicate: (p) => p.atccount >= HIGH_ATC && !p.higherorderpurchase,
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
    label: 'Active, never contacted',
    description: 'Active customer with no remarks on record — relationship gap.',
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
  description: string;
  wired: boolean;
  predicate?: (p: Participant) => boolean;
  note?: string;
}

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
    description: 'Active customers whose subscription end date has already passed.',
    wired: true,
    predicate: (p) => p.customerstatus === 'active' && !!p.subscriptionend && new Date(p.subscriptionend).getTime() < Date.now(),
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

const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);
const tsToIso = (x: any): string | null => {
  if (!x) return null;
  if (typeof x?.toDate === 'function') return x.toDate().toISOString();
  if (typeof x === 'string') return x;
  if (x instanceof Date) return x.toISOString();
  return null;
};
const dateStr = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);

// ================================================================================================
// Data service
// ================================================================================================

// Reads and writes the participant collections in the configured Firebase project's Firestore.
@Injectable()
export class ParticipantDataService {
  private readonly firestore = inject(Firestore);
  private readonly authguard = inject(AuthguardService);
  private loggedInProfileId = '';

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
  getCommsAnalytics(): Observable<CommsAnalytics> {
    return from(this.loadCommsAnalytics());
  }

  private async loadCommsAnalytics(): Promise<CommsAnalytics> {
    const [email, whatsapp, notification] = await Promise.all([
      this.channelStats('email archive'),
      this.channelStats('wati archive'),
      this.channelStats('notificationrecord'),
    ]);
    return { email, whatsapp, notification };
  }

  // Defensive aggregation — collections/field names vary, so degrade gracefully.
  // email archive / wati archive carry a string `status`; notificationrecord does NOT —
  // it stores success(boolean) + profilefailed[]/profilesuccess[], so classify it differently.
  private async channelStats(collectionName: string): Promise<CommsChannelStats> {
    try {
      const snap = await getDocs(collection(this.firestore, collectionName));
      const docs = snap.docs.map((d) => d.data() as Dict);
      const isNotif = collectionName === 'notificationrecord';
      let queued = 0;
      let sent = 0;
      let failed = 0;
      for (const d of docs) {
        if (isNotif) {
          if (this.notifFailed(d)) failed++;
          else sent++;
        } else {
          const status = (d['status'] ?? '').toString().toLowerCase();
          if (status === 'queued' || status === 'scheduled' || status === 'pending') queued++;
          else if (status === 'failed' || status === 'rejected' || status === 'error') failed++;
          else sent++;
        }
      }
      const recent: CommsCampaign[] = docs
        .map((d) => ({
          name: d['broadcastname'] ?? d['subject'] ?? d['name'] ?? d['title'] ?? '(untitled)',
          status: isNotif ? (this.notifFailed(d) ? 'failed' : 'sent') : (d['status'] ?? 'sent').toString(),
          recipients: this.recipientCount(d),
          date: tsToIso(d['date'] ?? d['queuedAt'] ?? d['scheduledAt'] ?? d['createdAt'] ?? d['created']),
        }))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        .slice(0, 6);
      return { total: docs.length, queued, sent, failed, recent };
    } catch (e) {
      console.warn(`comms analytics: could not read "${collectionName}"`, e);
      return emptyChannelStats();
    }
  }

  private notifFailed(d: Dict): boolean {
    return d['success'] === false || (Array.isArray(d['profilefailed']) && d['profilefailed'].length > 0);
  }

  private recipientCount(d: Dict): number {
    for (const k of ['pending', 'profileid', 'numbers', 'recipients', 'profilelist', 'users']) {
      if (Array.isArray(d[k])) return d[k].length;
    }
    if (typeof d['count'] === 'number') return d['count'];
    if (typeof d['totalNumbers'] === 'number') return d['totalNumbers'];
    return 0;
  }

  private async loadReference(): Promise<ReferenceData> {
    const col = (name: string) => getDocs(collection(this.firestore, name)).catch(() => null);
    const [journeys, products, modes, tiers, tags, events, queues] = await Promise.all([
      col('journey'),
      col('products'),
      col('modes'),
      col('tier'),
      col('participant tags'),
      col('event collection'),
      col('queue generation'),
    ]);
    const named = (snap: any, field: string): NamedRef[] =>
      snap ? snap.docs.map((d: any) => ({ id: d.id, name: d.data()[field] ?? d.id })) : [];
    const tagList: Tag[] = tags
      ? tags.docs.map((d: any) => {
          const data = d.data();
          return { id: d.id, name: data['name'] ?? d.id, tagsfor: arr(data['tagsfor']), isActive: data['isActive'] !== false };
        })
      : [];
    return {
      journeys: named(journeys, 'journey'),
      products: named(products, 'product'),
      modes: named(modes, 'mode'),
      tiers: named(tiers, 'tier'),
      tags: tagList,
      events: named(events, 'name'),
      queues: named(queues, 'queuename'),
    };
  }

  private async loadParticipants(): Promise<Participant[]> {
    const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), orderBy('name')));
    return snap.docs.map((d) => this.mapParticipant(d.id, d.data() as Dict));
  }

  private mapParticipant(id: string, d: Dict): Participant {
    const status = (d['customerstatus'] ?? 'none') as CustomerStatus;
    // status-conditional subscription window (mirrors the original screen)
    const useLast = status === 'discontinued' || status === 'non active';
    const subStart = tsToIso(useLast ? d['lastsubscriptionstart'] : d['subscriptionstart']);
    const subEnd = tsToIso(useLast ? d['lastsubscriptionend'] : d['subscriptionend']);

    return {
      profileid: d['profileid'] ?? id,
      name: d['name'] ?? '(no name)',
      email: d['email'] ?? '',
      phonenumber: d['phonenumber'] != null ? String(d['phonenumber']) : '',
      countrycode: d['countryCode'] ?? d['countrycode'] ?? '',
      registered: d['firebaseuserref'] != null,
      participantmode: d['participantmode'] ?? '',
      customerstatus: status,
      financialstatus: this.normFinancial(d['financialstatus']),
      activejourney: d['activejourney'] ?? null,
      lastcompletedjourney: d['lastcompletedjourney'] ?? null,
      higherorderpurchase: d['higherorderpurchase'] ?? null,
      activeproduct: arr(d['activeproduct']),
      consumedproducts: arr(d['consumedproducts']),
      unconsumedproducts: arr(d['unconsumedproducts']),
      addons: arr(d['addons']),
      gifts: arr(d['gifts']),
      bonus: arr(d['bonus']),
      tier: arr(d['tier']),
      profiletags: arr(d['profiletags']),
      atccount: Number(d['atccount'] ?? 0),
      customersupport: this.collapseSupport(d['customersupport']),
      remarks: this.mapRemarks(d['remarks']),
      subscriptionstart: subStart,
      subscriptionend: subEnd,
      lastpaymentdate: tsToIso(d['lastpaymentdate']),
      purchasedate: tsToIso(d['purchasedate']),
      dateofbirth: tsToIso(d['dateofbirth']),
      emiStatus: this.mapEmi(d['financedata']?.['paymentstatus']),
      productevent: d['productevent'] && typeof d['productevent'] === 'object' ? d['productevent'] : {},
      queueevent: d['queueevent'] && typeof d['queueevent'] === 'object' ? d['queueevent'] : {},
      subscriptionPurchaseId:
        (status === 'active' ? d['purchaseref']?.id : status === 'non active' ? d['lastsubscribedpurchaseref']?.id : null) ?? null,
    };
  }

  private normFinancial(v: unknown): FinancialStatus {
    const s = (v ?? '').toString();
    const allowed = ['regular', 'locked', 'defaulted', 'discontinued', 'banned'];
    return (allowed.includes(s) ? s : 'none') as FinancialStatus;
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
      out.push({
        id: data['docid'] ?? d.id,
        name: data['label'] ?? 'Saved filter',
        kind: 'filter',
        isDefault: false,
        createdBy: data['createdby'] ?? '—',
        createdDate: '',
        count: 0,
        filter: this.mapSavedFilter(data),
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
        count: arr(data['profilelist']).length,
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
        count: 0,
        memberAudienceIds: arr(data['participantlistid']),
      });
    });
    return out;
  }

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
    if (d['atccount'] != null && d['atccount'] !== '') f.atcCountMin = Number(d['atccount']);
    f.subscriptionStart = this.range(d['subscriptionstart']);
    f.subscriptionEnd = this.range(d['subscriptionend']);
    return f;
  }

  private range(x: any): { start: string | null; end: string | null } {
    if (!x || typeof x !== 'object') return { start: null, end: null };
    return {
      start: x.start ? new Date(x.start).toISOString() : null,
      end: x.end ? new Date(x.end).toISOString() : null,
    };
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

  async persistAudience(aud: Audience): Promise<void> {
    const f = aud.filter ?? emptyFilter();
    await setDoc(
      doc(this.firestore, 'searchquery', aud.id),
      {
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
        atccount: f.atcCountMin ?? null,
        subscriptionstart: { start: dateStr(f.subscriptionStart.start), end: dateStr(f.subscriptionStart.end) },
        subscriptionend: { start: dateStr(f.subscriptionEnd.start), end: dateStr(f.subscriptionEnd.end) },
      },
      { merge: true }
    );
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
};

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
  readonly commsAnalytics = signal<CommsAnalytics | null>(null);

  private readonly membership = signal<Set<string> | null>(null);
  readonly signalId = signal<string | null>(null);
  readonly columnOrder = signal<string[]>([...DEFAULT_VISIBLE_COLUMNS]);
  readonly pinned = signal<Set<string>>(new Set(DEFAULT_PINNED_COLUMNS));
  readonly selectedIds = signal<Set<string>>(new Set());

  // --- derived state ---
  readonly filtered = computed<Participant[]>(() => {
    let result = applyFilters(this.all(), this.filter());
    const sigId = this.signalId();
    if (sigId && SIGNAL_MAP[sigId]) result = result.filter(SIGNAL_MAP[sigId].predicate);
    const member = this.membership();
    if (member) result = result.filter((p) => member.has(p.profileid));
    return result;
  });

  // overview counts computed over the WHOLE base (stable, independent of the current view)
  readonly signalCounts = computed<Record<string, number>>(() => {
    const all = this.all();
    const counts: Record<string, number> = {};
    for (const s of SIGNALS) counts[s.id] = all.reduce((n, p) => (s.predicate(p) ? n + 1 : n), 0);
    return counts;
  });

  readonly attentionCount = computed<number>(() => {
    const all = this.all();
    return all.reduce(
      (n, p) => (SIGNALS.some((s) => s.severity !== 'opportunity' && s.predicate(p)) ? n + 1 : n),
      0
    );
  });

  readonly activeSignal = computed<SignalDef | null>(() => {
    const id = this.signalId();
    return id ? SIGNAL_MAP[id] ?? null : null;
  });

  readonly queuedTotal = computed<number>(() => {
    const c = this.commsAnalytics();
    return c ? c.email.queued + c.whatsapp.queued + c.notification.queued : 0;
  });

  readonly chips = computed<FilterChip[]>(() => deriveChips(this.filter(), this.reference()));
  readonly activeFilterCount = computed(() => this.chips().length);
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
    return Object.values(COLUMN_DEF_MAP).filter((c) => !current.has(c.key));
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
    forkJoin({
      reference: this.data.getReferenceData(),
      participants: this.data.getParticipants(),
      audiences: this.data.getAudiences(),
    }).subscribe({
      next: ({ reference, participants, audiences }) => {
        this.reference.set(reference);
        this.all.set(participants);
        this.audiences.set(this.withCounts(audiences, participants));
        this.loading.set(false);
      },
      error: (e) => {
        console.error('Participant Intelligence load failed', e);
        this.loadError.set(true);
        this.loading.set(false);
      },
    });

    // comms analytics loads independently so it never blocks the table
    this.data.getCommsAnalytics().subscribe({
      next: (c) => this.commsAnalytics.set(c),
      error: (e) => console.warn('comms analytics load failed', e),
    });
  }

  // --- filtering ---
  patchFilter(patch: Partial<FilterModel>): void {
    this.filter.update((f) => ({ ...f, ...patch }));
    this.activeAudienceId.set(null);
  }

  setSearch(term: string): void {
    this.filter.update((f) => ({ ...f, search: term }));
  }

  clearFilter(): void {
    this.filter.set(emptyFilter());
    this.membership.set(null);
    this.activeAudienceId.set(null);
    this.signalId.set(null);
  }

  // --- intelligence signals ---
  applySignal(id: string): void {
    this.filter.set(emptyFilter());
    this.membership.set(null);
    this.activeAudienceId.set(null);
    this.signalId.set(id);
    this.clearSelection();
  }

  clearSignal(): void {
    this.signalId.set(null);
  }

  // optimistic bump so the Communications badge reflects a just-queued broadcast
  bumpQueued(channel: 'email' | 'whatsapp' | 'notification'): void {
    this.commsAnalytics.update((c) => {
      if (!c) return c;
      const ch = c[channel];
      return { ...c, [channel]: { ...ch, queued: ch.queued + 1, total: ch.total + 1 } };
    });
  }

  removeChip(chip: FilterChip): void {
    this.filter.update((f) => {
      const next: FilterModel = structuredClone(f);
      const g = chip.group;
      if (g === 'atcCountMin') next.atcCountMin = null;
      else if (g === 'subscriptionStart') next.subscriptionStart = { start: null, end: null };
      else if (g === 'subscriptionEnd') next.subscriptionEnd = { start: null, end: null };
      else if (g === 'consumed') next.consumed = next.consumed.filter((r) => r.productId !== chip.value);
      else if (g === 'unconsumed') next.unconsumed = next.unconsumed.filter((r) => r.productId !== chip.value);
      else {
        const rec = next as unknown as Record<string, string[]>;
        rec[g as string] = (rec[g as string] ?? []).filter((v) => v !== chip.value);
      }
      return next;
    });
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

  saveCurrentAsAudience(name: string): Audience {
    const aud: Audience = {
      id: `aud-${Date.now()}`,
      name,
      kind: 'filter',
      isDefault: false,
      createdBy: 'You',
      createdDate: new Date().toISOString(),
      count: this.filteredCount(),
      filter: structuredClone(this.filter()),
    };
    this.audiences.update((list) => [...list, aud]);
    this.activeAudienceId.set(aud.id);
    this.data.persistAudience(aud).catch((e) => console.error('persistAudience failed', e));
    return aud;
  }

  saveSelectionAsList(name: string): Audience {
    const ids = this.selectedProfileIds();
    const aud: Audience = {
      id: `aud-${Date.now()}`,
      name,
      kind: 'list',
      isDefault: false,
      createdBy: 'You',
      createdDate: new Date().toISOString(),
      count: ids.length,
      live: false,
      profileIds: ids,
    };
    this.audiences.update((list) => [...list, aud]);
    this.data.persistList(aud).catch((e) => console.error('persistList failed', e));
    return aud;
  }

  deleteAudience(id: string): void {
    this.audiences.update((list) => list.filter((a) => a.id !== id));
    if (this.activeAudienceId() === id) this.activeAudienceId.set(null);
  }

  setDefaultAudience(id: string): void {
    this.audiences.update((list) => list.map((a) => ({ ...a, isDefault: a.id === id })));
  }

  toggleListLive(id: string): void {
    this.audiences.update((list) => list.map((a) => (a.id === id ? { ...a, live: !a.live } : a)));
  }

  private resolveAudienceIds(aud: Audience): Set<string> {
    if (aud.kind === 'filter' && aud.filter) {
      return new Set(applyFilters(this.all(), aud.filter).map((p) => p.profileid));
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

  private withCounts(audiences: Audience[], participants: Participant[]): Audience[] {
    return audiences.map((a) => {
      if (a.kind === 'filter' && a.filter) return { ...a, count: applyFilters(participants, a.filter).length };
      return a;
    });
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
      list.map((p) => (ids.has(p.profileid) ? { ...p, subscriptionend: extendedEnd(p.subscriptionend, ext).toISOString() } : p))
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
}

@Component({
  selector: 'app-prompt-dialog',
  imports: [FormsModule],
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
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="value.trim().length < 2" (click)="confirm()">
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

  confirm(): void {
    const v = this.value.trim();
    if (v.length >= 2) this.ref.close(v);
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

@Component({
  selector: 'app-tag-manager-dialog',
  imports: [FormsModule],
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
        <div class="tagwrap">
          @for (t of store.reference().tags; track t.id) {
            <button class="tagchip" [class.on]="picked().has(t.id)" (click)="toggle(t.id)">
              {{ t.name }}
              @if (picked().has(t.id)) {
                <span class="material-symbols-rounded">check</span>
              }
            </button>
          }
        </div>

        <div class="create">
          <label class="dlg-label">Create a new tag</label>
          <div class="create-row">
            <input class="dlg-input" [(ngModel)]="newTag" placeholder="Tag name" (keyup.enter)="create()" />
            <button class="btn btn-ghost" [disabled]="newTag.trim().length < 2" (click)="create()">
              <span class="material-symbols-rounded">add</span> Create
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
    .tagwrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 22px;
    }
    .tagchip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--pi-border-strong);
      background: #fff;
      color: var(--pi-text);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 7px 12px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .tagchip:hover {
      border-color: var(--pi-accent);
    }
    .tagchip.on {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
      color: #fff;
    }
    .tagchip .material-symbols-rounded {
      font-size: 16px;
    }
    .create {
      border-top: 1px solid var(--pi-border);
      padding-top: 16px;
    }
    .create-row {
      display: flex;
      gap: 10px;
    }
    .create-row .dlg-input {
      flex: 1;
    }
    .create-row .btn {
      flex-shrink: 0;
    }
  `,
})
export class TagManagerDialogComponent {
  readonly ref = inject(MatDialogRef<TagManagerDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);
  readonly store = inject(ParticipantStore);
  private readonly snack = inject(MatSnackBar);

  readonly picked = signal<Set<string>>(new Set());
  newTag = '';

  toggle(id: string): void {
    this.picked.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  create(): void {
    const name = this.newTag.trim();
    if (name.length < 2) return;
    const tag = this.store.createTag(name, ['journey coach']);
    this.toggle(tag.id);
    this.newTag = '';
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
          <p>Saved filters, lists and segments in one place.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <table class="aud-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th class="num">Members</th>
              <th>Created by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (a of store.audiences(); track a.id) {
              <tr>
                <td>
                  <button class="link" (click)="load(a.id)">{{ a.name }}</button>
                  @if (a.live) {
                    <span class="pi-badge live">Live</span>
                  }
                </td>
                <td><span class="kind">{{ kindLabel(a.kind) }}</span></td>
                <td class="num">{{ a.count }}</td>
                <td class="by">{{ a.createdBy }}</td>
                <td class="row-actions">
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
        @if (store.audiences().length === 0) {
          <div class="empty">No audiences yet. Build a filter and save it as an audience.</div>
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
    .kind {
      font-size: 12px;
      color: var(--pi-text-2);
      background: var(--pi-surface-3);
      padding: 3px 9px;
      border-radius: 6px;
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
  readonly store = inject(ParticipantStore);

  kindLabel(k: AudienceKind): string {
    return k === 'filter' ? 'Saved filter' : k === 'list' ? 'List' : 'Segment';
  }
  load(id: string): void {
    this.store.loadAudience(id);
    this.ref.close();
  }
}

// ================================================================================================
// Dialog: quick compose
// ================================================================================================

export interface QuickField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'multiselect';
  placeholder?: string;
  options?: { value: string; label: string }[];
}
export interface QuickComposeData {
  icon: string;
  title: string;
  subtitle: string;
  fields: QuickField[];
  confirmText: string;
  confirmIcon: string;
  note?: string;
}

@Component({
  selector: 'app-quick-compose-dialog',
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">{{ data.icon }}</span></span>
        <div>
          <h2>{{ data.title }}</h2>
          <p>{{ data.subtitle }}</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        @for (f of data.fields; track f.key) {
          <div class="dlg-field">
            <label class="dlg-label">{{ f.label }}</label>
            @switch (f.type) {
              @case ('text') {
                <input class="dlg-input" [placeholder]="f.placeholder || ''" [(ngModel)]="values[f.key]" />
              }
              @case ('textarea') {
                <textarea class="dlg-textarea" [placeholder]="f.placeholder || ''" [(ngModel)]="values[f.key]"></textarea>
              }
              @case ('multiselect') {
                <div class="ms">
                  @for (o of f.options; track o.value) {
                    <button class="mschip" [class.on]="isOn(f.key, o.value)" (click)="toggle(f.key, o.value)">
                      {{ o.label }}
                      @if (isOn(f.key, o.value)) {
                        <span class="material-symbols-rounded">check</span>
                      }
                    </button>
                  }
                </div>
              }
            }
          </div>
        }
        @if (data.note) {
          <div class="note"><span class="material-symbols-rounded">info</span>{{ data.note }}</div>
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!valid()" (click)="confirm()">
          <span class="material-symbols-rounded">{{ data.confirmIcon }}</span> {{ data.confirmText }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .ms {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .mschip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--pi-border-strong);
      background: #fff;
      color: var(--pi-text);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 7px 12px;
      border-radius: 999px;
      cursor: pointer;
    }
    .mschip:hover {
      border-color: var(--pi-accent);
    }
    .mschip.on {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
      color: #fff;
    }
    .mschip .material-symbols-rounded {
      font-size: 16px;
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12.5px;
      color: var(--pi-text-2);
      background: var(--pi-surface-3);
      border-radius: 9px;
      padding: 10px 12px;
    }
    .note .material-symbols-rounded {
      font-size: 17px;
      color: var(--pi-accent);
    }
  `,
})
export class QuickComposeDialogComponent {
  readonly ref = inject(MatDialogRef<QuickComposeDialogComponent>);
  readonly data = inject<QuickComposeData>(MAT_DIALOG_DATA);

  values: Record<string, string> = {};
  private readonly multi = signal<Record<string, Set<string>>>({});

  isOn(key: string, value: string): boolean {
    return this.multi()[key]?.has(value) ?? false;
  }
  toggle(key: string, value: string): void {
    this.multi.update((m) => {
      const next = { ...m };
      const set = new Set(next[key] ?? []);
      set.has(value) ? set.delete(value) : set.add(value);
      next[key] = set;
      return next;
    });
  }

  valid(): boolean {
    return this.data.fields.every((f) => {
      if (f.type === 'multiselect') return (this.multi()[f.key]?.size ?? 0) > 0;
      return (this.values[f.key]?.trim().length ?? 0) > 0;
    });
  }

  confirm(): void {
    const out: Record<string, unknown> = { ...this.values };
    for (const [k, set] of Object.entries(this.multi())) out[k] = [...set];
    this.ref.close(out);
  }
}

// ================================================================================================
// Dialog: evolution summary
// ================================================================================================

export interface EvolutionRow {
  name: string;
  journey: string;
  tier: string;
  atc: number;
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
                <td class="num">{{ r.atc }}</td>
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
        score: p.atccount * 2 + p.consumedproducts.length * 3,
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
            <thead><tr><th>Participant</th><th>Status</th><th>Journey</th><th>Products</th></tr></thead>
            <tbody>
              @for (p of data.participants.slice(0, 250); track p.profileid) {
                <tr>
                  <td><div class="nm">{{ p.name }}</div><div class="em">{{ p.email }}</div></td>
                  <td>{{ p.customerstatus === 'none' ? '—' : p.customerstatus }}</td>
                  <td>{{ p.activejourney ? journeyMap()[p.activejourney] : '—' }}</td>
                  <td>{{ p.activeproduct.length }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (data.participants.length > 250) {
            <p class="more">Showing first 250 of {{ data.participants.length }}.</p>
          }
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-primary" (click)="ref.close()">Done</button>
      </div>
    </div>
  `,
  styles: `
    .cnt { font-size: 13px; color: var(--pi-text-2); margin-bottom: 10px; }
    .cl { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--pi-text-3); padding: 0 12px 8px; border-bottom: 1px solid var(--pi-border); }
    td { padding: 9px 12px; border-bottom: 0.5px solid var(--pi-border); vertical-align: middle; }
    .nm { font-weight: 600; }
    .em { font-size: 11px; color: var(--pi-text-3); }
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
}

// ================================================================================================
// Filter rail
// ================================================================================================

export interface FilterOption {
  value: string;
  label: string;
}
export interface FilterSection {
  group: keyof FilterModel;
  label: string;
  options: FilterOption[];
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
  { value: 'locked', label: 'Locked' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'banned', label: 'Banned' },
  { value: 'none', label: 'None' },
];

@Component({
  selector: 'app-filter-rail',
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
      <button class="reset" [disabled]="!store.activeFilterCount()" (click)="store.clearFilter()">Reset</button>
    </div>

    <div class="rail-body">
      @for (sec of sections(); track sec.group) {
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
              @for (o of sec.options; track o.value) {
                <label class="opt">
                  <input type="checkbox" [checked]="isChecked(sec.group, o.value)" (change)="toggle(sec.group, o.value)" />
                  <span class="box"></span>
                  <span class="opt-label">{{ o.label }}</span>
                </label>
              }
            </div>
          }
        </div>
      }

      <!-- ATC count -->
      <div class="section" [class.open]="isOpen('atc')">
        <button class="sec-head" (click)="toggleSection('atc')">
          <span class="sec-label">ATC count</span>
          @if (atc != null) {
            <span class="sec-count">1</span>
          }
          <span class="material-symbols-rounded chev">{{ isOpen('atc') ? 'expand_less' : 'expand_more' }}</span>
        </button>
        @if (isOpen('atc')) {
          <div class="sec-body">
            <div class="field-row">
              <span class="field-lead">At least</span>
              <input class="num-input" type="number" min="0" [value]="atc ?? ''" (input)="setAtc($any($event.target).value)" placeholder="0" />
            </div>
          </div>
        }
      </div>

      <!-- subscription dates -->
      <div class="section" [class.open]="isOpen('dates')">
        <button class="sec-head" (click)="toggleSection('dates')">
          <span class="sec-label">Subscription dates</span>
          <span class="material-symbols-rounded chev">{{ isOpen('dates') ? 'expand_less' : 'expand_more' }}</span>
        </button>
        @if (isOpen('dates')) {
          <div class="sec-body">
            <span class="mini-label">Start between</span>
            <div class="field-row two">
              <input class="date-input" type="date" [value]="dateVal('subscriptionStart','start')" (change)="setDate('subscriptionStart','start',$any($event.target).value)" />
              <input class="date-input" type="date" [value]="dateVal('subscriptionStart','end')" (change)="setDate('subscriptionStart','end',$any($event.target).value)" />
            </div>
            <span class="mini-label">End between</span>
            <div class="field-row two">
              <input class="date-input" type="date" [value]="dateVal('subscriptionEnd','start')" (change)="setDate('subscriptionEnd','start',$any($event.target).value)" />
              <input class="date-input" type="date" [value]="dateVal('subscriptionEnd','end')" (change)="setDate('subscriptionEnd','end',$any($event.target).value)" />
            </div>
          </div>
        }
      </div>

      <!-- product activity -->
      <div class="section" [class.open]="isOpen('activity')">
        <button class="sec-head" (click)="toggleSection('activity')">
          <span class="sec-label">Product activity</span>
          @if (rules('consumed').length + rules('unconsumed').length) {
            <span class="sec-count">{{ rules('consumed').length + rules('unconsumed').length }}</span>
          }
          <span class="material-symbols-rounded chev">{{ isOpen('activity') ? 'expand_less' : 'expand_more' }}</span>
        </button>
        @if (isOpen('activity')) {
          <div class="sec-body">
            @for (kind of ['consumed','unconsumed']; track kind) {
              <span class="mini-label">{{ kind === 'consumed' ? 'Consumed count' : 'Unconsumed count' }}</span>
              @for (rule of rules($any(kind)); track $index) {
                <div class="rule">
                  <select class="rule-sel" [value]="rule.productId" (change)="updateRule($any(kind), $index, { productId: $any($event.target).value })">
                    @for (p of products(); track p.id) {
                      <option [value]="p.id">{{ p.name }}</option>
                    }
                  </select>
                  <select class="rule-cmp" [value]="rule.comparison" (change)="updateRule($any(kind), $index, { comparison: $any($event.target).value })">
                    @for (c of comparisons; track c.value) {
                      <option [value]="c.value">{{ c.label }}</option>
                    }
                  </select>
                  <input class="rule-num" type="number" min="0" [value]="rule.count" (input)="updateRule($any(kind), $index, { count: asNum($any($event.target).value) })" />
                  <button class="rule-del" (click)="removeRule($any(kind), $index)">
                    <span class="material-symbols-rounded">close</span>
                  </button>
                </div>
              }
              <button class="add-rule" (click)="addRule($any(kind))">
                <span class="material-symbols-rounded">add</span> Add rule
              </button>
            }
          </div>
        }
      </div>
    </div>

    <div class="rail-foot">
      <button class="save-btn" [disabled]="!store.activeFilterCount()" (click)="save.emit()">
        <span class="material-symbols-rounded">bookmark_add</span> Save as audience
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

    .opt {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 5px 6px;
      border-radius: 7px;
      cursor: pointer;
      font-size: 13px;
      color: var(--pi-text-2);
    }
    .opt:hover {
      background: var(--pi-surface-3);
    }
    .opt input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
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
    .opt input:checked + .box {
      background: var(--pi-accent);
      border-color: var(--pi-accent);
    }
    .opt input:checked + .box::after {
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
    .opt input:checked ~ .opt-label {
      color: var(--pi-text);
      font-weight: 500;
    }

    .mini-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--pi-text-3);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 8px 2px 4px;
    }
    .field-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .field-row.two {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .field-lead {
      font-size: 13px;
      color: var(--pi-text-2);
    }
    .num-input,
    .date-input,
    .rule-num,
    .rule-sel,
    .rule-cmp {
      font-family: inherit;
      font-size: 13px;
      color: var(--pi-text);
      border: 1px solid var(--pi-border-strong);
      border-radius: 8px;
      padding: 7px 9px;
      background: #fff;
      width: 100%;
      outline: none;
    }
    .num-input:focus,
    .date-input:focus,
    .rule-num:focus,
    .rule-sel:focus,
    .rule-cmp:focus {
      border-color: var(--pi-accent);
    }
    .num-input {
      width: 90px;
    }

    .rule {
      display: grid;
      grid-template-columns: 1fr 52px 60px 28px;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
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

  readonly comparisons: { value: Comparison; label: string }[] = [
    { value: 'gte', label: '≥' },
    { value: 'eq', label: '=' },
    { value: 'lte', label: '≤' },
  ];

  // sections expanded by default; others start collapsed to avoid a wall of options
  readonly open = signal<Set<string>>(new Set(['customerstatus', 'activejourney', 'activeproduct', 'dates']));

  private opt = (arr: { id: string; name: string }[]): FilterOption[] => arr.map((a) => ({ value: a.id, label: a.name }));

  readonly sections = computed<FilterSection[]>(() => {
    const ref = this.store.reference();
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
      { group: 'activeproduct', label: 'Active products', options: this.opt(ref.products) },
      { group: 'tier', label: 'Tier', options: this.opt(ref.tiers) },
      { group: 'participantmode', label: 'Mode', options: this.opt(ref.modes) },
      { group: 'profiletags', label: 'Tags', options: ref.tags.map((t) => ({ value: t.id, label: t.name })) },
      { group: 'addons', label: 'Add-ons', options: this.opt(ref.products) },
      { group: 'gifts', label: 'Gifts', options: this.opt(ref.products) },
      { group: 'bonus', label: 'Bonus', options: this.opt(ref.products) },
      { group: 'events', label: 'Event', options: this.opt(ref.events) },
      { group: 'queues', label: 'Queue', options: this.opt(ref.queues) },
    ];
  });

  readonly products = computed(() => this.store.reference().products);

  toggleSection(key: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  isOpen(key: string): boolean {
    return this.open().has(key);
  }

  selectedArr(group: keyof FilterModel): string[] {
    return (this.store.filter()[group] as unknown as string[]) ?? [];
  }
  isChecked(group: keyof FilterModel, value: string): boolean {
    return this.selectedArr(group).includes(value);
  }
  countFor(group: keyof FilterModel): number {
    return this.selectedArr(group).length;
  }
  toggle(group: keyof FilterModel, value: string): void {
    const cur = this.selectedArr(group);
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    this.store.patchFilter({ [group]: next } as Partial<FilterModel>);
  }

  // ATC count
  get atc(): number | null {
    return this.store.filter().atcCountMin;
  }
  setAtc(value: string): void {
    const n = value === '' ? null : Math.max(0, Number(value));
    this.store.patchFilter({ atcCountMin: Number.isNaN(n as number) ? null : n });
  }

  // date ranges
  dateVal(group: 'subscriptionStart' | 'subscriptionEnd', edge: 'start' | 'end'): string {
    const v = this.store.filter()[group][edge];
    return v ? v.substring(0, 10) : '';
  }
  setDate(group: 'subscriptionStart' | 'subscriptionEnd', edge: 'start' | 'end', value: string): void {
    const cur = this.store.filter()[group];
    this.store.patchFilter({ [group]: { ...cur, [edge]: value ? new Date(value).toISOString() : null } });
  }

  // product activity rules
  rules(kind: 'consumed' | 'unconsumed'): ProductCountRule[] {
    return this.store.filter()[kind];
  }
  addRule(kind: 'consumed' | 'unconsumed'): void {
    const first = this.products()[0]?.id ?? '';
    this.store.patchFilter({ [kind]: [...this.rules(kind), { productId: first, comparison: 'gte', count: 1 }] });
  }
  updateRule(kind: 'consumed' | 'unconsumed', index: number, patch: Partial<ProductCountRule>): void {
    const next = this.rules(kind).map((r, i) => (i === index ? { ...r, ...patch } : r));
    this.store.patchFilter({ [kind]: next });
  }
  removeRule(kind: 'consumed' | 'unconsumed', index: number): void {
    this.store.patchFilter({ [kind]: this.rules(kind).filter((_, i) => i !== index) });
  }

  asNum(v: string): number {
    return Math.max(0, Number(v) || 0);
  }
}

// ================================================================================================
// Active filter chips
// ================================================================================================

@Component({
  selector: 'app-active-filter-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.chips().length || store.activeSignal()) {
      <div class="bar">
        @if (store.activeSignal(); as sig) {
          <button class="chip signal" (click)="store.clearSignal()">
            <span class="material-symbols-rounded lead-ic">insights</span>
            <span class="txt">{{ sig.label }}</span>
            <span class="material-symbols-rounded">close</span>
          </button>
        }
        @if (store.chips().length) {
          <span class="lead">Filters</span>
          @for (chip of store.chips(); track chip.label) {
            <button class="chip" (click)="store.removeChip(chip)">
              <span class="txt">{{ chip.label }}</span>
              <span class="material-symbols-rounded">close</span>
            </button>
          }
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
    .chip.signal .lead-ic {
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
}

// ================================================================================================
// Audience switcher
// ================================================================================================

@Component({
  selector: 'app-audience-switcher',
  imports: [MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="trigger" [matMenuTriggerFor]="menu">
      <span class="material-symbols-rounded lead">groups</span>
      <span class="label">{{ activeName() }}</span>
      <span class="material-symbols-rounded chev">expand_more</span>
    </button>

    <mat-menu #menu="matMenu" class="aud-menu" xPosition="before">
      <div class="menu-head" (click)="$event.stopPropagation()">Audiences</div>
      @for (kind of kinds; track kind.key) {
        @if (byKind(kind.key).length) {
          <div class="group-label" (click)="$event.stopPropagation()">
            <span class="material-symbols-rounded">{{ kind.icon }}</span>{{ kind.label }}
          </div>
          @for (aud of byKind(kind.key); track aud.id) {
            <button mat-menu-item class="aud-item" (click)="store.loadAudience(aud.id)">
              <span class="dot" [class.on]="store.activeAudienceId() === aud.id"></span>
              <span class="aud-name">{{ aud.name }}</span>
              <span class="aud-count">{{ aud.count }}</span>
              @if (aud.isDefault) {
                <span class="material-symbols-rounded star" matTooltip="Default">star</span>
              }
            </button>
          }
        }
      }
      <div class="menu-foot">
        <button mat-menu-item (click)="manage.emit()">
          <span class="material-symbols-rounded">tune</span> Manage audiences
        </button>
      </div>
    </mat-menu>
  `,
  styles: `
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
      max-width: 280px;
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
    }
    .chev {
      font-size: 19px;
      color: var(--pi-text-3);
      margin-left: auto;
    }
    .menu-head {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--pi-text-3);
      padding: 12px 16px 6px;
    }
    .group-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--pi-text-2);
      padding: 8px 16px 4px;
    }
    .group-label .material-symbols-rounded {
      font-size: 15px;
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

  readonly manage = output();

  readonly kinds: { key: AudienceKind; label: string; icon: string }[] = [
    { key: 'filter', label: 'Saved filters', icon: 'filter_alt' },
    { key: 'list', label: 'Lists', icon: 'format_list_bulleted' },
    { key: 'segment', label: 'Segments', icon: 'donut_small' },
  ];

  readonly activeName = computed(() => {
    const id = this.store.activeAudienceId();
    if (!id) return 'All participants';
    return this.store.audiences().find((a) => a.id === id)?.name ?? 'All participants';
  });

  byKind(kind: AudienceKind): Audience[] {
    return this.store.audiences().filter((a) => a.kind === kind);
  }
}

// ================================================================================================
// Participant table
// ================================================================================================

export type SortDir = 'asc' | 'desc' | null;

@Component({
  selector: 'app-participant-table',
  imports: [MatTooltipModule],
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
      <div class="table-scroll">
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
                [class.num]="def.type === 'number'"
                [class.frozen]="isFrozen(def.key)"
                [class.frozen-edge]="lastFrozenKey() === def.key"
                [style.left.px]="leftOf(def.key)"
                (click)="toggleSort(def.key)"
              >
                <span class="th-label">{{ def.label }}</span>
                @if (sortKey() === def.key && sortDir()) {
                  <span class="material-symbols-rounded sort">{{ sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</span>
                }
              </div>
            }
          </div>

          <div class="tbody">
            @for (p of rows(); track p.profileid) {
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
                  [class.num]="def.type === 'number'"
                  [class.frozen]="isFrozen(def.key)"
                  [class.frozen-edge]="lastFrozenKey() === def.key"
                  [style.left.px]="leftOf(def.key)"
                >
                  @switch (def.type) {
                  @case ('name') {
                    <span class="avatar">{{ initials(p) }}</span>
                    <span class="name-block">
                      <span class="name" (click)="openProfile(p, $event)">{{ p.name }}</span>
                      <span class="email">{{ p.email }}</span>
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
                        @for (v of arrayValues(p, def).slice(0, 2); track v) {
                          <span class="chip tag">{{ v }}</span>
                        }
                        @if (arrayValues(p, def).length > 2) {
                          <span class="chip tag more" [matTooltip]="arrayValues(p, def).join(', ')">+{{ arrayValues(p, def).length - 2 }}</span>
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
      align-items: center;
      height: 46px;
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
      padding: 0 14px;
      font-size: 13px;
      color: var(--pi-text);
      min-width: 0;
      overflow: hidden;
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
      gap: 5px;
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
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 120px;
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

  private colWidth(c: string): number {
    if (c === 'select') return 44;
    if (c === 'name') return 240;
    if (c === 'atccount') return 110;
    return 150;
  }

  // Frozen (sticky-left) columns = the select column + any pinned columns, taken contiguously
  // from the front of displayedColumns. Maps each frozen column key to its left offset in px.
  readonly frozenLefts = computed<Record<string, number>>(() => {
    const cols = this.store.displayedColumns();
    const pin = this.store.pinned();
    const map: Record<string, number> = {};
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
      .map((c) => {
        if (c in frozen) return `${this.colWidth(c)}px`;
        if (c === 'name') return 'minmax(240px, 1.4fr)';
        if (c === 'atccount') return '110px';
        return 'minmax(150px, 1fr)';
      })
      .join(' ');
  });

  readonly minWidth = computed(() => this.store.displayedColumns().reduce((w, c) => w + this.colWidth(c), 0));

  readonly rows = computed<Participant[]>(() => {
    const data = [...this.store.filtered()];
    const key = this.sortKey();
    const dir = this.sortDir();
    if (!dir) return data;
    const def = COLUMN_DEF_MAP[key];
    data.sort((a, b) => {
      const av = this.sortValue(a, key, def);
      const bv = this.sortValue(b, key, def);
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  });

  toggleSort(key: string): void {
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDir.set('asc');
      return;
    }
    const cur = this.sortDir();
    this.sortDir.set(cur === 'asc' ? 'desc' : cur === 'desc' ? null : 'asc');
  }

  private sortValue(p: Participant, key: string, def: ColumnDef): string | number {
    const raw = (p as unknown as Record<string, unknown>)[key];
    if (def?.type === 'number') return (raw as number) ?? -1;
    if (def?.type === 'date') return raw ? new Date(raw as string).getTime() : 0;
    if (Array.isArray(raw)) return raw.length;
    return this.cellText(p, def).toLowerCase();
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

  arrayValues(p: Participant, def: ColumnDef): string[] {
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    if (!Array.isArray(raw)) return [];
    return (raw as string[]).map((id) => this.resolve(def.resolve, id));
  }

  cellText(p: Participant, def: ColumnDef): string {
    if (!def) return '';
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    if (def.type === 'date') return raw ? this.formatDate(raw as string) : '—';
    if (def.type === 'number') return raw == null ? '0' : String(raw);
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
  | 'tag'
  | 'addToList'
  | 'subscription'
  | 'remarks'
  | 'products'
  | 'playlist'
  | 'evolution'
  | 'broadcast'
  | 'interim'
  | 'wishlist';

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
          <button class="act" [matMenuTriggerFor]="comm">
            <span class="material-symbols-rounded">campaign</span> Communicate
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button class="act" [matMenuTriggerFor]="org">
            <span class="material-symbols-rounded">label</span> Organize
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button class="act" [matMenuTriggerFor]="upd">
            <span class="material-symbols-rounded">edit_note</span> Update
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button class="act primary" (click)="action.emit('evolution')">
            <span class="material-symbols-rounded">insights</span> Evolution
          </button>
          <button class="act" [matMenuTriggerFor]="more" aria-label="More actions">
            <span class="material-symbols-rounded">more_horiz</span>
          </button>
        </div>
      </div>

      <mat-menu #more="matMenu">
        <button mat-menu-item (click)="action.emit('broadcast')">
          <span class="material-symbols-rounded mi">podcasts</span> Broadcast in Breakthroughs
        </button>
        <button mat-menu-item (click)="action.emit('interim')">
          <span class="material-symbols-rounded mi">description</span> Manage interim report
        </button>
        <button mat-menu-item (click)="action.emit('wishlist')">
          <span class="material-symbols-rounded mi">favorite</span> Evolution wishlist
        </button>
      </mat-menu>

      <mat-menu #comm="matMenu">
        <button mat-menu-item (click)="action.emit('email')">
          <span class="material-symbols-rounded mi">mail</span> Send email
        </button>
        <button mat-menu-item (click)="action.emit('whatsapp')">
          <span class="material-symbols-rounded mi">chat</span> Send WhatsApp
        </button>
        <button mat-menu-item (click)="action.emit('notify')">
          <span class="material-symbols-rounded mi">notifications</span> In-app notification
        </button>
      </mat-menu>

      <mat-menu #org="matMenu">
        <button mat-menu-item (click)="action.emit('tag')">
          <span class="material-symbols-rounded mi">sell</span> Manage tags
        </button>
        <button mat-menu-item (click)="action.emit('addToList')">
          <span class="material-symbols-rounded mi">playlist_add</span> Save as list
        </button>
        <button mat-menu-item (click)="action.emit('playlist')">
          <span class="material-symbols-rounded mi">queue_music</span> Recommend playlist
        </button>
      </mat-menu>

      <mat-menu #upd="matMenu">
        <button mat-menu-item (click)="action.emit('remarks')">
          <span class="material-symbols-rounded mi">sticky_note_2</span> Add remark
        </button>
        <button mat-menu-item (click)="action.emit('subscription')">
          <span class="material-symbols-rounded mi">event_repeat</span> Extend subscription
        </button>
        <button mat-menu-item (click)="action.emit('products')">
          <span class="material-symbols-rounded mi">inventory_2</span> Add products
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

    <mat-menu #menu="matMenu" class="col-menu">
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
      @if (available().length) {
        <div class="head sub" (click)="$event.stopPropagation()">Add column</div>
        <div class="add-list" (click)="$event.stopPropagation()">
          @for (def of available(); track def.key) {
            <button class="add" (click)="store.addColumn(def.key)">
              <span class="material-symbols-rounded">add</span>{{ def.label }}
            </button>
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
  `,
})
export class ColumnConfigComponent {
  readonly store = inject(ParticipantStore);
  readonly available = computed(() => this.store.availableColumns());

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
  `,
  styles: `
    .panel {
      display: flex;
      gap: 22px;
      padding: 14px 18px;
      overflow-x: auto;
      background: var(--pi-surface-2);
      border-bottom: 1px solid var(--pi-border);
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
  readonly categories = SIGNAL_CATEGORIES;

  byCat(cat: SignalCategory): SignalDef[] {
    return SIGNALS.filter((s) => s.category === cat);
  }
  count(id: string): number {
    return this.store.signalCounts()[id] ?? 0;
  }
}

// ================================================================================================
// Communications analytics panel
// ================================================================================================

@Component({
  selector: 'app-comms-analytics-panel',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comms" (click)="$event.stopPropagation()">
      <div class="head">
        <span class="material-symbols-rounded">campaign</span>
        <span>Communications analytics</span>
      </div>

      @if (!store.commsAnalytics()) {
        <div class="loading">Loading analytics…</div>
      } @else {
        @for (ch of channels; track ch.key) {
          <div class="channel">
            <div class="ch-head">
              <span class="ch-ic material-symbols-rounded">{{ ch.icon }}</span>
              <span class="ch-name">{{ ch.label }}</span>
              <span class="ch-total">{{ stats(ch.key).total | number }}</span>
            </div>
            <div class="stats">
              <span class="stat sent"><b>{{ stats(ch.key).sent | number }}</b> sent</span>
              <span class="stat queued"><b>{{ stats(ch.key).queued | number }}</b> queued</span>
              <span class="stat failed"><b>{{ stats(ch.key).failed | number }}</b> failed</span>
            </div>
            @if (stats(ch.key).recent.length) {
              <div class="recent">
                @for (c of stats(ch.key).recent; track $index) {
                  <div class="row">
                    <span class="r-name" [title]="c.name">{{ c.name }}</span>
                    <span class="r-meta">
                      <span class="r-recip">{{ c.recipients | number }}</span>
                      <span class="r-status tone-{{ tone(c.status) }}">{{ c.status }}</span>
                      <span class="r-date">{{ fmtDate(c.date) }}</span>
                    </span>
                  </div>
                }
              </div>
            } @else {
              <div class="empty">No recent campaigns</div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    .comms {
      width: 380px;
      max-height: 70vh;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      color: var(--pi-text);
      padding: 14px 16px 10px;
      border-bottom: 1px solid var(--pi-border);
      position: sticky;
      top: 0;
      background: var(--pi-surface);
    }
    .head .material-symbols-rounded {
      font-size: 19px;
      color: var(--pi-accent);
    }
    .loading,
    .empty {
      padding: 14px 16px;
      font-size: 12.5px;
      color: var(--pi-text-3);
    }
    .channel {
      padding: 12px 16px;
      border-bottom: 1px solid #eef1f4;
    }
    .ch-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .ch-ic {
      font-size: 18px;
      color: var(--pi-text-2);
    }
    .ch-name {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--pi-text);
    }
    .ch-total {
      margin-left: auto;
      font-size: 13.5px;
      font-weight: 700;
      color: var(--pi-text);
      font-variant-numeric: tabular-nums;
    }
    .stats {
      display: flex;
      gap: 14px;
      margin-bottom: 10px;
    }
    .stat {
      font-size: 12px;
      color: var(--pi-text-2);
    }
    .stat b {
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .stat.sent b {
      color: var(--pi-status-active);
    }
    .stat.queued b {
      color: var(--pi-status-late);
    }
    .stat.failed b {
      color: var(--pi-status-banned);
    }
    .recent {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 0;
    }
    .r-name {
      flex: 1;
      font-size: 12.5px;
      color: var(--pi-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .r-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .r-recip {
      font-size: 11.5px;
      color: var(--pi-text-3);
      font-variant-numeric: tabular-nums;
    }
    .r-status {
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      text-transform: capitalize;
    }
    .r-date {
      font-size: 11px;
      color: var(--pi-text-3);
      width: 52px;
      text-align: right;
    }
    .tone-active {
      color: var(--pi-status-active);
      background: var(--pi-status-active-bg);
    }
    .tone-late {
      color: var(--pi-status-late);
      background: var(--pi-status-late-bg);
    }
    .tone-banned {
      color: var(--pi-status-banned);
      background: var(--pi-status-banned-bg);
    }
    .tone-none {
      color: var(--pi-status-none);
      background: var(--pi-status-none-bg);
    }
  `,
})
export class CommsAnalyticsPanelComponent {
  readonly store = inject(ParticipantStore);

  readonly channels: { key: CommsChannel; label: string; icon: string }[] = [
    { key: 'email', label: 'Email', icon: 'mail' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
    { key: 'notification', label: 'Notifications', icon: 'notifications' },
  ];

  stats(key: CommsChannel): CommsChannelStats {
    const a = this.store.commsAnalytics();
    return a ? a[key] : emptyChannelStats();
  }

  tone(status: string): string {
    const s = status.toLowerCase();
    if (['sent', 'created', 'validated', 'delivered', 'completed', 'success', 'approved'].includes(s)) return 'active';
    if (s === 'queued' || s === 'scheduled' || s === 'pending') return 'late';
    if (s === 'failed' || s === 'rejected' || s === 'error') return 'banned';
    return 'none';
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
}

// ================================================================================================
// Page component
// ================================================================================================

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
    CommsAnalyticsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-intelligence.component.html',
  styleUrl: './participant-intelligence.component.css',
  providers: [ParticipantStore, ParticipantDataService],
})
export class ParticipantIntelligenceComponent implements OnInit {
  readonly store = inject(ParticipantStore);
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

  toggleRail(): void {
    this.railOpen.update((v) => !v);
  }

  toggleInsights(): void {
    this.insightsOpen.update((v) => !v);
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
          title: 'Save as audience',
          subtitle: `${this.store.filteredCount()} participants match the current filter.`,
          label: 'Audience name',
          placeholder: 'e.g. Active gold-tier renewals',
          confirmText: 'Save audience',
          icon: 'bookmark_add',
        },
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (name) {
          this.store.saveCurrentAsAudience(name);
          this.snack.open(`Saved audience "${name}"`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  openManageAudiences(): void {
    this.dialog.open(ManageAudiencesDialogComponent, this.dlg('720px'));
  }

  // ---- bulk actions ----
  handleBulk(action: BulkAction): void {
    const count = this.store.selectedCount();
    if (count === 0) return;
    switch (action) {
      case 'email':
        return this.composeEmail();
      case 'whatsapp':
        return this.composeWhatsapp();
      case 'notify':
        return this.notify();
      case 'tag':
        this.dialog.open(TagManagerDialogComponent, { ...this.dlg('520px'), data: { count } });
        return;
      case 'addToList':
        return this.saveAsList();
      case 'subscription':
        return this.extendSubscription();
      case 'remarks':
        return this.addRemark();
      case 'products':
        return this.addProducts();
      case 'playlist':
        return this.recommendPlaylist();
      case 'evolution':
        this.dialog.open(EvolutionDialogComponent, {
          ...this.dlg('760px'),
          data: { participants: this.store.selectedParticipants() },
        });
        return;
      case 'broadcast':
        return this.broadcast();
      case 'interim':
        return this.interimReport();
      case 'wishlist':
        return this.evolutionWishlist();
      default:
        return;
    }
  }

  private composeStub(data: QuickComposeData, doneMsg: string): void {
    this.dialog
      .open(QuickComposeDialogComponent, { ...this.dlg('480px'), data })
      .afterClosed()
      .subscribe((r) => {
        if (r) this.snack.open(doneMsg.replace('{n}', String(this.store.selectedCount())), 'Dismiss', { duration: 3500 });
      });
  }

  private broadcast(): void {
    this.composeStub(
      {
        icon: 'podcasts',
        title: 'Broadcast in Breakthroughs',
        subtitle: `Send an in-app broadcast to ${this.store.selectedCount()} participants.`,
        fields: [{ key: 'message', label: 'Message', type: 'textarea', placeholder: 'What do you want to broadcast?' }],
        confirmText: 'Queue broadcast',
        confirmIcon: 'send',
        note: 'Broadcast delivery is not wired up yet — nothing is sent.',
      },
      'Broadcast drafted for {n} — delivery isn’t wired up yet'
    );
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
      .open(EmailInputComponent, { panelClass: 'pi-dialog', minWidth: '600px', disableClose: true, data: this.store.selectedParticipants() })
      .afterClosed()
      .subscribe(async (result: any) => {
        if (!result) return;
        const n = this.store.selectedCount();
        try {
          if (result.status === 'queued' || result.status === 'send') {
            await setDoc(doc(collection(this.firestore, 'email archive'), result.docid), result, { merge: true });
            this.store.bumpQueued('email');
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
        data: this.store.selectedParticipants(),
      })
      .afterClosed()
      .subscribe((r: any) => {
        if (!r) return;
        const n = this.store.selectedCount();
        if (r === 'queued') {
          this.store.bumpQueued('whatsapp');
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
        data: this.store.selectedParticipants(),
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
        },
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

  private addProducts(): void {
    const data: QuickComposeData = {
      icon: 'inventory_2',
      title: 'Add products',
      subtitle: `Add products to ${this.store.selectedCount()} participants.`,
      fields: [
        {
          key: 'products',
          label: 'Products',
          type: 'multiselect',
          options: this.store.reference().products.map((p) => ({ value: p.id, label: p.name })),
        },
      ],
      confirmText: 'Add products',
      confirmIcon: 'check',
    };
    this.dialog
      .open(QuickComposeDialogComponent, { ...this.dlg('480px'), data })
      .afterClosed()
      .subscribe((r) => {
        if (r) this.snack.open(`Added products to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
      });
  }

  private recommendPlaylist(): void {
    const data: QuickComposeData = {
      icon: 'queue_music',
      title: 'Recommend playlist',
      subtitle: `Curate content for ${this.store.selectedCount()} participants.`,
      fields: [
        { key: 'title', label: 'Playlist title', type: 'text', placeholder: 'e.g. Momentum reset' },
        {
          key: 'content',
          label: 'Content',
          type: 'multiselect',
          options: [
            { value: 'eiflix', label: 'EIFLIX series' },
            { value: 'solar', label: 'SolarVoice' },
            { value: 'general', label: 'General content' },
          ],
        },
      ],
      confirmText: 'Recommend',
      confirmIcon: 'check',
    };
    this.dialog
      .open(QuickComposeDialogComponent, { ...this.dlg('480px'), data })
      .afterClosed()
      .subscribe((r) => {
        if (r) this.snack.open(`Recommended playlist to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
      });
  }
}
