// Data contracts for the Sales Numbers dashboard.
// Reads the real `salesleads` collection; product category + name are derived from the
// `journey` collection (see SalesNumbersService.ensureJourneys). GSV/ASV follow the
// journey-coach dashboard rules.

export type Timeframe = 'last7' | 'last30' | 'last90' | 'month';

// Raw shape we read from `salesleads` (only the fields this dashboard needs),
// enriched with `category` / `productName` resolved from the journey collection.
export interface SaleLead {
  docid: string;
  participantName: string;      // customer/participant name (salesleads.name)
  salespersonname: string;
  presalespersonname: string;
  journey: string;              // journey doc id
  journeytype: string;          // new | upgrade | addons | cancelled | downgrade
  status: string;               // '', 'Approved', 'Rejected', ...
  email: string;
  paymentplan: string;          // non-empty => assured
  source: string;               // lead source: the id of a classify/source_options entry (empty until assigned)
  category: string;             // derived: Ecosystem | DFU | FTO + Gift | Other
  productName: string;          // derived: the journey name
  totalpurchasevalue: number;
  installmentamount: number;
  purchasedate: Date | null;    // sale date
  date: Date | null;            // cancellation / downgrade event date
  paymentplanassureddate: Date | null;
}

// One team document from `sales_teams`.
export interface SalesTeam {
  id: string;
  team: string;
  members: string[];            // profileids of salespeople
}

// A flagged salesperson (users_roles where salesperson == true).
export interface SalespersonRef {
  roleDocId: string;            // the users_roles doc id
  profileid: string;            // profile_ref.id
  name: string;                 // users_roles.name (firstname + ' ' + lastname)
}

// A configurable lead source, stored in classify/source_options ({ sources: [{id, name}] }).
// Leads carry the `id`; the UI maps it back to `name` for display.
export interface SourceOption {
  id: string;
  name: string;
}

// Aggregated metrics for one group (salesperson / team / product-segment).
export interface SalesGroupMetric {
  group: string;
  grossCount: number;           // journey-coach gross: purchasedate in window, not rejected/excluded
  gsv: number;                  // sum totalpurchasevalue of gross
  assuredCount: number;         // gross AND paymentplan non-empty
  asv: number;                  // sum totalpurchasevalue of assured
  cancelledCount: number;       // journeytype cancelled, date in window, status approved
  cancelledValue: number;
  // sale-type split (approved-only gross counts, plus their assured subset) for the card
  newGrossCount: number;
  newAssuredCount: number;
  upgradeGrossCount: number;
  upgradeAssuredCount: number;
  addonsGrossCount: number;
  addonsAssuredCount: number;
}

// One month bucket for the sales-vs-cancellations chart.
export interface MonthlyPoint {
  month: string;
  salesCount: number;
  salesValue: number;
  cancelledCount: number;
  cancelledValue: number;
}

export interface DashboardData {
  segments: SalesGroupMetric[]; // Ecosystem, DFU, FTO + Gift (fixed order)
  allSegment: SalesGroupMetric; // "All" rollup (also table totals)
  groups: SalesGroupMetric[];   // by salesperson or team, per current view
  bySource: SalesGroupMetric[]; // by lead source
  totals: SalesGroupMetric;     // == allSegment
  monthly: MonthlyPoint[];
  sources: string[];            // distinct source values present (for the filter)
  salespeople: string[];        // distinct salespeople present
  teams: string[];              // team names
}
