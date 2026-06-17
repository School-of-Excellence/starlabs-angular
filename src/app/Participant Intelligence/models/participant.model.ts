// Domain models for the Participant Intelligence screen.
// Field names mirror the real `participant metadata` Firestore document shape
// so this component can be ported back into starlabs-angular with minimal change.

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

// One row in the table. `*Ref` style fields hold ids that resolve through ReferenceData.
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
  productcount: Record<string, number>;
  customersupport: { status: SupportStatus; category: string | null };
  remarks: Remark[];
  subscriptionstart: string | null;
  subscriptionend: string | null;
  lastpaymentdate: string | null;
  purchasedate: string | null;
  dateofbirth: string | null;
  emiStatus: EmiStatus;
  eiflix: string[];
  solarvoice: string[];
  generalcontent: string[];
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
  supportCategories: string[];
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

export function emptyFilter(): FilterModel {
  return {
    search: '',
    participantmode: [],
    customerstatus: [],
    financialstatus: [],
    activejourney: [],
    lastcompletedjourney: [],
    activeproduct: [],
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

export interface ColumnState {
  key: string;
  visible: boolean;
  pinned: boolean;
}

// A removable filter pill shown above the table.
export interface FilterChip {
  group: keyof FilterModel;
  label: string;
  value: string; // identifies the specific value to remove (or '' for whole-group resets)
}
