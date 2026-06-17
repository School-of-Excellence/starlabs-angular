import { ColumnDef } from '../models/participant.model';

// Every column the user can add to the table. `name` is always present and pinned.
export const COLUMN_CATALOG: ColumnDef[] = [
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

export const COLUMN_DEF_MAP: Record<string, ColumnDef> = COLUMN_CATALOG.reduce(
  (acc, c) => ((acc[c.key] = c), acc),
  {} as Record<string, ColumnDef>
);

// What the table shows on first load.
export const DEFAULT_VISIBLE_COLUMNS = [
  'name',
  'customerstatus',
  'activejourney',
  'activeproduct',
  'profiletags',
  'atccount',
  'subscriptionend',
];
