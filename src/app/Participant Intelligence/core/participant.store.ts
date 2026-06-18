import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ParticipantDataService } from '../data/participant-data.service';
import { COLUMN_DEF_MAP, DEFAULT_PINNED_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from '../data/column-catalog';
import { applyFilters, deriveChips } from './filter-engine';
import { SIGNALS, SIGNAL_MAP, SignalDef } from './signals';
import {
  Audience,
  CommsAnalytics,
  FilterChip,
  FilterModel,
  Participant,
  ReferenceData,
  Remark,
  Tag,
  emptyFilter,
} from '../models/participant.model';

const EMPTY_REF: ReferenceData = {
  journeys: [],
  products: [],
  modes: [],
  tiers: [],
  tags: [],
  events: [],
  queues: [],
  supportCategories: [],
};

@Injectable()
export class ParticipantStore {
  private readonly data = inject(ParticipantDataService);

  // --- raw state ---
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly all = signal<Participant[]>([]);
  readonly reference = signal<ReferenceData>(EMPTY_REF);
  readonly filter = signal<FilterModel>(emptyFilter());
  readonly audiences = signal<Audience[]>([]);
  readonly activeAudienceId = signal<string | null>(null);
  readonly commsAnalytics = signal<CommsAnalytics | null>(null);

  private readonly membership = signal<Set<string> | null>(null);
  readonly signalId = signal<string | null>(null);
  readonly columnOrder = signal<string[]>([...DEFAULT_VISIBLE_COLUMNS]);
  readonly pinned = signal<Set<string>>(new Set(DEFAULT_PINNED_COLUMNS));
  readonly selectedIds = signal<Set<string>>(new Set());

  // --- derived state ---
  readonly filtered = computed<Participant[]>(() => {
    let result = applyFilters(this.all(), this.filter());
    const sigId = this.signalId();
    if (sigId && SIGNAL_MAP[sigId]) result = result.filter(SIGNAL_MAP[sigId].predicate);
    const member = this.membership();
    if (member) result = result.filter((p) => member.has(p.profileid));
    return result;
  });

  // overview counts computed over the WHOLE base (stable, independent of the current view)
  readonly signalCounts = computed<Record<string, number>>(() => {
    const all = this.all();
    const counts: Record<string, number> = {};
    for (const s of SIGNALS) counts[s.id] = all.reduce((n, p) => (s.predicate(p) ? n + 1 : n), 0);
    return counts;
  });

  readonly attentionCount = computed<number>(() => {
    const all = this.all();
    return all.reduce(
      (n, p) => (SIGNALS.some((s) => s.severity !== 'opportunity' && s.predicate(p)) ? n + 1 : n),
      0
    );
  });

  readonly activeSignal = computed<SignalDef | null>(() => {
    const id = this.signalId();
    return id ? SIGNAL_MAP[id] ?? null : null;
  });

  readonly queuedTotal = computed<number>(() => {
    const c = this.commsAnalytics();
    return c ? c.email.queued + c.whatsapp.queued + c.notification.queued : 0;
  });

  readonly chips = computed<FilterChip[]>(() => deriveChips(this.filter(), this.reference()));
  readonly activeFilterCount = computed(() => this.chips().length);
  readonly totalCount = computed(() => this.all().length);
  readonly filteredCount = computed(() => this.filtered().length);

  readonly selectedParticipants = computed<Participant[]>(() => {
    const ids = this.selectedIds();
    return this.filtered().filter((p) => ids.has(p.profileid));
  });

  // Scope is filtered ∩ selected EVERYWHERE — count, bar, and every bulk action — so a tag/remark/extend
  // can never silently hit rows hidden by the current filter/search/signal.
  readonly selectedCount = computed(() => this.selectedParticipants().length);
  private selectedProfileIds(): string[] {
    return this.selectedParticipants().map((p) => p.profileid);
  }
  readonly hiddenSelectedCount = computed(() => this.selectedIds().size - this.selectedParticipants().length);

  readonly displayedColumns = computed<string[]>(() => {
    const order = this.columnOrder();
    const pin = this.pinned();
    const pinnedCols = order.filter((c) => pin.has(c));
    const rest = order.filter((c) => !pin.has(c));
    return ['select', ...pinnedCols, ...rest];
  });

  readonly availableColumns = computed(() => {
    const current = new Set(this.columnOrder());
    return Object.values(COLUMN_DEF_MAP).filter((c) => !current.has(c.key));
  });

  readonly allFilteredSelected = computed(() => {
    const f = this.filtered();
    if (!f.length) return false;
    const ids = this.selectedIds();
    return f.every((p) => ids.has(p.profileid));
  });

  // --- lifecycle ---
  init(): void {
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      reference: this.data.getReferenceData(),
      participants: this.data.getParticipants(),
      audiences: this.data.getAudiences(),
    }).subscribe({
      next: ({ reference, participants, audiences }) => {
        this.reference.set(reference);
        this.all.set(participants);
        this.audiences.set(this.withCounts(audiences, participants));
        this.loading.set(false);
      },
      error: (e) => {
        console.error('Participant Intelligence load failed', e);
        this.loadError.set(true);
        this.loading.set(false);
      },
    });

    // comms analytics loads independently so it never blocks the table
    this.data.getCommsAnalytics().subscribe({
      next: (c) => this.commsAnalytics.set(c),
      error: (e) => console.warn('comms analytics load failed', e),
    });
  }

  // --- filtering ---
  setFilter(next: FilterModel): void {
    this.filter.set(next);
    this.membership.set(null);
  }

  patchFilter(patch: Partial<FilterModel>): void {
    this.filter.update((f) => ({ ...f, ...patch }));
    this.activeAudienceId.set(null);
  }

  setSearch(term: string): void {
    this.filter.update((f) => ({ ...f, search: term }));
  }

  clearFilter(): void {
    this.filter.set(emptyFilter());
    this.membership.set(null);
    this.activeAudienceId.set(null);
    this.signalId.set(null);
  }

  // --- intelligence signals ---
  applySignal(id: string): void {
    this.filter.set(emptyFilter());
    this.membership.set(null);
    this.activeAudienceId.set(null);
    this.signalId.set(id);
    this.clearSelection();
  }

  clearSignal(): void {
    this.signalId.set(null);
  }

  // optimistic bump so the Communications badge reflects a just-queued broadcast
  bumpQueued(channel: 'email' | 'whatsapp' | 'notification'): void {
    this.commsAnalytics.update((c) => {
      if (!c) return c;
      const ch = c[channel];
      return { ...c, [channel]: { ...ch, queued: ch.queued + 1, total: ch.total + 1 } };
    });
  }

  removeChip(chip: FilterChip): void {
    this.filter.update((f) => {
      const next: FilterModel = structuredClone(f);
      const g = chip.group;
      if (g === 'atcCountMin') next.atcCountMin = null;
      else if (g === 'subscriptionStart') next.subscriptionStart = { start: null, end: null };
      else if (g === 'subscriptionEnd') next.subscriptionEnd = { start: null, end: null };
      else if (g === 'consumed') next.consumed = next.consumed.filter((r) => r.productId !== chip.value);
      else if (g === 'unconsumed') next.unconsumed = next.unconsumed.filter((r) => r.productId !== chip.value);
      else {
        const rec = next as unknown as Record<string, string[]>;
        rec[g as string] = (rec[g as string] ?? []).filter((v) => v !== chip.value);
      }
      return next;
    });
    this.activeAudienceId.set(null);
  }

  // --- selection ---
  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleOne(id: string): void {
    this.selectedIds.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleAllFiltered(checked: boolean): void {
    const ids = this.filtered().map((p) => p.profileid);
    this.selectedIds.update((s) => {
      const next = new Set(s);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  selectIds(ids: string[]): void {
    this.selectedIds.set(new Set(ids));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  // --- columns ---
  addColumn(key: string): void {
    if (this.columnOrder().includes(key)) return;
    this.columnOrder.update((o) => [...o, key]);
  }

  removeColumn(key: string): void {
    if (key === 'name') return;
    this.columnOrder.update((o) => o.filter((c) => c !== key));
    this.pinned.update((p) => {
      const next = new Set(p);
      next.delete(key);
      return next;
    });
  }

  togglePin(key: string): void {
    this.pinned.update((p) => {
      const next = new Set(p);
      next.has(key) ? next.delete(key) : next.add(key);
      next.add('name');
      return next;
    });
  }

  moveColumn(key: string, dir: -1 | 1): void {
    this.columnOrder.update((o) => {
      const arr = [...o];
      const i = arr.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  resetColumns(): void {
    this.columnOrder.set([...DEFAULT_VISIBLE_COLUMNS]);
    this.pinned.set(new Set(DEFAULT_PINNED_COLUMNS));
  }

  // --- audiences ---
  loadAudience(id: string): void {
    const aud = this.audiences().find((a) => a.id === id);
    if (!aud) return;
    this.activeAudienceId.set(id);
    if (aud.kind === 'filter' && aud.filter) {
      this.filter.set(structuredClone(aud.filter));
      this.membership.set(null);
    } else {
      this.filter.set(emptyFilter());
      this.membership.set(this.resolveAudienceIds(aud));
    }
    this.clearSelection();
  }

  saveCurrentAsAudience(name: string): Audience {
    const aud: Audience = {
      id: `aud-${Date.now()}`,
      name,
      kind: 'filter',
      isDefault: false,
      createdBy: 'You',
      createdDate: new Date().toISOString(),
      count: this.filteredCount(),
      filter: structuredClone(this.filter()),
    };
    this.audiences.update((list) => [...list, aud]);
    this.activeAudienceId.set(aud.id);
    this.data.persistAudience(aud).catch((e) => console.error('persistAudience failed', e));
    return aud;
  }

  saveSelectionAsList(name: string): Audience {
    const ids = this.selectedProfileIds();
    const aud: Audience = {
      id: `aud-${Date.now()}`,
      name,
      kind: 'list',
      isDefault: false,
      createdBy: 'You',
      createdDate: new Date().toISOString(),
      count: ids.length,
      live: false,
      profileIds: ids,
    };
    this.audiences.update((list) => [...list, aud]);
    this.data.persistList(aud).catch((e) => console.error('persistList failed', e));
    return aud;
  }

  deleteAudience(id: string): void {
    this.audiences.update((list) => list.filter((a) => a.id !== id));
    if (this.activeAudienceId() === id) this.activeAudienceId.set(null);
  }

  setDefaultAudience(id: string): void {
    this.audiences.update((list) => list.map((a) => ({ ...a, isDefault: a.id === id })));
  }

  toggleListLive(id: string): void {
    this.audiences.update((list) => list.map((a) => (a.id === id ? { ...a, live: !a.live } : a)));
  }

  private resolveAudienceIds(aud: Audience): Set<string> {
    if (aud.kind === 'filter' && aud.filter) {
      return new Set(applyFilters(this.all(), aud.filter).map((p) => p.profileid));
    }
    if (aud.kind === 'list') {
      return new Set(aud.profileIds ?? []);
    }
    // segment = union of members
    const out = new Set<string>();
    for (const memberId of aud.memberAudienceIds ?? []) {
      const member = this.audiences().find((a) => a.id === memberId);
      if (member) this.resolveAudienceIds(member).forEach((id) => out.add(id));
    }
    return out;
  }

  private withCounts(audiences: Audience[], participants: Participant[]): Audience[] {
    return audiences.map((a) => {
      if (a.kind === 'filter' && a.filter) return { ...a, count: applyFilters(participants, a.filter).length };
      return a;
    });
  }

  // --- bulk mutations (optimistic local update + persisted via the data service) ---
  // Scope = filtered ∩ selected (selectedProfileIds), so hidden rows are never silently mutated.
  addRemarkToSelected(note: string, givenby = 'You'): void {
    const idList = this.selectedProfileIds();
    const ids = new Set(idList);
    const remark: Remark = { date: new Date().toISOString(), note, givenby };
    this.all.update((list) => list.map((p) => (ids.has(p.profileid) ? { ...p, remarks: [...p.remarks, remark] } : p)));
    this.data.persistRemark(idList, remark).catch((e) => console.error('persistRemark failed', e));
  }

  addTagsToSelected(tagIds: string[]): void {
    const idList = this.selectedProfileIds();
    const ids = new Set(idList);
    this.all.update((list) =>
      list.map((p) =>
        ids.has(p.profileid) ? { ...p, profiletags: Array.from(new Set([...p.profiletags, ...tagIds])) } : p
      )
    );
    this.data.persistTags(idList, tagIds, 'add').catch((e) => console.error('persistTags(add) failed', e));
  }

  removeTagsFromSelected(tagIds: string[]): void {
    const idList = this.selectedProfileIds();
    const ids = new Set(idList);
    this.all.update((list) =>
      list.map((p) => (ids.has(p.profileid) ? { ...p, profiletags: p.profiletags.filter((t) => !tagIds.includes(t)) } : p))
    );
    this.data.persistTags(idList, tagIds, 'remove').catch((e) => console.error('persistTags(remove) failed', e));
  }

  extendSubscriptionForSelected(newEndIso: string): void {
    const ids = new Set(this.selectedProfileIds());
    this.all.update((list) => list.map((p) => (ids.has(p.profileid) ? { ...p, subscriptionend: newEndIso } : p)));
  }

  createTag(name: string, tagsfor: string[]): Tag {
    const tag: Tag = { id: `tg-${Date.now()}`, name, tagsfor, isActive: true };
    this.reference.update((r) => ({ ...r, tags: [...r.tags, tag] }));
    this.data.persistNewTag(tag).catch((e) => console.error('persistNewTag failed', e));
    return tag;
  }
}
