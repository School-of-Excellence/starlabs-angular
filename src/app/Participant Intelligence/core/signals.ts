import { Participant } from '../models/participant.model';

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

export const SIGNAL_MAP: Record<string, SignalDef> = SIGNALS.reduce(
  (acc, s) => ((acc[s.id] = s), acc),
  {} as Record<string, SignalDef>
);

export const SIGNAL_CATEGORIES: { key: SignalCategory; label: string }[] = [
  { key: 'integrity', label: 'Data integrity' },
  { key: 'retention', label: 'Retention risk' },
  { key: 'financial', label: 'Financial' },
  { key: 'opportunity', label: 'Opportunity' },
];
