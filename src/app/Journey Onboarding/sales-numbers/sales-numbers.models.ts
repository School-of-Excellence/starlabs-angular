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
  group: string;                // salesperson / team / product-segment name
  grossCount: number;
  gsv: number;                  // gross sales value
  assuredCount: number;
  asv: number;                  // assured sales value
  cancelledCount: number;       // all (gross) cancellations in range (by cancel date)
  cancelledValue: number;
  assuredCancelledCount: number;   // cancellations whose sale was assured
  assuredCancelledValue: number;
  // sale-type split (gross + assured counts), for the inline New/Upgrade/Add-on figures on the cards
  newGrossCount: number;
  newAssuredCount: number;
  upgradeGrossCount: number;
  upgradeAssuredCount: number;
  addonsGrossCount: number;
  addonsAssuredCount: number;
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
  segments: SalesGroupMetric[]; // the product-segment cards: Ecosystem, DFU, FTO + Gift (fixed order)
  allSegment: SalesGroupMetric; // the "All" rollup card (also used as table totals)
  groups: SalesGroupMetric[];   // by salesperson or by team, per current view
  bySource: SalesGroupMetric[]; // breakdown by lead source
  totals: SalesGroupMetric;     // roll-up across all groups (== allSegment)
  monthly: MonthlyPoint[];
  sources: string[];            // distinct source values present (for the filter)
  originalSources: string[];    // distinct originalsource values
  salespeople: string[];        // distinct salespeople present
  teams: string[];              // team names
}
