// Data contracts for the Sales Numbers dashboard.
// Backed by the Firestore `salesleads` collection (+ the new `source`/`originalsource`
// fields) and the new `sales_teams` collection. See benchmark/seed-sales.mjs.

export type Timeframe = 'last7' | 'last30' | 'month';

// Raw shape we read from `salesleads` (only the fields this dashboard needs).
export interface SaleLead {
  docid: string;
  salespersonname: string;
  presalespersonname: string;
  source: string;
  originalsource: string;
  product: string;              // category: Ecosystem | DFU | FTO | Gift
  productName: string;          // specific product within the category (uP!, LYL, B!G, W!SH, ...)
  saleType: string;             // underlying sale type: new | upgrade | addons (set on cancellations too)
  journeytype: string;          // 'new' | 'upgrade' | 'addons' | 'cancelled' | downgrade types
  totalpurchasevalue: number;
  purchasedate: Date | null;    // sale date
  date: Date | null;            // cancellation / event date
  paymentplanassureddate: Date | null; // present => assured (ASV)
  canceldocid?: string;
}

// One team document from `sales_teams`.
export interface SalesTeam {
  id: string;
  team: string;
  members: string[];            // salespersonname values
}

// Aggregated metrics for one group (a salesperson or a team).
// Cancellations are split gross vs assured so the global GSV/ASV filter drives them too.
export interface SalesGroupMetric {
  group: string;                // salesperson name or team name
  grossCount: number;
  gsv: number;                  // gross sales value
  assuredCount: number;
  asv: number;                  // assured sales value
  cancelledCount: number;       // all (gross) cancellations in range (by cancel date)
  cancelledValue: number;
  assuredCancelledCount: number;   // cancellations whose sale was assured
  assuredCancelledValue: number;
}

// The four Net-Contribution headline numbers — count first, value secondary.
export interface NetContribution {
  // counts (primary)
  totalCount: number;                    // gross sales count in range
  cancelledFromCurrentMonthCount: number;
  salesAfterCancellationCount: number;   // gross count - live cancellation count
  liveCancellationCount: number;
  // values (secondary, shown small)
  total: number;                // GSV in range
  cancelledFromCurrentMonth: number; // cancellations whose original sale is in the current month
  salesAfterCancellation: number;    // total - live cancellations
  liveCancellation: number;     // all cancellations whose cancel date is in range
}

// One month bucket for the sales-vs-cancellations comparison chart.
export interface MonthlyPoint {
  month: string;                // 'Jan 2026'
  salesCount: number;
  salesValue: number;
  cancelledCount: number;
  cancelledValue: number;
}

export interface DashboardData {
  groups: SalesGroupMetric[];   // by salesperson or by team, per current view
  byProduct: SalesGroupMetric[]; // breakdown by specific product
  bySource: SalesGroupMetric[];  // breakdown by lead source
  byType: SalesGroupMetric[];    // breakdown by sale type (New/Upgrade/Add-on)
  totals: SalesGroupMetric;     // roll-up across all groups
  net: NetContribution;
  monthly: MonthlyPoint[];
  sources: string[];            // distinct source values present (for the filter)
  originalSources: string[];    // distinct originalsource values
  salespeople: string[];        // distinct salespeople present
  teams: string[];              // team names
  products: string[];           // distinct product values (for the filter)
  types: string[];              // distinct sale types present (for the filter)
}
