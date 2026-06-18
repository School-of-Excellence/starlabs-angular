import { Participant } from '../models/participant.model';

// Reconciliation checklists (bulk status verification). The ones that can be computed from the
// loaded participant base carry a predicate; the rest need other collections / the Watson finance
// DB and are surfaced with an explanatory note rather than silently omitted.
export interface ChecklistDef {
  id: string;
  label: string;
  group: string;
  description: string;
  wired: boolean;
  predicate?: (p: Participant) => boolean;
  note?: string;
}

const NOT_WIRED = 'Not wired in this build — requires data outside the loaded participant base.';

export const CHECKLISTS: ChecklistDef[] = [
  {
    id: 'customer-status',
    label: 'Customer status',
    group: 'Status',
    description: 'Participants with no customer status set.',
    wired: true,
    predicate: (p) => p.customerstatus === 'none',
  },
  {
    id: 'higher-order-purchase',
    label: 'Higher-order purchase',
    group: 'Journey',
    description: 'Higher-order purchase differs from the active and last-completed journey.',
    wired: true,
    predicate: (p) =>
      !!p.higherorderpurchase && p.higherorderpurchase !== p.activejourney && p.higherorderpurchase !== p.lastcompletedjourney,
  },
  {
    id: 'active-no-product',
    label: 'Active without product',
    group: 'Delivery',
    description: 'Active customers with no active product to deliver.',
    wired: true,
    predicate: (p) => p.customerstatus === 'active' && p.activeproduct.length === 0,
  },
  {
    id: 'expired-but-active',
    label: 'Expired but active',
    group: 'Lifecycle',
    description: 'Active customers whose subscription end date has already passed.',
    wired: true,
    predicate: (p) => p.customerstatus === 'active' && !!p.subscriptionend && new Date(p.subscriptionend).getTime() < Date.now(),
  },
  {
    id: 'product-event',
    label: 'Product event',
    group: 'Events',
    description: 'Participants who have product-event records.',
    wired: true,
    predicate: (p) => Object.keys(p.productevent || {}).length > 0,
  },
  {
    id: 'queue-event',
    label: 'Queue event',
    group: 'Events',
    description: 'Participants who have queue records.',
    wired: true,
    predicate: (p) => Object.keys(p.queueevent || {}).length > 0,
  },
  { id: 'watson-status', label: 'Watson status', group: 'Finance', description: 'Star Labs vs Watson finance status mismatch.', wired: false, note: NOT_WIRED },
  { id: 'first-purchase', label: 'First purchase', group: 'Finance', description: 'Approved sales leads vs Watson purchases.', wired: false, note: NOT_WIRED },
  { id: 'payment-plan', label: 'Payment plan', group: 'Finance', description: 'Payment-plan method from Watson.', wired: false, note: NOT_WIRED },
  { id: 'overall-purchase', label: 'Overall purchase', group: 'Purchases', description: 'From participant journey products.', wired: false, note: NOT_WIRED },
  { id: 'journey-onboarding', label: 'Journey onboarding', group: 'Journey', description: 'From participant journey products.', wired: false, note: NOT_WIRED },
];
