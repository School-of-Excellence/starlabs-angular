import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ParticipantDataService } from './participant-data.service';
import {
  Audience,
  CustomerStatus,
  EmiStatus,
  FinancialStatus,
  NamedRef,
  Participant,
  ReferenceData,
  SupportStatus,
  Tag,
  emptyFilter,
} from '../models/participant.model';

// Deterministic-enough mock generator. Mirrors the real participant metadata shape
// so the screen looks and behaves like production without a backend.

const FIRST = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Ishaan', 'Saanvi', 'Kabir', 'Myra', 'Reyansh', 'Anika', 'Arjun', 'Kiara', 'Vihaan', 'Aadhya', 'Krishna', 'Riya', 'Sai', 'Pari', 'Dhruv', 'Navya', 'Rohan', 'Aisha', 'Karan', 'Tara', 'Neil', 'Zara', 'Veer', 'Mira', 'Yash'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Menon', 'Gupta', 'Rao', 'Mehta', 'Joshi', 'Kulkarni', 'Bose', 'Khanna', 'Chopra', 'Pillai', 'Banerjee', 'Das', 'Kapoor', 'Malhotra'];

const JOURNEYS: NamedRef[] = [
  { id: 'jr-foundation', name: 'Foundation' },
  { id: 'jr-breakthrough', name: 'Breakthrough' },
  { id: 'jr-mastery', name: 'Mastery' },
  { id: 'jr-elite', name: 'Elite' },
  { id: 'jr-legacy', name: 'Legacy' },
  { id: 'jr-ignite', name: 'Ignite' },
];

const PRODUCTS: NamedRef[] = [
  { id: 'pr-up-live', name: 'UP! Live' },
  { id: 'pr-cpm', name: 'CPM Program' },
  { id: 'pr-lyl', name: 'Love Your Life' },
  { id: 'pr-big', name: 'B!G Intensive' },
  { id: 'pr-eis', name: 'EIS Coaching' },
  { id: 'pr-arena', name: 'Arena Pass' },
  { id: 'pr-solar', name: 'SolarVoice' },
  { id: 'pr-eiflix', name: 'EIFLIX Plus' },
  { id: 'pr-retreat', name: 'Annual Retreat' },
  { id: 'pr-mentor', name: 'Mentor Circle' },
];

const MODES: NamedRef[] = [
  { id: 'md-online', name: 'Online' },
  { id: 'md-hybrid', name: 'Hybrid' },
  { id: 'md-inperson', name: 'In-person' },
];

const TIERS: NamedRef[] = [
  { id: 'ti-bronze', name: 'Bronze' },
  { id: 'ti-silver', name: 'Silver' },
  { id: 'ti-gold', name: 'Gold' },
  { id: 'ti-platinum', name: 'Platinum' },
];

const TAGS: Tag[] = [
  { id: 'tg-vip', name: 'VIP', tagsfor: ['journey coach'], isActive: true },
  { id: 'tg-atrisk', name: 'At risk', tagsfor: ['journey coach'], isActive: true },
  { id: 'tg-champion', name: 'Champion', tagsfor: ['live event'], isActive: true },
  { id: 'tg-newjoiner', name: 'New joiner', tagsfor: ['journey coach'], isActive: true },
  { id: 'tg-renewal', name: 'Renewal due', tagsfor: ['queue event'], isActive: true },
  { id: 'tg-advocate', name: 'Advocate', tagsfor: ['live event'], isActive: true },
  { id: 'tg-dormant', name: 'Dormant', tagsfor: ['journey coach'], isActive: true },
];

const SUPPORT_CATEGORIES = ['Billing', 'Technical', 'Content access', 'Scheduling', 'Refund', 'General'];

const CUSTOMER_STATUSES: CustomerStatus[] = ['active', 'non active', 'discontinued', 'late', 'banned', 'none'];
const FINANCIAL_STATUSES: FinancialStatus[] = ['regular', 'locked', 'defaulted', 'discontinued', 'banned', 'none'];
const EMI_STATUSES: EmiStatus[] = ['on-track', 'overdue', 'completed', 'none'];

let seed = 1337;
function rnd(): number {
  // Mulberry32 — stable sequence so the dataset is identical each load.
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const weighted = <T>(pairs: [T, number][]): T => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) {
    if ((r -= w) <= 0) return v;
  }
  return pairs[0][0];
};
const sample = <T>(arr: T[], max: number): T[] => {
  const n = Math.floor(rnd() * (max + 1));
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};
const isoDaysFromNow = (days: number): string => {
  const ms = Date.UTC(2026, 5, 16) + days * 86400000;
  return new Date(ms).toISOString();
};

function makeParticipant(i: number): Participant {
  const first = pick(FIRST);
  const last = pick(LAST);
  const name = `${first} ${last}`;
  const customerstatus = weighted<CustomerStatus>([
    ['active', 45],
    ['non active', 20],
    ['late', 12],
    ['discontinued', 12],
    ['none', 8],
    ['banned', 3],
  ]);
  const registered = rnd() > 0.25;
  const activeProducts = sample(PRODUCTS, 3).map((p) => p.id);
  const consumed = sample(PRODUCTS, 5).map((p) => p.id);
  const unconsumed = sample(PRODUCTS, 4).map((p) => p.id);
  const productcount: Record<string, number> = {};
  for (const p of PRODUCTS) productcount[p.id] = Math.floor(rnd() * 12);
  const subStart = customerstatus === 'none' ? null : isoDaysFromNow(-Math.floor(rnd() * 720) - 30);
  const subEnd = customerstatus === 'none' ? null : isoDaysFromNow(Math.floor(rnd() * 400) - 60);
  const hasSupport = rnd() > 0.7;

  return {
    profileid: `pid-${String(i).padStart(5, '0')}`,
    name,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    phonenumber: `9${Math.floor(100000000 + rnd() * 899999999)}`,
    countrycode: pick(['+91', '+1', '+44', '+61', '+971']),
    registered,
    participantmode: pick(MODES).id,
    customerstatus,
    financialstatus: weighted<FinancialStatus>([
      ['regular', 55],
      ['locked', 12],
      ['defaulted', 12],
      ['discontinued', 12],
      ['none', 6],
      ['banned', 3],
    ]),
    activejourney: customerstatus === 'none' ? null : pick(JOURNEYS).id,
    lastcompletedjourney: rnd() > 0.4 ? pick(JOURNEYS).id : null,
    higherorderpurchase: rnd() > 0.6 ? pick(JOURNEYS).id : null,
    activeproduct: activeProducts,
    consumedproducts: consumed,
    unconsumedproducts: unconsumed,
    addons: sample(PRODUCTS, 2).map((p) => p.id),
    gifts: sample(PRODUCTS, 1).map((p) => p.id),
    bonus: sample(PRODUCTS, 1).map((p) => p.id),
    tier: rnd() > 0.5 ? [pick(TIERS).id] : [],
    profiletags: sample(TAGS, 3).map((t) => t.id),
    atccount: weighted<number>([
      [0, 30],
      [Math.floor(rnd() * 3) + 1, 40],
      [Math.floor(rnd() * 8) + 3, 25],
      [Math.floor(rnd() * 20) + 10, 5],
    ]),
    productcount,
    customersupport: {
      status: hasSupport ? pick<SupportStatus>(['Open', 'Closed']) : 'none',
      category: hasSupport ? pick(SUPPORT_CATEGORIES) : null,
    },
    remarks:
      rnd() > 0.6
        ? [
            {
              date: isoDaysFromNow(-Math.floor(rnd() * 200)),
              note: pick([
                'Followed up on renewal, awaiting confirmation.',
                'Requested payment-plan extension.',
                'Highly engaged in last cohort.',
                'Pending onboarding call.',
                'Flagged for re-engagement campaign.',
              ]),
              givenby: pick(['Coach Asha', 'Coach Ravi', 'Support', 'EIS Team']),
            },
          ]
        : [],
    subscriptionstart: subStart,
    subscriptionend: subEnd,
    lastpaymentdate: rnd() > 0.3 ? isoDaysFromNow(-Math.floor(rnd() * 120)) : null,
    purchasedate: rnd() > 0.2 ? isoDaysFromNow(-Math.floor(rnd() * 800)) : null,
    dateofbirth: isoDaysFromNow(-Math.floor(rnd() * 18000) - 7000),
    emiStatus: weighted<EmiStatus>([
      ['on-track', 40],
      ['completed', 30],
      ['overdue', 10],
      ['none', 20],
    ]),
    eiflix: sample(['Series A', 'Series B', 'Series C'], 2),
    solarvoice: sample(['SV Morning', 'SV Focus', 'SV Calm'], 2),
    generalcontent: sample(['GC Mindset', 'GC Health', 'GC Wealth'], 2),
  };
}

@Injectable()
export class MockParticipantDataService extends ParticipantDataService {
  private readonly reference: ReferenceData = {
    journeys: JOURNEYS,
    products: PRODUCTS,
    modes: MODES,
    tiers: TIERS,
    tags: TAGS,
    supportCategories: SUPPORT_CATEGORIES,
  };

  private readonly participants: Participant[] = Array.from({ length: 3500 }, (_, i) => makeParticipant(i + 1));

  getReferenceData(): Observable<ReferenceData> {
    return of(this.reference).pipe(delay(150));
  }

  // Simulates the bulk load on screen open.
  getParticipants(): Observable<Participant[]> {
    return of(this.participants).pipe(delay(500));
  }

  getAudiences(): Observable<Audience[]> {
    const sampleFilter = emptyFilter();
    sampleFilter.customerstatus = ['active'];
    const lateFilter = emptyFilter();
    lateFilter.customerstatus = ['late'];
    const eliteFilter = emptyFilter();
    eliteFilter.activejourney = ['jr-elite', 'jr-legacy'];

    const seedAudiences: Audience[] = [
      { id: 'aud-active', name: 'Active customers', kind: 'filter', isDefault: true, createdBy: 'You', createdDate: isoDaysFromNow(-40), count: 0, filter: sampleFilter },
      { id: 'aud-late', name: 'Late / needs attention', kind: 'filter', isDefault: false, createdBy: 'Coach Ravi', createdDate: isoDaysFromNow(-12), count: 0, filter: lateFilter },
      { id: 'aud-elite', name: 'Elite & Legacy journeys', kind: 'filter', isDefault: false, createdBy: 'You', createdDate: isoDaysFromNow(-5), count: 0, filter: eliteFilter },
      { id: 'aud-vip-list', name: 'VIP outreach list', kind: 'list', isDefault: false, createdBy: 'EIS Team', createdDate: isoDaysFromNow(-20), count: 42, live: true, profileIds: this.participants.slice(0, 42).map((p) => p.profileid) },
      { id: 'aud-q3-segment', name: 'Q3 renewal segment', kind: 'segment', isDefault: false, createdBy: 'You', createdDate: isoDaysFromNow(-8), count: 0, memberAudienceIds: ['aud-late', 'aud-vip-list'] },
    ];
    return of(seedAudiences).pipe(delay(150));
  }
}
