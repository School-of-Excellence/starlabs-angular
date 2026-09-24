// Where each segment condition reads its data, per participant.
// Source: `participant metadata/{profileid}` (the Cloud Functions projection). Journey and product values are
// `journey` / `products` doc ids, the same ids the segment dialog lists and stores.
//
// ✅ Every condition's source was confirmed with the operator on 2026-09-25 (see the ✅ notes below and
// specs/journals/2026-09-25-segment-board-component.md). Change only this file if a source changes;
// the segment rules themselves don't change.

type Doc = Record<string, any>;

// ✅ CONFIRMED (operator, 2026-09-25) — uP! and CPM events attended: consumedproducts. Which products count is picked on each
// condition ("Counting these products"); there is no built-in product list. The count is the number of times the
// picked product ids appear in consumedproducts (see consumedProducts below).

const CUSTOMER_STATUS: Record<string, string> = {
  'active': 'ACTIVE', 'non active': 'NON_ACTIVE', 'discontinued': 'DISCONTINUED', 'late': 'LATE', 'banned': 'BANNED',
};
function customerStatusOf(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'null') return 'NO_STATUS';
  return CUSTOMER_STATUS[s] ?? null;   // an unexpected value matches no option
}
const FINANCE_STATUS: Record<string, string> = {
  'regular': 'REGULAR', 'defaulted': 'DEFAULTED', 'locked': 'LOCKED', 'discontinued': 'DISCONTINUED',
  'late': 'LATE', 'banned': 'BANNED', 'fully paid': 'FULLY_PAID',
};

function financeStatusOf(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'null') return 'NO_STATUS';
  return FINANCE_STATUS[s] ?? null;   // an unexpected value matches no option
}

const countIds = (ids: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') out[id] = (out[id] || 0) + 1;
  return out;
};

function ageFrom(dob: any): number | null {
  const d: Date | null = dob?.toDate ? dob.toDate() : dob instanceof Date ? dob : null;
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

/**
 * ✅ CONFIRMED (operator, 2026-09-25) — Journey: the participant's main journey, picked by customer status.
 * Any other status (late, banned, none, missing) has no journey. Customer status itself is a separate condition.
 */
function journeyIdOf(d: Doc): string | null {
  const s = String(d['customerstatus'] ?? '').toLowerCase();
  if (s === 'active') return d['activejourney'] ?? null;
  if (s === 'non active') return d['lastcompletedjourney'] ?? null;
  if (s === 'discontinued') return d['lastsubscribedjourney'] ?? null;
  return null;
}

/**
 * One `participant metadata` doc → the participant object the board evaluates.
 * `f` holds the values the segment conditions compare against.
 */
export function toParticipant(id: string, d: Doc, journeyNames: Map<string, string>) {
  const jid = journeyIdOf(d);
  const journeyName = (jid && journeyNames.get(jid)) || d['activejourneyname'] || d['lastcompletedjourneyname'] || d['lastsubscribedjourneyname'] || null;
  const consumed = countIds(d['consumedproducts']);
  const ongoing: string[] = Array.isArray(d['activeproduct']) ? d['activeproduct'] : [];
  const onboarded = d['currentjourneyonboarded'];
  const name = d['name'] || [d['firstname'], d['lastname']].filter(Boolean).join(' ') || d['email'] || id;

  return {
    pid: id,
    name: String(name),
    email: String(d['email'] ?? '').trim(),   // used by Import & compare (match by email)
    journey: journeyName || '—',
    mode: d['participantmode'] || '—',
    testuser: d['testuser'] === true,
    ongoingProducts: ongoing,
    // fields the design's filters and table read; not in participant metadata, left empty
    eventsAttended: 0, eventsByProduct: {}, attendedEvents: [], bigLevel: null,
    queue: { inQueue: false, name: null, position: null, stage: null },
    workshop: { status: null, name: null, attendedSession: false, missedLast: false },
    pending: [],
    f: {
      journeyId: jid,   // a `journey` doc id; the segment's Journey setting stores the same ids
      // ✅ CONFIRMED (operator, 2026-09-25) — Onboarding: currentjourneyonboarded true → Onboarded;
      // false or missing → Yet to onboard (the builder's "Yet to onboard" covers every YTO value)
      onboardingStatus: onboarded === true ? 'ONBOARDED' : 'YTO_NEW',
      // ✅ CONFIRMED (operator, 2026-09-25) — Customer status: customerstatus; 'none' or missing → No status
      customerStatus: customerStatusOf(d['customerstatus']),
      // ✅ CONFIRMED (operator, 2026-09-25) — Finance status: financialstatus (incl. fully paid); missing → No status
      financeStatus: financeStatusOf(d['financialstatus']),
      upCount: 0,    // counted from consumedProducts over the condition's picked products
      cpmCount: 0,
      // ✅ CONFIRMED (operator, 2026-09-25) — Age: participant metadata dateofbirth; missing → no age (matches no Age condition)
      age: ageFrom(d['dateofbirth']),
      // ✅ CONFIRMED (operator, 2026-09-25) — Ongoing product: activeproduct (product ids); empty/missing → nothing ongoing
      ongoingProducts: ongoing,
      // ✅ CONFIRMED (operator, 2026-09-25) — Consumed / Unconsumed product: consumedproducts / unconsumedproducts,
      // count = times each product id appears (absent = 0); the builder keeps the count list (all/any, at least/exactly/at most N)
      consumedProducts: consumed,   // `products` doc id -> times consumed
      unconsumedProducts: countIds(d['unconsumedproducts']),
    },
  };
}
