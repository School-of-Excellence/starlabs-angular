import {
  FilterChip,
  FilterModel,
  Participant,
  ProductCountRule,
  ReferenceData,
} from '../models/participant.model';

// Pure, testable AND-combination filter. Replaces the original imperative onDataSearch loop.

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

function matchesProductCount(p: Participant, rule: ProductCountRule): boolean {
  const count = p.productcount[rule.productId] ?? 0;
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

export function applyFilters(participants: Participant[], f: FilterModel): Participant[] {
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
    for (const rule of f.consumed) if (!matchesProductCount(p, rule)) return false;
    for (const rule of f.unconsumed) if (!matchesProductCount(p, rule)) return false;
    return true;
  });
}

// Builds the removable pills shown above the table from the current filter model.
export function deriveChips(f: FilterModel, ref: ReferenceData): FilterChip[] {
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

function cmp(c: string): string {
  return c === 'eq' ? '=' : c === 'gte' ? '≥' : '≤';
}

export function countActiveFilters(f: FilterModel): number {
  return deriveChips(f, { journeys: [], products: [], modes: [], tiers: [], tags: [], events: [], queues: [], supportCategories: [] }).length;
}
