import { Injectable } from '@angular/core';
import {
  Firestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, QueryConstraint, DocumentReference,
  QueryDocumentSnapshot,
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { AvailWindow, Appt, JointType, CW_KEYS, MENTOR_KEYS, ViewRole, resolveViewRole, availableViews, Interval } from './sas-logic';

export interface ApptRow { appt: Appt; raw: any; }
export interface Specialist { profileId: string; name: string; role: 'mentor' | 'cw'; productowner: string[]; }
export interface TypeOption { path: string; id: string; name: string; duration: number; }
export interface Team { productIds: string[]; memberIds: string[]; }
export interface RoleEis { id: string; name: string; kind: 'required' | 'additional'; eisIds: string[]; }
export interface TypeBreakdown { id: string; name: string; duration: number; roles: RoleEis[]; }
export interface ProductBreakdown { id: string; name: string; atcmodel: string; types: TypeBreakdown[]; }
export interface FilterProduct { id: string; name: string; typeIds: string[]; }
export interface FilterType { id: string; name: string; duration: number; }
export interface FilterOptions { products: FilterProduct[]; types: FilterType[]; }

/* participantsproduct.status values the participant lookup lists. */
export const PARTICIPANT_PRODUCT_LIVE: (string | null)[] = [null, 'initiated', 'ongoing'];
const toDate = (v: any): Date | null => (v == null ? null : typeof v.toDate === 'function' ? v.toDate() : new Date(v));
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/* Data access for the Specialist Appointment Studio. It reads the same collections the existing
   Scheduling screens use (availability, appointments, Roles-To-EIS, AppointmentType-To-Roles,
   productToDeliverySequence, users_roles) and never writes anything except availability. */
/* Every specialist on a session: hosts plus anyone listed under hostRole (role path → profile refs).
   Collaborative sessions (e.g. EI Diagnostics + EI Implementation) must reach every host (operator, 2026-10-05). */
export function hostIdsOf(d: any): string[] {
  const ids = (d?.['hosts'] ?? []).map((h: any) => h?.id).filter(Boolean);
  Object.values(d?.['hostRole'] ?? {}).forEach((list: any) => (Array.isArray(list) ? list : []).forEach((h: any) => {
    const id = typeof h === 'string' ? h.split('/').pop() : h?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }));
  return ids;
}

@Injectable()
export class SpecialistAppointmentService {
  profileId = '';
  roles: Record<string, any> = {};
  viewRole: ViewRole = null;                       // the view being shown; the shell's View as switches it
  views: Exclude<ViewRole, null>[] = [];            // every view this user holds a role for

  mapAppointment: Record<string, string> = {};
  mapAppointmentData: Record<string, any> = {};
  mapProfile: Record<string, string> = {};
  mapRoles: Record<string, string> = {};

  private ready: Promise<void> | null = null;
  private productCache = new Map<string, Promise<ProductBreakdown[]>>();

  constructor(private firestore: Firestore, private guard: AuthguardService) {}

  /* Resolves the logged-in profile, its view role and the name maps. Safe to call many times. */
  init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const roles = (await this.guard.getRoles()) ?? {};
        this.roles = roles;
        this.profileId = roles['profile_ref']?.id ?? '';
        this.views = availableViews(roles);
        this.viewRole = resolveViewRole(roles);
        const [appt, profile, eis] = await Promise.all([
          this.guard.getAppointmentMap(), this.guard.getProfileMap(), this.guard.getAppointmentRolesMap(),
        ]);
        this.mapAppointment = appt['map'];
        this.mapAppointmentData = appt['mapData'];
        this.mapProfile = profile['map'];
        this.mapRoles = eis['map'];
      })();
    }
    return this.ready;
  }

  profileRef(id: string): DocumentReference {
    return doc(this.firestore, 'profile_data/' + id);
  }

  name(id: string | null | undefined): string {
    return (id && this.mapProfile[id]) || '—';
  }

  /* ---------- Availability ---------- */
  private parseWindow(id: string, d: any): AvailWindow {
    const typeIds: string[] = (d['appointments'] ?? []).map((r: any) => r.id);
    const slots = typeIds.flatMap(t => (d[t] ?? []).map((s: any, index: number) => ({
      typeId: t, start: toDate(s.slotstart)!, end: toDate(s.slotend)!, booked: !!s.booked, available: !!s.available, index,
    })));
    return { id, profileId: d['profileref']?.id ?? '', start: toDate(d['starttime'])!, end: toDate(d['endtime'])!, typeIds, slots };
  }

  /* profileIds null = every specialist (A&H). */
  async windows(profileIds: string[] | null, from: Date, to: Date): Promise<AvailWindow[]> {
    const col = collection(this.firestore, 'availability');
    const range: QueryConstraint[] = [where('starttime', '>=', from), where('starttime', '<', to), orderBy('starttime')];
    const snaps = profileIds === null
      ? [await getDocs(query(col, ...range))]
      : await Promise.all(chunk(profileIds, 30).map(ids =>
          getDocs(query(col, where('profileref', 'in', ids.map(i => this.profileRef(i))), ...range))));
    return snaps.flatMap(s => s.docs.map(x => this.parseWindow(x.id, x.data())));
  }

  /* Windows from today on, used by add-availability to reject overlaps. */
  async futureIntervals(profileId: string): Promise<Interval[]> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const s = await getDocs(query(collection(this.firestore, 'availability'),
      where('profileref', '==', this.profileRef(profileId)), where('starttime', '>=', today)));
    return s.docs.map(x => ({ start: toDate(x.data()['starttime'])!, end: toDate(x.data()['endtime'])! }));
  }

  /* ---------- Appointments ---------- */
  private parseAppt(id: string, d: any): Appt {
    return {
      id, start: toDate(d['starttime'])!, end: toDate(d['endtime'])!,
      attended: d['attended'] === true, cancelled: d['cancelled'] === true, cancelledReason: d['cancelledreason'] ?? null,
      hostIds: hostIdsOf(d), participantId: d['bookedby']?.id ?? null,
      typeId: d['appointment']?.id ?? null, productId: d['productid'] ?? null, zoomUrl: d['zoomdata']?.['join_url'] ?? null,
    };
  }

  /* hostIds null = every appointment (A&H). Uses the hosts + starttime index the calendar already relies on. */
  async appointments(hostIds: string[] | null, from: Date, to: Date, max = 0): Promise<ApptRow[]> {
    const col = collection(this.firestore, 'appointments');
    const range: QueryConstraint[] = [where('starttime', '>=', from), where('starttime', '<', to), orderBy('starttime')];
    if (max) range.push(limit(max));
    const snaps = hostIds === null
      ? [await getDocs(query(col, ...range))]
      : await Promise.all(chunk(hostIds, 30).map(ids => getDocs(query(col,
          ids.length === 1 ? where('hosts', 'array-contains', this.profileRef(ids[0]))
                           : where('hosts', 'array-contains-any', ids.map(i => this.profileRef(i))), ...range))));
    const seen = new Set<string>();
    return snaps.flatMap(s => s.docs).filter(x => !seen.has(x.id) && !!seen.add(x.id))
      .map(x => ({ appt: this.parseAppt(x.id, x.data()), raw: x.data() }));
  }

  /* One page of past appointments, newest first. hostId null = everyone (A&H).
     Uses the hosts + endtime-desc index appointment-studio already relies on. Pass the returned cursor
     back in to get the next page; done = nothing older left. */
  async pastPage(hostId: string | null, cursor: QueryDocumentSnapshot | null, size: number):
      Promise<{ rows: ApptRow[]; cursor: QueryDocumentSnapshot | null; done: boolean }> {
    const q: QueryConstraint[] = [];
    if (hostId) q.push(where('hosts', 'array-contains', this.profileRef(hostId)));
    q.push(where('endtime', '<=', new Date()), orderBy('endtime', 'desc'));
    if (cursor) q.push(startAfter(cursor));
    q.push(limit(size));
    const s = await getDocs(query(collection(this.firestore, 'appointments'), ...q));
    return {
      rows: s.docs.map(x => ({ appt: this.parseAppt(x.id, x.data()), raw: x.data() })),
      cursor: s.docs.length ? s.docs[s.docs.length - 1] : cursor,
      done: s.docs.length < size,
    };
  }

  /* The metaData shape AppointmentDetailComponent / MarkAppointmentStatusComponent expect.
     Same construction as appointment-calendar.component.ts fetchAppointment(). */
  buildMeta(row: ApptRow, opts: { disableCancel?: boolean } = {}): any {
    const d = { ...row.raw };
    const hostData: string[] = [], hostID: string[] = [];
    (d['appointmentrole'] ?? []).forEach((role: any) => {
      const names = (d['hostRole']?.[role.path] ?? []).map((h: any) => { hostID.push(h.path); return this.mapProfile[h.id]; });
      hostData.push(this.mapRoles[role.id] + ': ' + names.join(', '));
    });
    d['type'] = 'appointment';
    d['clientname'] = this.mapProfile[d['bookedby']?.id];
    d['bookingid'] = row.appt.id;
    d['docid'] = row.appt.id;
    d['appointmenttype'] = this.mapAppointment[d['appointment']?.id];
    d['appointmentid'] = d['appointment']?.id;
    d['hostdata'] = Array.from(new Set(hostData));
    d['hostpath'] = Array.from(new Set(hostID));
    if (opts.disableCancel) d['disableCancel'] = true;
    return d;
  }

  /* ---------- People ---------- */
  /* Everyone who can hold availability: CW keys or mentor, from users_roles. */
  async specialists(): Promise<Specialist[]> {
    await this.init();
    const col = collection(this.firestore, 'users_roles');
    const byId = new Map<string, Specialist>();
    const snaps = await Promise.all([...MENTOR_KEYS, ...CW_KEYS].map(k => getDocs(query(col, where(k, '==', true)))));
    snaps.forEach(s => s.docs.forEach(x => {
      const d = x.data(), id = d['profile_ref']?.id;
      if (!id) return;
      const role: 'mentor' | 'cw' = MENTOR_KEYS.some(k => d[k] === true) ? 'mentor' : 'cw';
      byId.set(id, { profileId: id, name: this.name(id), role, productowner: d['productowner'] ?? [] });
    }));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  mentors(): Promise<Specialist[]> {
    return this.specialists().then(l => l.filter(s => s.role === 'mentor'));
  }

  private productMapP: Promise<Record<string, string>> | null = null;
  productMap(): Promise<Record<string, string>> {
    return this.productMapP ??= this.guard.getProductMap();
  }

  /* Distinct products.atcmodel values: the "product" a mentor can own (see profile list, Product Owner). */
  async atcModels(): Promise<string[]> {
    const s = await getDocs(collection(this.firestore, 'products'));
    return [...new Set(s.docs.map(x => (x.data()['atcmodel'] ?? '').trim()).filter(Boolean))].sort() as string[];
  }

  /* ---------- Mentor team chain ----------
     productowner (atc model names) → products.atcmodel → productToDeliverySequence →
     appointmenttype activities → AppointmentType-To-Roles → Roles-To-EIS.assigned_eis.
     productsFor() keeps the whole breakdown per product; the team is the union of its EIS. */
  productsFor(atcmodels: string[]): Promise<ProductBreakdown[]> {
    const key = [...atcmodels].sort().join('|');
    if (!this.productCache.has(key)) this.productCache.set(key, this.buildProducts(atcmodels));
    return this.productCache.get(key)!;
  }

  async teamForAtcModels(atcmodels: string[]): Promise<Team> {
    const products = await this.productsFor(atcmodels);
    const members = new Set(products.flatMap(p => p.types.flatMap(t => t.roles.flatMap(r => r.eisIds))));
    return { productIds: products.map(p => p.id), memberIds: [...members] };
  }

  private async buildProducts(atcmodels: string[]): Promise<ProductBreakdown[]> {
    await this.init();
    if (!atcmodels.length) return [];
    const products = (await Promise.all(chunk(atcmodels, 30).map(c =>
      getDocs(query(collection(this.firestore, 'products'), where('atcmodel', 'in', c)))))).flatMap(s => s.docs);
    if (!products.length) return [];

    const seqs = (await Promise.all(chunk(products.map(p => p.ref), 30).map(c =>
      getDocs(query(collection(this.firestore, 'productToDeliverySequence'), where('product', 'in', c)))))).flatMap(s => s.docs);
    // Appointment types per product, in delivery-sequence order.
    const typesByProduct = new Map<string, string[]>();
    seqs.forEach(s => {
      const pid = s.data()['product']?.id, list = typesByProduct.get(pid) ?? [];
      (s.data()['deliveryoptions'] ?? []).forEach((o: any) => (o['deliverysequence'] ?? []).forEach((a: any) => {
        const path: string = a?.['activity']?.path ?? '';
        if (path.startsWith('appointmenttype/') && !list.includes(path)) list.push(path);
      }));
      typesByProduct.set(pid, list);
    });

    const [atr, r2e] = await Promise.all([
      getDocs(collection(this.firestore, 'AppointmentType-To-Roles')),
      getDocs(collection(this.firestore, 'Roles-To-EIS')),
    ]);
    const rolesByType = new Map<string, { path: string; kind: 'required' | 'additional' }[]>();
    atr.docs.forEach(x => {
      const d = x.data(), t = d['assigned_appttype_ref']?.path;
      if (!t) return;
      rolesByType.set(t, [
        ...(d['required_role'] ?? []).map((r: any) => ({ path: r.path, kind: 'required' as const })),
        ...(d['additional_role'] ?? []).map((r: any) => ({ path: r.path, kind: 'additional' as const })),
      ]);
    });
    const eisByRole = new Map<string, string[]>();
    r2e.docs.forEach(x => {
      const d = x.data(), r = d['assigned_role_ref']?.path;
      if (r) eisByRole.set(r, [...(eisByRole.get(r) ?? []), ...(d['assigned_eis'] ?? []).map((e: any) => e.id)]);
    });

    return products.map(p => ({
      id: p.id, name: p.data()['product'] ?? p.id, atcmodel: p.data()['atcmodel'] ?? '',
      types: (typesByProduct.get(p.id) ?? []).map(path => {
        const id = path.split('/')[1], data = this.mapAppointmentData[id] ?? {};
        return {
          id, name: data['appointmenttype'] ?? id, duration: data['duration'] ?? 0,
          roles: (rolesByType.get(path) ?? []).map(r => ({
            id: r.path.split('/')[1], name: this.mapRoles[r.path.split('/')[1]] ?? r.path, kind: r.kind,
            eisIds: [...new Set(eisByRole.get(r.path) ?? [])],
          })),
        };
      }),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ---------- Participant lookup (operator, 2026-10-07) ----------
     Search a product's participants and see, per appointment step of that product, whether it is booked. */

  /* Everyone holding the product (participantsproduct.productref) whose product is not started (null),
     initiated or ongoing — cancelled, shifted and completed ones are left out (operator, 2026-10-08). */
  async participantsOf(productId: string): Promise<{ id: string; status: string | null }[]> {
    const s = await getDocs(query(collection(this.firestore, 'participantsproduct'), where('productref', '==', doc(this.firestore, 'products/' + productId))));
    const byId = new Map<string, string | null>();
    s.docs.forEach(x => {
      const pid = x.data()['profileid'], status = x.data()['status'] ?? null;
      if (pid && !byId.has(pid) && PARTICIPANT_PRODUCT_LIVE.includes(status)) byId.set(pid, status);
    });
    return [...byId.entries()].map(([id, status]) => ({ id, status })).sort((a, b) => this.name(a.id).localeCompare(this.name(b.id)));
  }

  /* The product's appointment steps in the participant's delivery sequence, in order, with each step's
     status (ready / ongoing / completed / null = not ready) and its delivery type (from the deliverable). */
  async participantSteps(profileId: string, productId: string): Promise<{ typeId: string; status: string | null }[]> {
    const seq = await getDoc(doc(this.firestore, 'participantdeliverysequence/' + profileId));
    if (!seq.exists()) return [];
    const product = (seq.data()['products'] ?? []).find((p: any) => p.productref?.id === productId);
    const steps = (product?.delivery ?? []).filter((d: any) => d.type === 'appointment' && d.sequenceref?.path);
    const delivs = await Promise.all(steps.map((d: any) => getDoc(doc(this.firestore, d.sequenceref.path))));
    return steps.map((d: any, i: number) => ({ typeId: delivs[i].data()?.['deliveryref']?.id ?? '', status: d.status ?? null }))
      .filter((x: { typeId: string }) => x.typeId);
  }

  /* Every appointment the participant booked (bookedby), newest first. */
  async participantBookings(profileId: string): Promise<ApptRow[]> {
    const s = await getDocs(query(collection(this.firestore, 'appointments'), where('bookedby', '==', doc(this.firestore, 'profile_data/' + profileId))));
    return s.docs.map(x => ({ appt: this.parseAppt(x.id, x.data()), raw: x.data() }))
      .sort((a, b) => b.appt.start.getTime() - a.appt.start.getTime());
  }

  /* ---------- Joint delivery types ----------
     Types whose AppointmentType-To-Roles.required_role has 2+ roles, with the people on each role
     (Roles-To-EIS). Read once per screen. */
  private jointP: Promise<Map<string, JointType>> | null = null;
  jointTypes(): Promise<Map<string, JointType>> {
    return this.jointP ??= (async () => {
      const [atr, r2e] = await Promise.all([
        getDocs(collection(this.firestore, 'AppointmentType-To-Roles')), getDocs(collection(this.firestore, 'Roles-To-EIS')),
      ]);
      const eisByRole = new Map<string, string[]>();
      r2e.docs.forEach(x => {
        const r = x.data()['assigned_role_ref']?.path;
        if (r) eisByRole.set(r, [...(eisByRole.get(r) ?? []), ...(x.data()['assigned_eis'] ?? []).map((e: any) => e.id)]);
      });
      const out = new Map<string, JointType>();
      atr.docs.forEach(x => {
        const t = x.data()['assigned_appttype_ref']?.id, roles: string[] = (x.data()['required_role'] ?? []).map((r: any) => r.path);
        if (t && roles.length > 1) out.set(t, { roles, eis: Object.fromEntries(roles.map(r => [r, [...new Set(eisByRole.get(r) ?? [])]])) });
      });
      return out;
    })();
  }

  roleName(rolePath: string) { return this.mapRoles[rolePath.split('/').pop() ?? ''] ?? 'another'; }

  /* ---------- Product + appointment-type filter ----------
     all (A&H): every product and every appointment type.
     mentor: the products they own; types = the ones they can give (typesFor).
     cw: products that hold a type they can give; types = the ones they can give.
     A product's typeIds are its delivery-sequence types, cut to the type options. */
  async filterOptions(scope: 'all' | 'mentor' | 'cw', profileId: string): Promise<FilterOptions> {
    await this.init();
    const toProducts = (list: ProductBreakdown[], keep: (id: string) => boolean) =>
      list.map(p => ({ id: p.id, name: p.name, typeIds: p.types.map(t => t.id).filter(keep) }));
    if (scope === 'all') {
      const types = Object.keys(this.mapAppointmentData).map(id => ({
        id, name: this.mapAppointmentData[id]?.['appointmenttype'] ?? id, duration: this.mapAppointmentData[id]?.['duration'] ?? 0,
      })).sort((a, b) => a.name.localeCompare(b.name));
      return { products: toProducts(await this.productsFor(await this.atcModels()), () => true), types };
    }
    const types = (await this.typesFor(profileId)).map(({ id, name, duration }) => ({ id, name, duration }));
    const own = new Set(types.map(t => t.id));
    if (scope === 'mentor') {
      return { products: toProducts(await this.productsFor(this.roles['productowner'] ?? []), id => own.has(id)), types };
    }
    return { products: toProducts(await this.productsFor(await this.atcModels()), id => own.has(id)).filter(p => p.typeIds.length), types };
  }

  /* ---------- Add availability ---------- */
  /* The appointment types this specialist can give: the chain in add-appointment-availability onProfileSelect(). */
  async typesFor(profileId: string): Promise<TypeOption[]> {
    await this.init();
    const assigned = await getDocs(query(collection(this.firestore, 'Roles-To-EIS'),
      where('assigned_eis', 'array-contains', this.profileRef(profileId))));
    const roles = new Set(assigned.docs.map(x => x.data()['assigned_role_ref']?.path));
    if (!roles.size) return [];
    const paths = new Set<string>();
    (await getDocs(collection(this.firestore, 'AppointmentType-To-Roles'))).docs.forEach(x => {
      const d = x.data();
      const all = [...(d['required_role'] ?? []), ...(d['additional_role'] ?? [])].map((r: any) => r.path);
      if (all.some(p => roles.has(p)) && d['assigned_appttype_ref']?.path) paths.add(d['assigned_appttype_ref'].path);
    });
    return [...paths].map(path => {
      const id = path.split('/')[1], data = this.mapAppointmentData[id] ?? {};
      return { path, id, name: data['appointmenttype'] ?? id, duration: data['duration'] ?? 60 };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  /* Same gate as add-appointment-availability: the last finished appointment must have a status. */
  async unmarkedLastAppointment(profileId: string): Promise<string | null> {
    const s = await getDocs(query(collection(this.firestore, 'appointments'),
      where('hosts', 'array-contains', this.profileRef(profileId)), where('endtime', '<=', new Date()),
      orderBy('endtime', 'desc'), limit(1)));
    if (!s.size) return null;
    const d = s.docs[0].data();
    return d['cancelled'] || d['attended'] ? null : (this.mapAppointment[d['appointment']?.id] ?? 'an appointment');
  }
}
