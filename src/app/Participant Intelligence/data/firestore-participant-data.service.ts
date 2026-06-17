import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { ParticipantDataService } from './participant-data.service';
import {
  Audience,
  CustomerStatus,
  EmiStatus,
  FilterModel,
  FinancialStatus,
  NamedRef,
  Participant,
  ReferenceData,
  Remark,
  SupportStatus,
  Tag,
  emptyFilter,
} from '../models/participant.model';

type Dict = Record<string, any>;

const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);
const tsToIso = (x: any): string | null => {
  if (!x) return null;
  if (typeof x?.toDate === 'function') return x.toDate().toISOString();
  if (typeof x === 'string') return x;
  if (x instanceof Date) return x.toISOString();
  return null;
};
const dateStr = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);

@Injectable()
export class FirestoreParticipantDataService extends ParticipantDataService {
  private readonly firestore = inject(Firestore);
  private readonly authguard = inject(AuthguardService);
  private loggedInProfileId = '';

  constructor() {
    super();
    this.authguard
      .getRoles()
      .then((r: Dict) => {
        this.loggedInProfileId = r?.['profile_ref']?.id ?? r?.['profileid'] ?? '';
      })
      .catch(() => undefined);
  }

  // ---------- reads ----------
  getReferenceData(): Observable<ReferenceData> {
    return from(this.loadReference());
  }
  getParticipants(): Observable<Participant[]> {
    return from(this.loadParticipants());
  }
  getAudiences(): Observable<Audience[]> {
    return from(this.loadAudiences());
  }

  private async loadReference(): Promise<ReferenceData> {
    const col = (name: string) => getDocs(collection(this.firestore, name));
    const [journeys, products, modes, tiers, tags] = await Promise.all([
      col('journey'),
      col('products'),
      col('modes'),
      col('tier'),
      col('participant tags'),
    ]);
    const named = (snap: any, field: string): NamedRef[] =>
      snap.docs.map((d: any) => ({ id: d.id, name: d.data()[field] ?? d.id }));
    const tagList: Tag[] = tags.docs.map((d: any) => {
      const data = d.data();
      return { id: d.id, name: data['name'] ?? d.id, tagsfor: arr(data['tagsfor']), isActive: data['isActive'] !== false };
    });
    return {
      journeys: named(journeys, 'journey'),
      products: named(products, 'product'),
      modes: named(modes, 'mode'),
      tiers: named(tiers, 'tier'),
      tags: tagList,
      supportCategories: [],
    };
  }

  private async loadParticipants(): Promise<Participant[]> {
    const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), orderBy('name')));
    return snap.docs.map((d) => this.mapParticipant(d.id, d.data() as Dict));
  }

  private mapParticipant(id: string, d: Dict): Participant {
    const status = (d['customerstatus'] ?? 'none') as CustomerStatus;
    // status-conditional subscription window (mirrors the original screen)
    const useLast = status === 'discontinued' || status === 'non active';
    const subStart = tsToIso(useLast ? d['lastsubscriptionstart'] : d['subscriptionstart']);
    const subEnd = tsToIso(useLast ? d['lastsubscriptionend'] : d['subscriptionend']);

    return {
      profileid: d['profileid'] ?? id,
      name: d['name'] ?? '(no name)',
      email: d['email'] ?? '',
      phonenumber: d['phonenumber'] != null ? String(d['phonenumber']) : '',
      countrycode: d['countryCode'] ?? d['countrycode'] ?? '',
      registered: d['firebaseuserref'] != null,
      participantmode: d['participantmode'] ?? '',
      customerstatus: status,
      financialstatus: this.normFinancial(d['financialstatus']),
      activejourney: d['activejourney'] ?? null,
      lastcompletedjourney: d['lastcompletedjourney'] ?? null,
      higherorderpurchase: d['higherorderpurchase'] ?? null,
      activeproduct: arr(d['activeproduct']),
      consumedproducts: arr(d['consumedproducts']),
      unconsumedproducts: arr(d['unconsumedproducts']),
      addons: arr(d['addons']),
      gifts: arr(d['gifts']),
      bonus: arr(d['bonus']),
      tier: arr(d['tier']),
      profiletags: arr(d['profiletags']),
      atccount: Number(d['atccount'] ?? 0),
      productcount: d['productcount'] ?? {},
      customersupport: this.collapseSupport(d['customersupport']),
      remarks: this.mapRemarks(d['remarks']),
      subscriptionstart: subStart,
      subscriptionend: subEnd,
      lastpaymentdate: tsToIso(d['lastpaymentdate']),
      purchasedate: tsToIso(d['purchasedate']),
      dateofbirth: tsToIso(d['dateofbirth']),
      emiStatus: this.mapEmi(d['financedata']?.['paymentstatus']),
      eiflix: [],
      solarvoice: [],
      generalcontent: [],
    };
  }

  private normFinancial(v: unknown): FinancialStatus {
    const s = (v ?? '').toString();
    const allowed = ['regular', 'locked', 'defaulted', 'discontinued', 'banned'];
    return (allowed.includes(s) ? s : 'none') as FinancialStatus;
  }

  private collapseSupport(map: unknown): { status: SupportStatus; category: string | null } {
    if (!map || typeof map !== 'object') return { status: 'none', category: null };
    const tickets = Object.values(map as Dict);
    if (!tickets.length) return { status: 'none', category: null };
    const hasOpen = tickets.some((t: any) => t?.status === 'Open' || t?.status === 'open');
    const first = tickets[0] as any;
    return { status: hasOpen ? 'Open' : 'Closed', category: first?.category ?? null };
  }

  private mapRemarks(remarks: unknown): Remark[] {
    if (!Array.isArray(remarks)) return [];
    return remarks.map((r: any) => ({
      date: tsToIso(r?.date) ?? new Date().toISOString(),
      note: r?.note ?? '',
      givenby: r?.givenby ?? '',
    }));
  }

  private mapEmi(v: unknown): EmiStatus {
    const s = (v ?? '').toString().toLowerCase();
    if (!s) return 'none';
    if (s.includes('overdue') || s.includes('default') || s.includes('late')) return 'overdue';
    if (s.includes('complete') || s.includes('paid') || s.includes('closed')) return 'completed';
    if (s.includes('regular') || s.includes('active') || s.includes('track') || s.includes('ongoing')) return 'on-track';
    return 'none';
  }

  private async loadAudiences(): Promise<Audience[]> {
    const [filters, lists, segments] = await Promise.all([
      getDocs(collection(this.firestore, 'searchquery')),
      getDocs(collection(this.firestore, 'participant list')),
      getDocs(collection(this.firestore, 'segments')),
    ]);
    const out: Audience[] = [];
    filters.docs.forEach((d) => {
      const data = d.data() as Dict;
      out.push({
        id: data['docid'] ?? d.id,
        name: data['label'] ?? 'Saved filter',
        kind: 'filter',
        isDefault: false,
        createdBy: data['createdby'] ?? '—',
        createdDate: '',
        count: 0,
        filter: this.mapSavedFilter(data),
      });
    });
    lists.docs.forEach((d) => {
      const data = d.data() as Dict;
      out.push({
        id: d.id,
        name: data['listname'] ?? 'List',
        kind: 'list',
        isDefault: false,
        createdBy: '—',
        createdDate: tsToIso(data['createddate']) ?? '',
        count: arr(data['profilelist']).length,
        live: data['live'] ?? false,
        profileIds: arr(data['profilelist']),
      });
    });
    segments.docs.forEach((d) => {
      const data = d.data() as Dict;
      out.push({
        id: d.id,
        name: data['segmentname'] ?? 'Segment',
        kind: 'segment',
        isDefault: false,
        createdBy: '—',
        createdDate: '',
        count: 0,
        memberAudienceIds: arr(data['participantlistid']),
      });
    });
    return out;
  }

  private mapSavedFilter(d: Dict): FilterModel {
    const f = emptyFilter();
    f.customerstatus = arr(d['customerstatus']) as CustomerStatus[];
    f.financialstatus = arr(d['financialstatus']) as FinancialStatus[];
    f.activejourney = arr(d['activejourney']);
    f.lastcompletedjourney = arr(d['lastcompletedjourney']);
    f.activeproduct = arr(d['activeproduct']);
    f.profiletags = arr(d['profiletags']);
    f.tier = arr(d['tier']);
    f.registered = arr(d['registereduser']) as FilterModel['registered'];
    if (d['atccount'] != null && d['atccount'] !== '') f.atcCountMin = Number(d['atccount']);
    f.subscriptionStart = this.range(d['subscriptionstart']);
    f.subscriptionEnd = this.range(d['subscriptionend']);
    return f;
  }

  private range(x: any): { start: string | null; end: string | null } {
    if (!x || typeof x !== 'object') return { start: null, end: null };
    return {
      start: x.start ? new Date(x.start).toISOString() : null,
      end: x.end ? new Date(x.end).toISOString() : null,
    };
  }

  // ---------- writes (safe set: tags, remarks, audiences, lists) ----------
  private chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }

  override async persistTags(profileIds: string[], tagIds: string[], mode: 'add' | 'remove'): Promise<void> {
    if (!profileIds.length || !tagIds.length) return;
    const op = mode === 'add' ? arrayUnion(...tagIds) : arrayRemove(...tagIds);
    for (const group of this.chunk(profileIds, 400)) {
      const batch = writeBatch(this.firestore);
      for (const pid of group) batch.update(doc(this.firestore, 'participant metadata', pid), { profiletags: op });
      await batch.commit();
    }
  }

  override async persistRemark(profileIds: string[], remark: Remark): Promise<void> {
    if (!profileIds.length) return;
    const entry = { date: new Date(), note: remark.note, givenby: this.loggedInProfileId || remark.givenby };
    for (const group of this.chunk(profileIds, 400)) {
      const batch = writeBatch(this.firestore);
      for (const pid of group) batch.update(doc(this.firestore, 'participant metadata', pid), { remarks: arrayUnion(entry) });
      await batch.commit();
    }
  }

  override async persistNewTag(tag: Tag): Promise<void> {
    await setDoc(doc(this.firestore, 'participant tags', tag.id), {
      id: tag.id,
      name: tag.name,
      tagsfor: tag.tagsfor,
      isActive: true,
      created: new Date(),
      createdby: this.loggedInProfileId,
    });
  }

  override async persistAudience(aud: Audience): Promise<void> {
    const f = aud.filter ?? emptyFilter();
    await setDoc(
      doc(this.firestore, 'searchquery', aud.id),
      {
        docid: aud.id,
        label: aud.name,
        createdby: this.loggedInProfileId,
        customerstatus: f.customerstatus,
        financialstatus: f.financialstatus,
        activejourney: f.activejourney,
        lastcompletedjourney: f.lastcompletedjourney,
        activeproduct: f.activeproduct,
        profiletags: f.profiletags,
        tier: f.tier,
        registereduser: f.registered,
        atccount: f.atcCountMin ?? null,
        subscriptionstart: { start: dateStr(f.subscriptionStart.start), end: dateStr(f.subscriptionStart.end) },
        subscriptionend: { start: dateStr(f.subscriptionEnd.start), end: dateStr(f.subscriptionEnd.end) },
      },
      { merge: true }
    );
  }

  override async persistList(aud: Audience): Promise<void> {
    await setDoc(doc(this.firestore, 'participant list', aud.id), {
      docid: aud.id,
      listname: aud.name,
      profilelist: aud.profileIds ?? [],
      createddate: new Date(),
      live: false,
    });
  }
}
