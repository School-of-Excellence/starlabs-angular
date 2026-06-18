import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantStore } from '../../core/participant.store';
import { COLUMN_DEF_MAP } from '../../data/column-catalog';
import { ColumnDef, Participant } from '../../models/participant.model';

type SortDir = 'asc' | 'desc' | null;

@Component({
  selector: 'app-participant-table',
  standalone: true,
  imports: [CommonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-table.component.html',
  styleUrl: './participant-table.component.css',
})
export class ParticipantTableComponent {
  readonly store = inject(ParticipantStore);

  readonly sortKey = signal<string>('name');
  readonly sortDir = signal<SortDir>('asc');

  private readonly journeyMap = computed(() => this.toMap(this.store.reference().journeys));
  private readonly productMap = computed(() => this.toMap(this.store.reference().products));
  private readonly tierMap = computed(() => this.toMap(this.store.reference().tiers));
  private readonly modeMap = computed(() => this.toMap(this.store.reference().modes));
  private readonly tagMap = computed(() => {
    const m: Record<string, string> = {};
    for (const t of this.store.reference().tags) m[t.id] = t.name;
    return m;
  });

  readonly columnDefs = computed<ColumnDef[]>(() =>
    this.store.displayedColumns().filter((k) => k !== 'select').map((k) => COLUMN_DEF_MAP[k])
  );

  private colWidth(c: string): number {
    if (c === 'select') return 44;
    if (c === 'name') return 240;
    if (c === 'atccount') return 110;
    return 150;
  }

  // Frozen (sticky-left) columns = the select column + any pinned columns, taken contiguously
  // from the front of displayedColumns. Maps each frozen column key to its left offset in px.
  readonly frozenLefts = computed<Record<string, number>>(() => {
    const cols = this.store.displayedColumns();
    const pin = this.store.pinned();
    const map: Record<string, number> = {};
    let left = 0;
    for (const c of cols) {
      if (c !== 'select' && !pin.has(c)) break;
      map[c] = left;
      left += this.colWidth(c);
    }
    return map;
  });

  readonly lastFrozenKey = computed<string | null>(() => {
    const keys = Object.keys(this.frozenLefts());
    return keys.length ? keys[keys.length - 1] : null;
  });

  isFrozen(c: string): boolean {
    return c in this.frozenLefts();
  }
  leftOf(c: string): number {
    return this.frozenLefts()[c] ?? 0;
  }

  // Profile drill-down — opens the participant's profile in a new tab (without toggling row selection).
  openProfile(p: Participant, ev?: Event): void {
    ev?.stopPropagation();
    window.open(`/userprofile/${p.profileid}`, '_blank');
  }

  readonly gridTemplate = computed(() => {
    const cols = this.store.displayedColumns();
    const frozen = this.frozenLefts();
    return cols
      .map((c) => {
        if (c in frozen) return `${this.colWidth(c)}px`;
        if (c === 'name') return 'minmax(240px, 1.4fr)';
        if (c === 'atccount') return '110px';
        return 'minmax(150px, 1fr)';
      })
      .join(' ');
  });

  readonly minWidth = computed(() => this.store.displayedColumns().reduce((w, c) => w + this.colWidth(c), 0));

  readonly rows = computed<Participant[]>(() => {
    const data = [...this.store.filtered()];
    const key = this.sortKey();
    const dir = this.sortDir();
    if (!dir) return data;
    const def = COLUMN_DEF_MAP[key];
    data.sort((a, b) => {
      const av = this.sortValue(a, key, def);
      const bv = this.sortValue(b, key, def);
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  });

  toggleSort(key: string): void {
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDir.set('asc');
      return;
    }
    const cur = this.sortDir();
    this.sortDir.set(cur === 'asc' ? 'desc' : cur === 'desc' ? null : 'asc');
  }

  private sortValue(p: Participant, key: string, def: ColumnDef): string | number {
    const raw = (p as unknown as Record<string, unknown>)[key];
    if (def?.type === 'number') return (raw as number) ?? -1;
    if (def?.type === 'date') return raw ? new Date(raw as string).getTime() : 0;
    if (Array.isArray(raw)) return raw.length;
    return this.cellText(p, def).toLowerCase();
  }

  private toMap(arr: { id: string; name: string }[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const a of arr) m[a.id] = a.name;
    return m;
  }

  private resolve(resolve: ColumnDef['resolve'], id: string): string {
    switch (resolve) {
      case 'journey':
        return this.journeyMap()[id] ?? id;
      case 'product':
        return this.productMap()[id] ?? id;
      case 'tier':
        return this.tierMap()[id] ?? id;
      case 'mode':
        return this.modeMap()[id] ?? id;
      case 'tag':
        return this.tagMap()[id] ?? id;
      default:
        return id;
    }
  }

  // ---- cell rendering helpers used by the template ----
  initials(p: Participant): string {
    return p.name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  avatarHue(p: Participant): string {
    let h = 0;
    for (let i = 0; i < p.name.length; i++) h = (h * 31 + p.name.charCodeAt(i)) % 360;
    return `hsl(${h} 42% 46%)`;
  }

  arrayValues(p: Participant, def: ColumnDef): string[] {
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    if (!Array.isArray(raw)) return [];
    return (raw as string[]).map((id) => this.resolve(def.resolve, id));
  }

  cellText(p: Participant, def: ColumnDef): string {
    if (!def) return '';
    const raw = (p as unknown as Record<string, unknown>)[def.key];
    if (def.type === 'date') return raw ? this.formatDate(raw as string) : '—';
    if (def.type === 'number') return raw == null ? '0' : String(raw);
    if (def.resolve && typeof raw === 'string') return this.resolve(def.resolve, raw);
    if (def.key === 'customersupport') return p.customersupport.status === 'none' ? '—' : p.customersupport.status;
    if (def.key === 'registered') return p.registered ? 'Registered' : 'Guest';
    return raw == null || raw === 'none' ? '—' : String(raw);
  }

  statusValue(p: Participant, key: string): string {
    if (key === 'registered') return p.registered ? 'registered' : 'guest';
    if (key === 'customersupport') return p.customersupport.status;
    return String((p as unknown as Record<string, unknown>)[key] ?? 'none');
  }

  statusLabel(p: Participant, key: string): string {
    const v = this.statusValue(p, key);
    if (v === 'registered') return 'Registered';
    if (v === 'guest') return 'Guest';
    if (v === 'none') return '—';
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  tone(value: string): string {
    switch (value) {
      case 'active':
      case 'regular':
      case 'on-track':
      case 'registered':
        return 'active';
      case 'late':
      case 'locked':
      case 'overdue':
      case 'Open':
        return 'late';
      case 'banned':
      case 'defaulted':
        return 'banned';
      case 'completed':
      case 'Closed':
        return 'discontinued';
      case 'none':
      case 'guest':
        return 'none';
      default:
        return 'discontinued';
    }
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  trackById = (_: number, p: Participant) => p.profileid;
}
