import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParticipantStore } from '../../core/participant.store';
import { Comparison, FilterModel, ProductCountRule } from '../../models/participant.model';

interface Option {
  value: string;
  label: string;
}
interface Section {
  group: keyof FilterModel;
  label: string;
  options: Option[];
}

const STATUS_OPTS: Option[] = [
  { value: 'active', label: 'Active' },
  { value: 'non active', label: 'Non active' },
  { value: 'late', label: 'Late' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'banned', label: 'Banned' },
  { value: 'none', label: 'No status' },
];
const FIN_OPTS: Option[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'locked', label: 'Locked' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'banned', label: 'Banned' },
  { value: 'none', label: 'None' },
];

@Component({
  selector: 'app-filter-rail',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-rail.component.html',
  styleUrl: './filter-rail.component.css',
})
export class FilterRailComponent {
  readonly store = inject(ParticipantStore);
  readonly save = output<void>();

  readonly comparisons: { value: Comparison; label: string }[] = [
    { value: 'gte', label: '≥' },
    { value: 'eq', label: '=' },
    { value: 'lte', label: '≤' },
  ];

  // sections expanded by default; others start collapsed to avoid a wall of options
  readonly open = signal<Set<string>>(new Set(['customerstatus', 'activejourney', 'activeproduct', 'dates']));

  private opt = (arr: { id: string; name: string }[]): Option[] => arr.map((a) => ({ value: a.id, label: a.name }));

  readonly sections = computed<Section[]>(() => {
    const ref = this.store.reference();
    return [
      { group: 'customerstatus', label: 'Customer status', options: STATUS_OPTS },
      { group: 'financialstatus', label: 'Financial status', options: FIN_OPTS },
      {
        group: 'registered',
        label: 'Registration',
        options: [
          { value: 'registered', label: 'Registered' },
          { value: 'non-registered', label: 'Guest' },
        ],
      },
      {
        group: 'customersupport',
        label: 'Support',
        options: [
          { value: 'Open', label: 'Open ticket' },
          { value: 'Closed', label: 'Closed ticket' },
        ],
      },
      { group: 'activejourney', label: 'Active journey', options: this.opt(ref.journeys) },
      { group: 'lastcompletedjourney', label: 'Last completed journey', options: this.opt(ref.journeys) },
      { group: 'activeproduct', label: 'Active products', options: this.opt(ref.products) },
      { group: 'tier', label: 'Tier', options: this.opt(ref.tiers) },
      { group: 'participantmode', label: 'Mode', options: this.opt(ref.modes) },
      { group: 'profiletags', label: 'Tags', options: ref.tags.map((t) => ({ value: t.id, label: t.name })) },
      // Advanced
      { group: 'addons', label: 'Add-ons', options: this.opt(ref.products) },
      { group: 'gifts', label: 'Gifts', options: this.opt(ref.products) },
      { group: 'bonus', label: 'Bonus', options: this.opt(ref.products) },
      { group: 'events', label: 'Event', options: this.opt(ref.events) },
      { group: 'queues', label: 'Queue', options: this.opt(ref.queues) },
    ];
  });

  readonly products = computed(() => this.store.reference().products);

  toggleSection(key: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  isOpen(key: string): boolean {
    return this.open().has(key);
  }

  selectedArr(group: keyof FilterModel): string[] {
    return (this.store.filter()[group] as unknown as string[]) ?? [];
  }
  isChecked(group: keyof FilterModel, value: string): boolean {
    return this.selectedArr(group).includes(value);
  }
  countFor(group: keyof FilterModel): number {
    return this.selectedArr(group).length;
  }
  toggle(group: keyof FilterModel, value: string): void {
    const cur = this.selectedArr(group);
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    this.store.patchFilter({ [group]: next } as Partial<FilterModel>);
  }

  // ATC count
  get atc(): number | null {
    return this.store.filter().atcCountMin;
  }
  setAtc(value: string): void {
    const n = value === '' ? null : Math.max(0, Number(value));
    this.store.patchFilter({ atcCountMin: Number.isNaN(n as number) ? null : n });
  }

  // date ranges
  dateVal(group: 'subscriptionStart' | 'subscriptionEnd', edge: 'start' | 'end'): string {
    const v = this.store.filter()[group][edge];
    return v ? v.substring(0, 10) : '';
  }
  setDate(group: 'subscriptionStart' | 'subscriptionEnd', edge: 'start' | 'end', value: string): void {
    const cur = this.store.filter()[group];
    this.store.patchFilter({ [group]: { ...cur, [edge]: value ? new Date(value).toISOString() : null } });
  }

  // product activity rules
  rules(kind: 'consumed' | 'unconsumed'): ProductCountRule[] {
    return this.store.filter()[kind];
  }
  addRule(kind: 'consumed' | 'unconsumed'): void {
    const first = this.products()[0]?.id ?? '';
    this.store.patchFilter({ [kind]: [...this.rules(kind), { productId: first, comparison: 'gte', count: 1 }] });
  }
  updateRule(kind: 'consumed' | 'unconsumed', index: number, patch: Partial<ProductCountRule>): void {
    const next = this.rules(kind).map((r, i) => (i === index ? { ...r, ...patch } : r));
    this.store.patchFilter({ [kind]: next });
  }
  removeRule(kind: 'consumed' | 'unconsumed', index: number): void {
    this.store.patchFilter({ [kind]: this.rules(kind).filter((_, i) => i !== index) });
  }

  asNum(v: string): number {
    return Math.max(0, Number(v) || 0);
  }
}
