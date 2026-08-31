import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectorRef, Component, EventEmitter, Injector, Input,
  OnInit, Output, runInInjectionContext
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Firestore, collection, doc, getDoc, getDocs, limit,
  query, serverTimestamp, updateDoc, where, arrayUnion, writeBatch
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';

interface SlotOverview {
  totalSlots: number;
  booked: number;
  available: number;
  bookingRate: number;
}
interface SlotByProduct {
  name: string;
  booked: number;
  total: number;
  pct: number;
  color: string;
}
interface SpecialistRow {
  name: string;
  eisId: string;
  role: string;
  appointmentTypeName: string;
  appointmentTypeId: string;
  productId: string;
  productClass: string;
  appointmentsGiven: number;
  booked: number;
  availableSlots: number;
  utilizationPct: number;
  utilizationNote?: string;
  utilizationNoteColor?: string;
}

@Component({
  selector: 'app-specialist-appointment-slots',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './specialist-appointment-slots.component.html',
  styleUrl: './specialist-appointment-slots.component.css'
})
export class SpecialistAppointmentSlotsComponent implements OnInit {
  @Input() allowedProductIds: Set<string> | null = null;
  @Input() heading = 'Specialist Appointment Slots';
  @Input() autoOpenAppointmentTypeId: string | null = null;
  @Input() autoOpenEisId: string | null = null;
  @Output() booked = new EventEmitter<{ profileId: string; appointmentTypeId: string; eisId: string }>();

  minDate: Date = new Date();

  specialistLoading = false;
  specialistLoadProgress = '';
  private baseDataLoaded = false;

  specialistDisplayMonth = '';
  specialistStartDate: Date | null = null;
  specialistEndDate: Date | null = null;

  specialistSequences: any[] = [];
  specialistRolesMap: { [id: string]: string[] } = {};
  specialistEISMap: { [id: string]: { [role: string]: string[] } } = {};
  specialistAllSlots: any[] = [];
  slotOverview: SlotOverview = { totalSlots: 0, booked: 0, available: 0, bookingRate: 0 };
  slotsByProduct: SlotByProduct[] = [];
  specialistData: SpecialistRow[] = [];

  selectedActivity: string | null = null;
  selectedAppointmentTypeId: string | null = null;
  selectedView = 'booked';

  expandedSpecialist: string | null = null;
  filteredBookedAppointments: any[] = [];
  specialistBookedAll: any[] = [];

  selectedSpecialistSlots: any;
  availableDates: any[] = [];
  selectedDate = '';
  selectedEisProfile = '';
  selectedEISId: string | null = null;
  mergedSeatSlots: any[] = [];

  profileList: any[] = [];
  mapProfile: any = {};
  selectedUser: string | null = null;
  filteredProfile = '';
  slotSelected = false;
  selectedSlotData: any;
  loggedInPID: any;

  eligibleProfileIds = new Set<string>();
  eligibleProfilesLoading = false;

  mapMetaData: any = {};
  mapprofile: any = {};
  private mappedAppointmentTypes: { id: string; appointmenttype: string }[] = [];
  private allAppointmentsCache: any[] = [];

  constructor(
    private firestore: Firestore,
    private injector: Injector,
    private cdr: ChangeDetectorRef,
    private guard: AuthguardService,
  ) {}

  async ngOnInit() {
    this.initSpecialistDateRange();
    await this.loadReferenceData();
    await this.loadSpecialistBaseData();

    if (this.autoOpenAppointmentTypeId) {
      this.selectedActivity = this.autoOpenAppointmentTypeId;
      await this.onActivityChange(this.autoOpenAppointmentTypeId);
      if (this.autoOpenEisId) {
        await this.openSpecialistSlots(this.autoOpenEisId);
      }
    }
  }

  private async loadReferenceData() {
    try {
      const [metadataSnap, appointmentTypesSnap] = await Promise.all([
        runInInjectionContext(this.injector, () => getDocs(collection(this.firestore, 'participant metadata'))),
        runInInjectionContext(this.injector, () => getDocs(collection(this.firestore, 'appointmenttype'))),
      ]);

      for (const d of metadataSnap.docs) {
        const data = d.data() as any;
        if (!data['profileid']) continue;
        this.mapprofile[data['profileid']] = data['name'];
        this.mapMetaData[data['profileid']] = data;
      }

      this.mappedAppointmentTypes = appointmentTypesSnap.docs.map(d => ({
        id: d.id,
        appointmenttype: (d.data() as any)['appointmenttype']
      }));
    } catch (err) {
      console.error('specialist-appointment-slots: failed to load reference data', err);
    }
  }

  get filteredSpecialistSequences(): any[] {
    if (!this.allowedProductIds || this.allowedProductIds.size === 0) return this.specialistSequences;
    return this.specialistSequences.filter(seq =>
      [...seq.productIds].some((pid: string) => this.allowedProductIds!.has(pid))
    );
  }

  initSpecialistDateRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    this.specialistStartDate = today;
    this.specialistEndDate = nextWeek;
    this.updateSpecialistDisplayMonth();
  }

  onSpecialistStartInput(event: Event) {
    const value = (event.target as HTMLInputElement)?.value;
    if (!value) return;
    const parsed = new Date(`${value}T00:00:00`);
    if (isNaN(parsed.getTime())) return;
    this.onSpecialistDateChange(parsed);
  }

  async onSpecialistDateChange(selectedDate: Date) {
    this.specialistLoading = true;
    if (!selectedDate) return;
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    this.specialistStartDate = start;
    this.specialistEndDate = end;
    this.updateSpecialistDisplayMonth();
    await this.fetchSpecialistSlotsAndCompute(this.selectedAppointmentTypeId);
  }

  updateSpecialistDisplayMonth() {
    const start = this.specialistStartDate;
    const end = this.specialistEndDate;
    if (!start || !end) return;
    this.specialistDisplayMonth =
      `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }

  async loadSpecialistBaseData() {
    if (this.baseDataLoaded) return;
    this.specialistLoading = true;
    this.cdr.detectChanges();
    this.specialistAllSlots = [];
    this.specialistData = [];
    this.filteredBookedAppointments = [];
    this.availableDates = [];

    try {
      const productsSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(collection(this.firestore, 'products'), where('mode', '==', 'Priority Mode')))
      );

      const deliveryPromises = productsSnap.docs.map((productDoc) =>
        runInInjectionContext(this.injector, () =>
          getDocs(query(collection(this.firestore, 'productToDeliverySequence'), where('product', '==', productDoc.ref)))
        ).then((snapshot) => ({ productDoc, snapshot }))
      );
      const allDeliveryResults = await Promise.all(deliveryPromises);

      const activityFetchList: { productDoc: any; productName: string; activityRef: any }[] = [];
      for (const { productDoc, snapshot } of allDeliveryResults) {
        const productName = productDoc.data()['product'];
        for (const deliveryDoc of snapshot.docs) {
          const deliveryOptions = deliveryDoc.data()['deliveryoptions'];
          if (!Array.isArray(deliveryOptions) || deliveryOptions.length === 0) continue;
          for (const option of deliveryOptions) {
            const deliverySequence = option?.deliverysequence;
            if (!Array.isArray(deliverySequence)) continue;
            for (const sequenceItem of deliverySequence) {
              if (sequenceItem.activity) {
                activityFetchList.push({ productDoc, productName, activityRef: sequenceItem.activity });
              }
            }
          }
        }
      }

      const activityResults: { productDoc: any; productName: string; activityRef: any; snap: any }[] = [];
      const actBatchSize = 15;
      for (let i = 0; i < activityFetchList.length; i += actBatchSize) {
        const batch = activityFetchList.slice(i, i + actBatchSize);
        const batchResults = await Promise.all(
          batch.map((item) => runInInjectionContext(this.injector, () => getDoc(item.activityRef)).then((snap) => ({ ...item, snap })))
        );
        activityResults.push(...batchResults);
      }

      const seenTypeIds = new Map<string, any>();
      this.specialistSequences = [];
      for (const { productDoc, productName, snap: activitySnap } of activityResults) {
        if (!activitySnap.exists()) continue;
        const activityData = activitySnap.data();
        const appointmentTypeId = activityData['id'];
        const appointmentTypeName = activityData['appointmenttype'];
        if (!appointmentTypeId || !appointmentTypeName) continue;

        if (seenTypeIds.has(appointmentTypeId)) {
          seenTypeIds.get(appointmentTypeId).productIds.add(productDoc.id);
        } else {
          const entry = {
            productId: productDoc.id,
            productIds: new Set<string>([productDoc.id]),
            productName,
            appointmentType: appointmentTypeName,
            appointmentTypeId,
          };
          seenTypeIds.set(appointmentTypeId, entry);
          this.specialistSequences.push(entry);
        }
      }

      this.specialistSequences.sort((a: any, b: any) => (a.appointmentType || '').localeCompare(b.appointmentType || ''));
      this.baseDataLoaded = true;
      this.specialistLoading = false;
    } catch (error) {
      console.error('Error loading specialist base data:', error);
      this.specialistLoading = false;
      this.cdr.detectChanges();
    }
  }

  async fetchSpecialistSlotsAndCompute(appointmentTypeId: string | null) {
    if (!this.specialistStartDate || !this.specialistEndDate) return;

    const filteredSequences = appointmentTypeId
      ? this.specialistSequences.filter((seq: any) => seq.appointmentTypeId === this.selectedAppointmentTypeId)
      : this.specialistSequences;
    const total = filteredSequences.length;

    this.specialistLoading = true;
    this.cdr.detectChanges();
    try {
      const rangeStart = new Date(this.specialistStartDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(this.specialistEndDate);
      rangeEnd.setHours(23, 59, 59, 999);

      const results: any[] = [];

      for (let i = 0; i < filteredSequences.length; i++) {
        const seq = filteredSequences[i];
        const typeId = seq.appointmentTypeId;
        const roles = this.specialistRolesMap[typeId] || [];
        const eisMap = this.specialistEISMap[typeId] || {};
        const matchedSlots: any[] = [];

        for (const role of roles) {
          const eisProfiles = eisMap[role] || [];
          for (const eisProfile of eisProfiles) {
            const snapshot = await runInInjectionContext(this.injector, () =>
              getDocs(query(
                collection(this.firestore, 'availability'),
                where('profileref', '==', doc(this.firestore, eisProfile)),
                where('appointments', 'array-contains', doc(this.firestore, 'appointmenttype/' + typeId)),
                where('starttime', '>=', rangeStart),
                where('starttime', '<=', rangeEnd)
              ))
            );

            snapshot.forEach((slotDoc) => {
              const slotArray = slotDoc.data()[typeId];
              if (!Array.isArray(slotArray)) return;
              for (let a = 0; a < slotArray.length; a++) {
                const slot = slotArray[a];
                const slotStart = slot.slotstart?.toDate?.() || (slot.slotstart ? new Date(slot.slotstart) : null);
                if (!slotStart || slotStart < rangeStart || slotStart > rangeEnd) continue;
                matchedSlots.push({
                  slotStart: slot.slotstart,
                  slotEnd: slot.slotend,
                  booked: slot.booked || false,
                  available: slot.available || false,
                  eisprofile: eisProfile,
                  docid: slotDoc.id,
                  index: a,
                  appointmentrole: role,
                });
              }
            });
          }
        }

        results.push({
          appointmentTypeId: typeId,
          appointmentTypeName: seq.appointmentType,
          productName: seq.productName,
          productId: seq.productId,
          slots: matchedSlots,
        });

        if ((i + 1) % 5 === 0 || i === total - 1) {
          this.specialistLoadProgress = `${i + 1} / ${total}`;
          this.cdr.detectChanges();
        }
      }

      this.specialistAllSlots = results;
      this.specialistLoadProgress = '';
      this.computeSpecialistDisplayData();
    } catch (error) {
      console.error('Error fetching specialist slots:', error);
    } finally {
      this.specialistLoading = false;
      this.cdr.detectChanges();
    }
  }

  computeSpecialistDisplayData() {
    let totalSlots = 0, totalBooked = 0, totalAvailable = 0;

    const productMap = new Map<string, { name: string; booked: number; total: number }>();
    const specialistMap = new Map<string, {
      productId: string; productNames: Set<string>; appointmentTypeName: string; appointmentTypeId: string;
      totalSlots: number; booked: number; available: number;
    }>();

    const productColors = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#6366f1', '#10b981', '#0891b2', '#be123c', '#7c3aed'];

    for (const appointmentSlot of this.specialistAllSlots) {
      const productName = appointmentSlot.productName || 'Unknown';
      const productId = appointmentSlot.productId;
      const appointmentTypeName = appointmentSlot.appointmentTypeName;
      const appointmentTypeId = appointmentSlot.appointmentTypeId;

      if (!productMap.has(productId)) productMap.set(productId, { name: productName, booked: 0, total: 0 });
      const productEntry = productMap.get(productId)!;

      for (const slot of appointmentSlot.slots) {
        totalSlots++;
        productEntry.total++;
        const eisId = (slot.eisprofile || '').split('/').pop() || 'unknown';

        if (!specialistMap.has(eisId)) {
          specialistMap.set(eisId, { productId: '', productNames: new Set(), appointmentTypeName: '', appointmentTypeId: '', totalSlots: 0, booked: 0, available: 0 });
        }
        const specialistEntry = specialistMap.get(eisId)!;
        specialistEntry.productId = productId;
        specialistEntry.appointmentTypeName = appointmentTypeName;
        specialistEntry.appointmentTypeId = appointmentTypeId;
        specialistEntry.productNames.add(productName);
        specialistEntry.totalSlots++;

        if (slot.booked) { totalBooked++; productEntry.booked++; specialistEntry.booked++; }
        else if (slot.available) { totalAvailable++; specialistEntry.available++; }
      }
    }

    this.slotOverview = {
      totalSlots, booked: totalBooked, available: totalAvailable,
      bookingRate: totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0,
    };

    let colorIndex = 0;
    this.slotsByProduct = [];
    for (const [, entry] of productMap) {
      if (entry.total > 0) {
        this.slotsByProduct.push({
          name: entry.name, booked: entry.booked, total: entry.total,
          pct: Math.round((entry.booked / entry.total) * 100),
          color: productColors[colorIndex % productColors.length],
        });
        colorIndex++;
      }
    }
    this.slotsByProduct.sort((a, b) => b.total - a.total);

    const productClassList = ['upi', 'wig', 'ftm', 'pto', 'ei', 'cs'];
    this.specialistData = [];
    for (const [eisId, entry] of specialistMap) {
      if (entry.totalSlots === 0) continue;
      const name = this.mapprofile[eisId] || this.mapMetaData[eisId]?.['name'] || eisId;
      const utilizationPct = Math.round((entry.booked / entry.totalSlots) * 100);

      let utilizationNote = '', utilizationNoteColor = '';
      if (entry.available > 0 && utilizationPct < 60) { utilizationNote = 'needs bookings'; utilizationNoteColor = '#f59e0b'; }
      else if (entry.available > 0) { utilizationNote = `${entry.available} open`; utilizationNoteColor = '#10b981'; }

      this.specialistData.push({
        name, eisId, role: 'Specialist',
        appointmentTypeName: entry.appointmentTypeName,
        appointmentTypeId: entry.appointmentTypeId,
        productId: entry.productId,
        productClass: productClassList[this.specialistData.length % productClassList.length],
        appointmentsGiven: entry.totalSlots,
        booked: entry.booked,
        availableSlots: entry.available,
        utilizationPct,
        utilizationNote: utilizationNote || undefined,
        utilizationNoteColor: utilizationNoteColor || undefined,
      });
    }
    this.specialistData.sort((a, b) => b.appointmentsGiven - a.appointmentsGiven);
  }

  async onActivityChange(appointmentTypeId: string | null) {
    this.selectedAppointmentTypeId = appointmentTypeId;
    if (!appointmentTypeId) return;

    const rolesSnap = await runInInjectionContext(this.injector, () =>
      getDocs(query(
        collection(this.firestore, 'AppointmentType-To-Roles'),
        where('assigned_appttype_ref', '==', doc(this.firestore, `appointmenttype/${this.selectedAppointmentTypeId}`)),
        limit(1)
      ))
    );

    const roles: string[] = [];
    rolesSnap.forEach((roleDoc) => {
      const requiredRoles = roleDoc.data()['required_role'] ?? [];
      const additionalRoles = roleDoc.data()['additional_role'] ?? [];
      [...requiredRoles, ...additionalRoles].forEach((role: any) => { if (role?.path) roles.push(role.path); });
    });
    this.specialistRolesMap[this.selectedAppointmentTypeId] = roles;

    const eisMap: { [role: string]: string[] } = {};
    await Promise.all(roles.map(async (rolePath) => {
      const eisSnap = await runInInjectionContext(this.injector, () =>
        getDocs(query(collection(this.firestore, 'Roles-To-EIS'), where('assigned_role_ref', '==', doc(this.firestore, rolePath))))
      );
      const eisRefs: string[] = [];
      eisSnap.forEach((eisDoc) => {
        const assignedEis = eisDoc.data()['assigned_eis'] ?? [];
        assignedEis.forEach((eis: any) => eisRefs.push(eis.path));
      });
      eisMap[rolePath] = eisRefs;
    }));
    this.specialistEISMap[this.selectedAppointmentTypeId] = eisMap;
    await this.fetchSpecialistSlotsAndCompute(this.selectedAppointmentTypeId);
  }

  async openSpecialistSlots(eisId: string) {
    if (this.expandedSpecialist === eisId) {
      this.expandedSpecialist = null;
      this.filteredBookedAppointments = [];
      return;
    }
    this.selectedEISId = eisId;
    this.filteredBookedAppointments = [];
    this.specialistBookedAll = [];
    this.expandedSpecialist = eisId;

    await this.loadAllAppointmentsForRange();

    const hostIsThisSpecialist = (appointment: any) =>
      appointment?.hosts?.some((host: any) => {
        const hostPath = host?.path || host?.id || host || '';
        return String(hostPath).split('/').pop() === eisId;
      });

    this.specialistBookedAll = this.allAppointmentsCache.filter(
      (appointment: any) => hostIsThisSpecialist(appointment) && !appointment?.attended
    );

    this.filteredBookedAppointments = this.specialistBookedAll.filter(
      (appointment: any) => appointment?.appointment?.id === this.selectedAppointmentTypeId
    );

    this.mergedSeatSlots = this.computeMergedSeatSlots();
    this.getSpecialistAvailability(eisId);
  }

  private async loadAllAppointmentsForRange() {
    const base = this.specialistStartDate || new Date();
    const baseEnd = this.specialistEndDate || new Date();
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    const monthEnd = new Date(baseEnd.getFullYear(), baseEnd.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'appointments'),
          where('cancelled', '==', false),
          where('starttime', '>=', monthStart),
          where('starttime', '<=', monthEnd)
        ))
      );
      this.allAppointmentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('specialist-appointment-slots: could not load appointments for busy-slot lookup', err);
      this.allAppointmentsCache = [];
    }
  }

  private getBookedParticipantId(appointment: any): string | null {
    return appointment?.bookedby?.id || appointment?.bookedby?.path?.split('/')?.pop() || null;
  }

  getSpecialistAvailability(eisProfile: string) {
    this.selectedEisProfile = eisProfile;
    this.generateWeekDates();
    const firstWithSlots = this.availableDates.find((d: any) => d.hasSlots) || this.availableDates[0];
    if (firstWithSlots) this.onDateSelect(firstWithSlots);
  }

  setSpecialistView(view: string) {
    this.selectedView = view;
    if (view === 'available' && this.availableDates.length > 0) this.onDateSelect(this.availableDates[0]);
  }

  private getSlotsForDate(dateStr: string): any[] {
    const appointmentData = this.specialistAllSlots.find((item: any) => item.appointmentTypeId === this.selectedAppointmentTypeId);
    if (!appointmentData) return [];
    return (appointmentData.slots || []).filter(
      (slot: any) => slot?.eisprofile?.split('/').pop() === this.selectedEisProfile &&
        slot.slotStart?.toDate?.().toDateString() === dateStr
    );
  }

  onDateSelect(date: any) {
    this.selectedDate = date.fullDate.toDateString();
    const raw = this.getSlotsForDate(this.selectedDate)
      .sort((a: any, b: any) => (a.slotStart?.toDate?.()?.getTime() || 0) - (b.slotStart?.toDate?.()?.getTime() || 0));

    const seen = new Set<string>();
    this.selectedSpecialistSlots = raw.filter((slot: any) => {
      const key = `${slot.slotStart?.toDate?.()?.getTime()}_${slot.booked}_${slot.available}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    this.mergedSeatSlots = this.computeMergedSeatSlots();
  }

  get selectedDayAvailableCount(): number { return (this.selectedSpecialistSlots || []).filter((s: any) => s.available && !s.booked).length; }
  get selectedDayBookedCount(): number { return (this.selectedSpecialistSlots || []).filter((s: any) => s.booked).length; }
  get selectedDayUnavailableCount(): number { return (this.selectedSpecialistSlots || []).filter((s: any) => !s.available && !s.booked).length; }

  getSlotBookingInfo(slot: any): { name: string; type: string } | null {
    const start: Date | null = slot?.slotStart?.toDate?.() ?? null;
    const end: Date | null = slot?.slotEnd?.toDate?.() ?? null;
    if (!start) return null;
    const match = (this.specialistBookedAll || []).find((a: any) => {
      const aStart: Date | null = a?.starttime?.toDate?.() ?? null;
      const aEnd: Date | null = a?.endtime?.toDate?.() ?? null;
      if (!aStart) return false;
      if (aEnd && end) return aStart < end && aEnd > start;
      return Math.floor(aStart.getTime() / 60000) === Math.floor(start.getTime() / 60000);
    });
    if (!match) return null;
    return { name: this.resolveBookedParticipantName(match), type: this.resolveAppointmentType(match) || '' };
  }

  private getAppointmentTypeId(appointment: any): string | null {
    return appointment?.appointment?.id || appointment?.appointment?.path?.split('/')?.pop() || null;
  }

  private computeMergedSeatSlots(): any[] {
    const slots = [...(this.selectedSpecialistSlots || [])];
    const result: any[] = [];

    const findAppointmentForSlot = (s: any) => {
      const start: Date | null = s?.slotStart?.toDate?.() ?? null;
      const end: Date | null = s?.slotEnd?.toDate?.() ?? null;
      if (!start) return null;
      return (this.specialistBookedAll || []).find((a: any) => {
        const aStart: Date | null = a?.starttime?.toDate?.() ?? null;
        const aEnd: Date | null = a?.endtime?.toDate?.() ?? null;
        if (!aStart) return false;
        if (aEnd && end) return aStart < end && aEnd > start;
        return Math.floor(aStart.getTime() / 60000) === Math.floor(start.getTime() / 60000);
      });
    };

    const participantIds: (string | null)[] = slots.map((s: any) => s.available && !s.booked ? null : this.getBookedParticipantId(findAppointmentForSlot(s)));
    const appointmentTypeIds: (string | null)[] = slots.map((s: any) => s.available && !s.booked ? null : this.getAppointmentTypeId(findAppointmentForSlot(s)));

    const isOccupied = (s: any) => s.booked || (!s.available && !s.booked);
    let i = 0;
    while (i < slots.length) {
      const slot = slots[i];
      if (!isOccupied(slot)) { result.push({ ...slot, _merged: false, _mergedEnd: slot.slotEnd }); i++; continue; }

      const participantId = participantIds[i];
      const appointmentTypeId = appointmentTypeIds[i];
      if (!participantId) { result.push({ ...slot, _merged: false, _mergedEnd: slot.slotEnd }); i++; continue; }

      let j = i + 1;
      while (j < slots.length && isOccupied(slots[j]) && participantIds[j] === participantId && appointmentTypeIds[j] === appointmentTypeId) j++;

      if (j > i + 1) {
        result.push({ ...slot, _merged: true, _mergedEnd: slots[j - 1]?.slotEnd ?? slots[j - 1]?.slotStart, _mergeCount: j - i });
      } else {
        result.push({ ...slot, _merged: false, _mergedEnd: slot.slotEnd });
      }
      i = j;
    }
    return result;
  }

  private resolveAppointmentType(appointment: any): string | undefined {
    if (appointment?.formid) {
      if (appointment?.formname === 'Critical Support Pre Form') return 'Pre-Process';
      if (appointment?.formname === 'Critical Support Post Form') return 'Post-Process Form';
      if (appointment?.formname === 'Post Session Check-in') return 'Post Session Check-in';
    }
    const id = appointment?.appointment?.id;
    return this.mappedAppointmentTypes.find(x => x.id === id)?.appointmenttype;
  }

  private resolveBookedParticipantName(appointment: any): string {
    const participantId = this.getBookedParticipantId(appointment);
    if (!participantId) return 'Booked';
    return this.mapMetaData[participantId]?.name || this.mapprofile[participantId] || 'Booked';
  }

  getBookedProfileName(slot: any): string { return this.getSlotBookingInfo(slot)?.name || ''; }

  get bookedForSelectedDate(): any[] {
    if (!this.selectedDate) return [];
    return (this.filteredBookedAppointments || []).filter((a: any) => a?.starttime?.toDate?.().toDateString() === this.selectedDate);
  }

  generateWeekDates() {
    this.availableDates = [];
    if (!this.specialistStartDate || !this.specialistEndDate) return;
    const currentDate = new Date(this.specialistStartDate);
    while (currentDate <= this.specialistEndDate) {
      const dateStr = new Date(currentDate).toDateString();
      const slots = this.getSlotsForDate(dateStr);
      const availableCount = slots.filter((s: any) => s.available && !s.booked).length;
      this.availableDates.push({
        fullDate: new Date(currentDate),
        date: currentDate.getDate(),
        day: currentDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        hasSlots: slots.length > 0,
        slotCount: slots.length,
        availableCount,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  async goToBooking(selectedSlot: any) {
    this.selectedUser = null;
    this.filteredProfile = '';
    this.selectedSlotData = selectedSlot;
    this.slotSelected = true;
    this.eligibleProfilesLoading = true;
    this.cdr.detectChanges();

    this.loadEligibleProfiles(this.selectedAppointmentTypeId);

    this.guard.getProfileMap().then(data => {
      this.profileList = data.list;
      this.mapProfile = data.map;
      this.cdr.detectChanges();
    });

    const roles = await this.guard.getRoles();
    this.loggedInPID = roles.profile_ref.id;
  }

  get selectedSlotLabel(): string {
    const slot = this.selectedSlotData;
    if (!slot) return '';
    const start = slot?.slotStart?.toDate?.();
    const end = slot?.slotEnd?.toDate?.();
    if (!start) return '';
    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const eisId = (slot?.eisprofile || '').split('/').pop();
    const who = this.mapprofile[eisId] || this.mapMetaData[eisId]?.['name'] || '';
    const day = start.toLocaleDateString([], { day: '2-digit', month: 'short' });
    const time = end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
    return who ? `${day} · ${time} · ${who}` : `${day} · ${time}`;
  }

  async loadEligibleProfiles(appointmentTypeId: string | null) {
    this.eligibleProfileIds = new Set<string>();
    if (!appointmentTypeId) return;
    this.eligibleProfilesLoading = true;
    this.cdr.detectChanges();
    try {
      const snap = await runInInjectionContext(this.injector, () =>
        getDocs(query(
          collection(this.firestore, 'deliverables'),
          where('deliveryref', '==', doc(this.firestore, 'appointmenttype/' + appointmentTypeId)),
          where('type', '==', 'appointment'),
          where('status', '==', 'ready'),
        ))
      );
      snap.forEach((d) => { const pid = d.data()['profileid']; if (pid) this.eligibleProfileIds.add(pid); });
    } catch (e) {
      console.error('Error loading eligible profiles:', e);
    } finally {
      this.eligibleProfilesLoading = false;
      this.cdr.detectChanges();
    }
  }

  returnClient() {
    const search = (this.filteredProfile || '').toLowerCase();
    return this.profileList.filter((e: any) => this.eligibleProfileIds.has(e.id) && (e.name || '').toLowerCase().includes(search));
  }

  selectProfileForBooking(user: any) {
    this.selectedUser = user.id;
    this.onProfileSelect(user.id);
  }

  async directBookAppointment(appointmentTypeId: string, profileId: string) {
    try {
      const selectedSlotData = this.selectedSlotData;
      await runInInjectionContext(this.injector, async () => {
        const deliverableCollection = collection(this.firestore, 'deliverables');
        const deliverableQuery = query(
          deliverableCollection,
          where('profileid', '==', profileId),
          where('type', '==', 'appointment'),
          where('deliveryref', '==', doc(this.firestore, 'appointmenttype/' + appointmentTypeId))
        );
        const deliverableDocs = await getDocs(deliverableQuery);
        if (deliverableDocs.empty) { alert('No matching deliverable found for this appointment type.'); return; }

        const chosenRole: string = selectedSlotData?.appointmentrole;
        const chosenEis: string = selectedSlotData?.eisprofile;
        if (chosenRole && chosenEis) {
          const custMapSnap = await getDoc(doc(this.firestore, 'customer_eismapping/' + profileId));
          if (custMapSnap.exists()) {
            const eisroles = custMapSnap.data()?.['eisroles'] || {};
            const assigned = (eisroles[chosenRole] || []).map((e: any) => e?.path || e).filter(Boolean);
            if (assigned.length > 0 && !assigned.includes(chosenEis)) {
              alert('The selected specialist is not assigned to this customer for this appointment role.');
              return;
            }
          }
        }

        const deliverableMap: { [path: string]: any } = {};
        deliverableDocs.docs.forEach(d => { deliverableMap[d.ref.path] = d; });

        const deliverySequenceDoc = doc(this.firestore, 'participantdeliverysequence/' + profileId);
        const participantDelivery = await getDoc(deliverySequenceDoc);
        if (!participantDelivery.exists()) { alert('No Delivery Sequence Found'); return; }

        const products = participantDelivery.data()['products'];
        let matchedProduct: any = null, matchedDelivery: any = null, deliverablePath: string = null as any;

        for (const product of products) {
          if (!product.delivery) continue;
          for (const delivery of product.delivery) {
            if (delivery.type === 'appointment' && (delivery.status === 'ready' || delivery.status == null) && deliverableMap[delivery.sequenceref?.path] !== undefined) {
              matchedProduct = product; matchedDelivery = delivery; deliverablePath = delivery.sequenceref.path; break;
            }
          }
          if (matchedProduct) break;
        }
        if (!matchedProduct || !matchedDelivery || !deliverablePath) { alert('No matching delivery sequence entry found.'); return; }

        const apptRoleCollection = collection(this.firestore, 'AppointmentType-To-Roles');
        const apptRoleQuery = query(apptRoleCollection, where('assigned_appttype_ref', '==', doc(this.firestore, 'appointmenttype/' + appointmentTypeId)), limit(1));
        let appointmentRoles: string[] = [];
        const rolesDocs = await getDocs(apptRoleQuery);
        rolesDocs.forEach(d => {
          (d.data()['required_role'] ?? []).forEach((r: any) => appointmentRoles.push(r.path));
          (d.data()['additional_role'] ?? []).forEach((r: any) => appointmentRoles.push(r.path));
        });
        if (appointmentRoles.length === 0) { alert('No roles configured for this appointment type.'); return; }

        const slotStart: Date = selectedSlotData.slotStart;
        const slotEnd: Date = selectedSlotData.slotEnd;
        const eisprofile: string = selectedSlotData.eisprofile;
        const docdata: { id: string, index: number }[] = selectedSlotData.docdata ?? [{ id: selectedSlotData.docid, index: selectedSlotData.index ?? 0 }];

        const slotRole: string = selectedSlotData.appointmentrole || appointmentRoles[0];
        const hostRole: { [key: string]: any[] } = {};
        hostRole[slotRole] = [doc(this.firestore, eisprofile)];

        const availabilityDocRef = doc(this.firestore, 'availability/' + docdata[0].id);
        const availabilitySnap = await getDoc(availabilityDocRef);
        const availabilityData: any = availabilitySnap.data() || {};

        const toDate = (v: any): Date | null => v?.toDate?.() ?? (v ? new Date(v) : null);
        const targetStart = toDate(slotStart);
        const targetEnd = toDate(slotEnd);
        const apptTypeRefs: any[] = availabilityData['appointments'] ?? [];
        for (const apptRef of apptTypeRefs) {
          const apptId = apptRef?.id;
          if (!apptId) continue;
          const computedSlots = availabilityData[apptId];
          if (!Array.isArray(computedSlots)) continue;
          for (let k = 0; k < computedSlots.length; k++) {
            const se = computedSlots[k];
            const sStart = toDate(se.slotstart);
            const sEnd = toDate(se.slotend);
            if (!sStart || !sEnd || !targetStart || !targetEnd) continue;
            const overlaps = (sStart >= targetStart && sStart < targetEnd) || (sEnd > targetStart && sEnd < targetEnd) || (targetStart >= sStart && targetStart < sEnd);
            if (!overlaps) continue;
            if (!se.booked) se.available = false;
            if (apptId === appointmentTypeId && k === docdata[0].index) se.booked = true;
          }
        }

        const requiredRoles = appointmentRoles.map(r => doc(this.firestore, r));
        const hostRefs = [doc(this.firestore, eisprofile)];
        const docid = doc(collection(this.firestore, 'appointments')).id;
        const appointmentDocRef = doc(this.firestore, 'appointments/' + docid);
        const appointmentData = {
          docid, starttime: slotStart, endtime: slotEnd,
          appointment: doc(this.firestore, 'appointmenttype/' + appointmentTypeId),
          appointmentrole: requiredRoles,
          bookedby: doc(this.firestore, 'profile_data/' + profileId),
          hosts: hostRefs, hostRole, slotdata: docdata,
          attended: false, cancelled: false, created: serverTimestamp(),
          loggedid: this.loggedInPID, productid: matchedProduct.productref.id
        };

        const batch = writeBatch(this.firestore);
        batch.update(availabilityDocRef, availabilityData);
        batch.set(appointmentDocRef, appointmentData);
        await batch.commit();

        const updatedProducts = products.map((p: any) => {
          if (p.participantproductid !== matchedProduct.participantproductid) return p;
          const updatedDelivery = (p.delivery ?? []).map((d: any) => d.sequenceref?.path === deliverablePath ? { ...d, status: 'ongoing' } : d);
          return { ...p, delivery: updatedDelivery };
        });
        await updateDoc(doc(this.firestore, 'participantdeliverysequence/' + profileId), { products: updatedProducts });
        await updateDoc(doc(this.firestore, deliverablePath), { fileref: arrayUnion(doc(this.firestore, appointmentDocRef.path)), status: 'ongoing' });
        await updateDoc(doc(this.firestore, 'participantsproduct/' + matchedProduct.participantproductid), { status: 'ongoing' });

        alert('Appointment Booked Successfully!');

        const wasAvailable = !!selectedSlotData?.available && !selectedSlotData?.booked;
        if (selectedSlotData) { selectedSlotData.booked = true; selectedSlotData.available = false; }
        if (wasAvailable) {
          const slotEisId = (selectedSlotData?.eisprofile || '').split('/').pop();
          const spec = (this.specialistData || []).find((s: any) => s.eisId === slotEisId);
          if (spec) {
            spec.booked = (spec.booked || 0) + 1;
            spec.availableSlots = Math.max(0, (spec.availableSlots || 0) - 1);
            spec.utilizationPct = spec.appointmentsGiven ? Math.round((spec.booked / spec.appointmentsGiven) * 100) : 0;
            if (spec.availableSlots > 0 && spec.utilizationPct < 60) { spec.utilizationNote = 'needs bookings'; spec.utilizationNoteColor = '#f59e0b'; }
            else if (spec.availableSlots > 0) { spec.utilizationNote = `${spec.availableSlots} open`; spec.utilizationNoteColor = '#10b981'; }
            else spec.utilizationNote = '';
          }
          const slotDay = selectedSlotData?.slotStart?.toDate?.()?.toDateString?.();
          const dayEntry = (this.availableDates || []).find((d: any) => d.fullDate?.toDateString?.() === slotDay);
          if (dayEntry && dayEntry.availableCount > 0) dayEntry.availableCount--;
        }

        const newAppt = { starttime: slotStart, endtime: slotEnd, profileid: profileId, appointment: { id: appointmentTypeId } };
        this.filteredBookedAppointments = [...(this.filteredBookedAppointments || []), newAppt];
        this.specialistBookedAll = [...(this.specialistBookedAll || []), newAppt];

        this.slotSelected = false;
        this.selectedUser = null;
        this.filteredProfile = '';
        this.selectedSlotData = null;
        this.cdr.detectChanges();

        this.booked.emit({ profileId, appointmentTypeId, eisId: (eisprofile || '').split('/').pop() || '' });
      });
    } catch (err) {
      console.error('directBookAppointment error:', err);
      alert('Error booking appointment. Please try again.');
    }
  }

  async onProfileSelect(selectedprofile: string) {
    const confirmed = confirm('Are you sure you want to book this appointment?');
    if (confirmed) {
      await this.directBookAppointment(this.selectedAppointmentTypeId!, selectedprofile);
    }
  }
}