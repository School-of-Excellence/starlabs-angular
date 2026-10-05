import { Injectable } from '@angular/core';
import {
  arrayUnion, collection, doc, Firestore, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where, writeBatch,
} from '@angular/fire/firestore';

/* A free slot of one specialist (availability/{docid}[typeId][index]). */
export interface EisSlot { slotstart: Date; slotend: Date; docid: string; index: number; eisprofile: string; appointmentrole: string; }
/* A bookable time: one slot per role at the same start, each a different specialist. */
export interface BookSlot { start: Date; end: Date; specialist: string; eisprofiles: string[]; docdata: { id: string; index: number }[]; }
/* The participant's delivery activity being booked (book-appointment's selectedAppointment). */
export interface BookTarget { id: string; deliverypath: string; participantdelivery: any; status?: string; productid: string; }
export interface RolePlan { roles: string[]; rolePersons: Record<string, string[]>; }
export interface TypeRoles { required: string[]; additional: string[]; eis: Record<string, string[]>; }
export interface Bookable { participantId: string; target: BookTarget; mapped: Record<string, any> | null; }

const minuteOf = (d: Date) => Math.floor(new Date(d).getTime() / 60000);

/* The booking engine, moved out of BookAppointmentComponent unchanged in behaviour so that the Book
   Appointment screen and the Specialist Appointment Studio's calendar booking write the same docs:
   the availability slot flags, the appointment, the participant's delivery sequence and product status. */
@Injectable({ providedIn: 'root' })
export class AppointmentBookingService {
  constructor(private firestore: Firestore) {}

  /* Roles for an appointment type and the specialists (profile paths) who can take each.
     With a participant (book-appointment onAppointmentSelect): their customer_eismapping wins per role,
     and a mapped additional role becomes required. Without one (calendar booking): required roles only,
     from Roles-To-EIS. The participant is never their own specialist. */
  async rolesFor(typeId: string, participantId: string | null): Promise<RolePlan> {
    const base = await this.typeRoles(typeId);
    const mapping = participantId ? await getDoc(doc(this.firestore, 'customer_eismapping/' + participantId)) : null;
    return this.planFrom(base, participantId, mapping?.exists() ? (mapping.data()['eisroles'] ?? {}) : null);
  }

  /* A type's required / additional roles and every specialist per role (Roles-To-EIS). */
  async typeRoles(typeId: string): Promise<TypeRoles> {
    const required: string[] = [], additional: string[] = [], eis: Record<string, string[]> = {};
    const r = await getDocs(query(collection(this.firestore, 'AppointmentType-To-Roles'),
      where('assigned_appttype_ref', '==', doc(this.firestore, 'appointmenttype/' + typeId)), limit(1)));
    r.forEach(d => {
      (d.data()['required_role'] ?? []).forEach((x: any) => required.push(x.path));
      (d.data()['additional_role'] ?? []).forEach((x: any) => additional.push(x.path));
    });
    for (const role of required) {
      const s = await getDocs(query(collection(this.firestore, 'Roles-To-EIS'), where('assigned_role_ref', '==', doc(this.firestore, role))));
      eis[role] = [];
      s.forEach(d => (d.data()['assigned_eis'] ?? []).forEach((e: any) => eis[role].push(e.path)));
    }
    return { required, additional, eis };
  }

  /* mapped = customer_eismapping.eisroles of the participant, or null when they have none. */
  planFrom(base: TypeRoles, participantId: string | null, mapped: Record<string, any> | null): RolePlan {
    const roles = [...base.required], rolePersons: Record<string, string[]> = {};
    for (const role of base.required) {
      rolePersons[role] = mapped?.[role] != null
        ? mapped[role].map((x: any) => x.path)
        : (base.eis[role] ?? []).filter(path => path.split('/').pop() !== participantId);
    }
    if (mapped) for (const role of base.additional) {
      if (mapped[role] != null) { roles.push(role); rolePersons[role] = mapped[role].map((x: any) => x.path); }
    }
    return { roles, rolePersons };
  }

  /* Calendar booking: the plan this participant would book this slot with, or null when they can't —
     their mapping pins other specialists, adds an additional role (book those By participant), or they
     are one of the slot's specialists. slot.eisprofiles follows base.required's order. */
  planForSlot(base: TypeRoles, b: Bookable, slot: BookSlot): RolePlan | null {
    if (slot.eisprofiles.some(p => p.split('/').pop() === b.participantId)) return null;
    const plan = this.planFrom(base, b.participantId, b.mapped);
    if (plan.roles.length !== base.required.length) return null;
    return base.required.every((role, i) => plan.rolePersons[role]?.includes(slot.eisprofiles[i])) ? plan : null;
  }

  /* Participants who can be booked into a type for a product: an active product (initiated / ongoing)
     whose delivery sequence holds this appointment type with status ready, on a ready deliverable
     (operator, 2026-10-05: ready only). Same docs book-appointment getMyAppointment reads, per participant. */
  async bookableParticipants(productId: string, typeId: string): Promise<Bookable[]> {
    const dl = await getDocs(query(collection(this.firestore, 'deliverables'), where('type', '==', 'appointment'), where('status', '==', 'ready')));
    const paths = new Map<string, Set<string>>();
    dl.docs.filter(d => d.data()['deliveryref']?.id === typeId).forEach(d => {
      const pid = d.data()['profileid'];
      if (pid) paths.set(pid, (paths.get(pid) ?? new Set()).add(d.ref.path));
    });
    const out = await Promise.all([...paths.entries()].map(async ([pid, mine]) => {
      const seq = await getDoc(doc(this.firestore, 'participantdeliverysequence/' + pid));
      if (!seq.exists()) return null;
      const isReady = (x: any) => x.type === 'appointment' && x.status === 'ready' && mine.has(x.sequenceref?.path);
      const product = (seq.data()['products'] ?? []).find((p: any) => p.productref?.id === productId && (p.delivery ?? []).some(isReady));
      if (!product) return null;
      const [pp, mapping] = await Promise.all([
        getDoc(doc(this.firestore, 'participantsproduct/' + product.participantproductid)),
        getDoc(doc(this.firestore, 'customer_eismapping/' + pid)),
      ]);
      if (!['initiated', 'ongoing'].includes(pp.data()?.['status'])) return null;
      const activity = product.delivery.find(isReady);
      return {
        participantId: pid,
        mapped: mapping.exists() ? (mapping.data()['eisroles'] ?? {}) : null,
        target: { id: typeId, deliverypath: activity.sequenceref.path, participantdelivery: seq.data(), status: activity.status, productid: productId },
      } as Bookable;
    }));
    return out.filter((b): b is Bookable => !!b);
  }

  /* book-appointment mergeEISslots, for any number of roles: one slot per role, all starting in the same
     minute, each a different specialist. Empty when a role has no free slot. */
  mergeSlots(slots: EisSlot[], roles: string[], name: (profileId: string) => string): BookSlot[] {
    const byRole = roles.map(role => slots.filter(s => s.appointmentrole === role).sort((a, b) => a.slotstart.getTime() - b.slotstart.getTime()));
    if (!roles.length || byRole.some(l => !l.length)) return [];
    const out: BookSlot[] = [];
    const walk = (i: number, picked: EisSlot[]) => {
      if (i === byRole.length) {
        out.push({
          start: picked[0].slotstart, end: picked[0].slotend,
          specialist: picked.map(p => name(p.eisprofile.split('/').pop()!)).join(', '),
          eisprofiles: picked.map(p => p.eisprofile),
          docdata: picked.map(p => ({ id: p.docid, index: p.index })),
        });
        return;
      }
      for (const s of byRole[i]) {
        if (picked.length && (minuteOf(s.slotstart) !== minuteOf(picked[0].slotstart) || picked.some(p => p.eisprofile === s.eisprofile))) continue;
        walk(i + 1, [...picked, s]);
      }
    };
    walk(0, []);
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /* book-appointment confirmSlot + createJourneyRecord. Re-reads every availability doc first and stops
     with 'unavailable' if any picked slot was taken meanwhile. */
  async book(p: { slot: BookSlot; typeId: string; plan: RolePlan; participantId: string; target: BookTarget; loggedinPID: string }):
      Promise<'booked' | 'unavailable'> {
    const { slot, typeId, plan, participantId, target } = p;
    const batch = writeBatch(this.firestore);
    const hosts: string[] = [], free: boolean[] = [], docs: Record<string, any> = {};
    for (const d of slot.docdata) {
      const snap = await getDoc(doc(this.firestore, 'availability/' + d.id));
      const data: any = snap.data();
      docs[snap.id] = data;
      if (data?.[typeId] != null) {
        hosts.push(data['profileref'].path);
        free.push(data[typeId][d.index]?.booked === false && data[typeId][d.index]?.available === true);
      }
    }
    if (!free.length || free.includes(false)) return 'unavailable';

    const hostRole: Record<string, any[]> = {};
    for (const role of plan.roles) {
      for (const h of hosts) {
        if ((plan.rolePersons[role] ?? []).includes(h)) {
          hostRole[role] = hostRole[role] ?? [];
          if (!hostRole[role].includes(h)) hostRole[role].push(h);
        }
      }
    }
    // Every slot overlapping the booked time becomes unavailable; the booked one becomes booked.
    for (const d of slot.docdata) {
      const chosen = docs[d.id];
      for (const ref of chosen['appointments'] ?? []) {
        const list = chosen[ref.id];
        if (list == null) continue;
        list.forEach((s: any, k: number) => {
          const ss = s.slotstart.toDate(), se = s.slotend.toDate();
          if ((ss >= slot.start && ss < slot.end) || (se > slot.start && se < slot.end) || (slot.start >= ss && slot.start < se)) {
            if (!s.booked) s.available = false;
            if (ref.id === typeId && d.index === k && minuteOf(ss) === minuteOf(slot.start) && minuteOf(se) === minuteOf(slot.end)) s.booked = true;
          }
        });
      }
      batch.update(doc(this.firestore, 'availability/' + d.id), chosen);
    }
    for (const role of plan.roles) hostRole[role] = (hostRole[role] ?? []).map(h => doc(this.firestore, h));

    const docid = doc(collection(this.firestore, 'appointments')).id;
    const appointmentDoc = doc(this.firestore, 'appointments/' + docid);
    batch.set(appointmentDoc, {
      docid,
      starttime: slot.start,
      endtime: slot.end,
      appointment: doc(this.firestore, 'appointmenttype/' + typeId),
      appointmentrole: plan.roles.map(r => doc(this.firestore, r)),
      bookedby: doc(this.firestore, 'profile_data/' + participantId),
      hosts: hosts.map(h => doc(this.firestore, h)),
      hostRole,
      slotdata: slot.docdata,
      attended: false,
      cancelled: false,
      created: serverTimestamp(),
      loggedid: p.loggedinPID,
      productid: target.productid,
    });
    await batch.commit();
    await this.createJourneyRecord(target, appointmentDoc.path);
    return 'booked';
  }

  /* The booked activity becomes "ongoing" in the participant's delivery sequence, its product status is
     kept (or set to ongoing), and the deliverable links the appointment. */
  private async createJourneyRecord(target: BookTarget, apptPath: string) {
    const products: any[] = target.participantdelivery.products;
    const deliverySequence = [];
    for (const product of products) {
      for (const delivery of product.delivery) {
        if (delivery.sequenceref.path === target.deliverypath) {
          delivery.status = 'ongoing';
          await updateDoc(doc(this.firestore, 'participantsproduct/' + product['participantproductid']), { status: product.status ?? 'ongoing' });
        }
      }
      deliverySequence.push({ delivery: product.delivery, productref: product.productref, participantproductid: product.participantproductid });
    }
    await updateDoc(doc(this.firestore, 'participantdeliverysequence/' + target.participantdelivery['profileid']), { products: deliverySequence });
    await updateDoc(doc(this.firestore, target.deliverypath), { fileref: arrayUnion(doc(this.firestore, apptPath)), status: 'ongoing' });
  }
}
