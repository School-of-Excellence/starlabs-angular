import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  limit,
  query,
  where
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { LoadingProgressComponent } from '../loading-progress/loading-progress.component';
import { AuthguardService } from '../authguard.service';

@Component({
  selector: 'app-appointment-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatNativeDateModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatBadgeModule
  ],
  templateUrl: './appointment-dashboard.component.html',
  styleUrls: ['./appointment-dashboard.component.css']
})
export class AppointmentDashboardComponent implements OnInit {

  // === Data ===
  lastSequences: any[] = [];
  groupedProducts: { productId: string; productName: string; appointmentTypes: any[] }[] = [];

  // === Slots ===
  userAvailableSlots: any[] = [];
  allAppointmentSlots: { appointmentType: string; appointmentLabel: string; slots: any[] }[] = [];

  // === Roles / EIS ===
  appointmentRolesMap: { [appointmentTypeId: string]: string[] } = {};
  rolePersonsMap: { [appointmentTypeId: string]: { [role: string]: string[] } } = {};

  // === UI State ===
  loading = false;
  loadingSlots = false;

  // Date range — default both to today
  startDate: Date = new Date();
  endDate: Date = new Date();

  // Track which appointment type is expanded
  expandedAppointmentTypeId: string | null = null;

  selectedSlot: any = null;
  selectedUser: string = null;
  mindate: any;
  superRole: boolean = false;
  mapProfile: { [key: string]: string } = {};
  filteredProfile = '';
  goback: boolean = false;

  constructor(
    private firestore: Firestore,
    private matDialog: MatDialog,
    private datepipe: DatePipe,
    private guard: AuthguardService,
  ) {
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });
  }

  async ngOnInit() {
    const profileResult = await this.guard.getProfileMap();
    this.mapProfile = profileResult.map;
    await this.loadAllProductsAndAppointments();

    // Auto-fetch slots for today on init
    if (this.lastSequences.length > 0) {
      this.fetchSlotsForDateRange();
    }
  }

  async loadAllProductsAndAppointments() {
    this.loading = true;
    this.lastSequences = [];
    const seenAppointmentTypes = new Set();

    try {
      const productsnapshot = await getDocs(
        query(
          collection(this.firestore, 'products'),
          where('mode', '==', 'Priority Mode')
        )
      );

      const deliverySnapshotPromises = productsnapshot.docs.map(productDoc =>
        getDocs(
          query(
            collection(this.firestore, 'productToDeliverySequence'),
            where('product', '==', productDoc.ref)
          )
        ).then(snapshot => ({ productDoc, snapshot }))
      );

      const allDeliveryResults = await Promise.all(deliverySnapshotPromises);

      const activityFetchList: { productDoc: any; productName: string; activityRef: any }[] = [];

      for (const { productDoc, snapshot: deliverySnapshot } of allDeliveryResults) {
        const productData = productDoc.data();
        const productName = productData['product'];

        for (const d of deliverySnapshot.docs) {
          const deliveryoptions = d.data()['deliveryoptions'];
          if (!Array.isArray(deliveryoptions) || deliveryoptions.length === 0) continue;

          const lastOption = deliveryoptions.at(-1);
          const deliverysequence = lastOption?.deliverysequence;
          if (!Array.isArray(deliverysequence)) continue;

          for (const seq of deliverysequence) {
            const activityRef = seq.activity;
            if (!activityRef) continue;
            activityFetchList.push({ productDoc, productName, activityRef });
          }
        }
      }

      const activitySnapPromises = activityFetchList.map(item =>
        getDoc(item.activityRef).then(snap => ({ ...item, snap }))
      );

      const allActivityResults = await Promise.all(activitySnapPromises);

      for (const { productDoc, productName, snap: activitySnap } of allActivityResults) {
        if (!activitySnap.exists()) continue;

        const activityData = activitySnap.data();
        const activityDocId = activitySnap.id;
        const appointmentTypeName = activityData['appointmenttype'];
        const appointmentTypeId = activityData['id'];

        if (!appointmentTypeId || !appointmentTypeName) continue;
        if (seenAppointmentTypes.has(appointmentTypeId)) continue;
        seenAppointmentTypes.add(appointmentTypeId);

        this.lastSequences.push({
          productId: productDoc.id,
          productName: productName,
          activityId: activityDocId,
          appointmentType: appointmentTypeName,
          appointmentTypeId: appointmentTypeId,
          activityData: activityData
        });
      }

      this.groupedProducts = this.groupByProduct(this.lastSequences);
      await this.prefetchAllRolesAndEIS();

    } catch (error) {
      console.error('Error loading products and appointments:', error);
    } finally {
      this.loading = false;
    }
  }

  groupByProduct(sequences: any[]): { productId: string; productName: string; appointmentTypes: any[] }[] {
    const map = new Map<string, { productId: string; productName: string; appointmentTypes: any[] }>();

    for (const seq of sequences) {
      if (!map.has(seq.productId)) {
        map.set(seq.productId, {
          productId: seq.productId,
          productName: seq.productName,
          appointmentTypes: []
        });
      }
      map.get(seq.productId)!.appointmentTypes.push(seq);
    }

    return Array.from(map.values());
  }

  async prefetchAllRolesAndEIS() {
    const rolePromises = this.lastSequences.map(async (seq) => {
      const appointmentTypeId = seq.appointmentTypeId;

      const apptRoleCollection = collection(this.firestore, 'AppointmentType-To-Roles');
      const apptRoleQuery = query(
        apptRoleCollection,
        where('assigned_appttype_ref', '==', doc(this.firestore, 'appointmenttype/' + appointmentTypeId)),
        limit(1)
      );

      const rolesSnap = await getDocs(apptRoleQuery);
      const roles: string[] = [];

      rolesSnap.forEach(roleDoc => {
        const requiredRole = roleDoc.data()['required_role'] ?? [];
        requiredRole.forEach((element: any) => roles.push(element.path));
      });

      this.appointmentRolesMap[appointmentTypeId] = roles;

      const eisMap: { [role: string]: string[] } = {};
      const eisPromises = roles.map(async (role) => {
        const eisRoleCollection = collection(this.firestore, 'Roles-To-EIS');
        const eisRoleQuery = query(
          eisRoleCollection,
          where('assigned_role_ref', '==', doc(this.firestore, role))
        );
        const eisSnap = await getDocs(eisRoleQuery);
        const eisRefs: string[] = [];

        eisSnap.forEach(eisDoc => {
          eisDoc.data()['assigned_eis']?.forEach((element: any) => {
            if (element.id !== this.selectedUser) {
              eisRefs.push(element.path);
            }
          });
        });

        eisMap[role] = eisRefs;
      });

      await Promise.all(eisPromises);
      this.rolePersonsMap[appointmentTypeId] = eisMap;
    });

    await Promise.all(rolePromises);
  }

  // ──────────────────────────────────────────────
  // Toggle appointment type to show its slots
  // ──────────────────────────────────────────────
  toggleAppointmentType(appointmentTypeId: string) {
    this.expandedAppointmentTypeId =
      this.expandedAppointmentTypeId === appointmentTypeId ? null : appointmentTypeId;
  }

  // ──────────────────────────────────────────────
  // Check if appointment type belongs to a product
  // ──────────────────────────────────────────────
  isAppointmentTypeInProduct(product: any, appointmentTypeId: string): boolean {
    return product.appointmentTypes.some((ap: any) => ap.appointmentTypeId === appointmentTypeId);
  }

  // ──────────────────────────────────────────────
  // Get slots for a specific appointment type
  // ──────────────────────────────────────────────
  getSlotsForType(appointmentTypeId: string): any[] {
    const found = this.allAppointmentSlots.find(a => a.appointmentType === appointmentTypeId);
    return found ? found.slots : [];
  }

  getSlotCount(appointmentTypeId: string): number {
    return this.getSlotsForType(appointmentTypeId).length;
  }

  // ──────────────────────────────────────────────
  // DATE RANGE HANDLERS
  // ──────────────────────────────────────────────
  onDateRangeChange(type: 'start' | 'end', event: any) {
    const value = event.value;
    if (type === 'start') {
      this.startDate = value;
    } else {
      this.endDate = value;
    }

    if (this.startDate && this.endDate) {
      this.fetchSlotsForDateRange();
    }
  }

  // ──────────────────────────────────────────────
  // FETCH SLOTS FOR DATE RANGE
  // ──────────────────────────────────────────────
  async fetchSlotsForDateRange() {
    if (!this.startDate || !this.endDate) return;

    this.userAvailableSlots = [];
    this.allAppointmentSlots = [];
    this.selectedSlot = null;
    this.loadingSlots = true;

    if (this.mindate) {
      const minimumDate = new Date(new Date(this.mindate).setHours(0, 0, 0));
      if (this.startDate < minimumDate) {
        alert('Start date is before the minimum allowed date.');
        this.loadingSlots = false;
        return;
      }
    }

    this.matDialog.open(LoadingProgressComponent, {
      disableClose: true,
      data: { type: 'spinner', msg: 'Getting Slots for Date Range...' }
    });

    try {
      let rangeStart: Date;
      const rangeEnd = new Date(new Date(this.endDate).setHours(23, 59, 59));

      if (this.superRole) {
        rangeStart = new Date(new Date(this.startDate).setHours(0, 0, 0));
      } else {
        const currentDateTime = new Date();
        const selectedStart = new Date(this.startDate);
        selectedStart.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedStart.getTime() === today.getTime()) {
          rangeStart = new Date(
            selectedStart.setHours(currentDateTime.getHours(), currentDateTime.getMinutes(), 0)
          );
        } else {
          rangeStart = new Date(selectedStart.setHours(0, 0, 0, 0));
        }
      }

      const slotPromises = this.lastSequences.map(async (seq) => {
        const appointmentTypeId = seq.appointmentTypeId;
        const appointmentTypeName = seq.appointmentType;
        const roles = this.appointmentRolesMap[appointmentTypeId] || [];
        const eisMap = this.rolePersonsMap[appointmentTypeId] || {};

        if (roles.length === 0) {
          return {
            appointmentType: appointmentTypeId,
            appointmentLabel: appointmentTypeName || appointmentTypeId,
            slots: []
          };
        }

        const slotsOfEIS: any[] = [];
        const availabilityPromises: Promise<void>[] = [];

        for (const role of roles) {
          const eisProfiles = eisMap[role] || [];
          for (const eisProfile of eisProfiles) {
            const promise = getDocs(
              query(
                collection(this.firestore, 'availability'),
                where('profileref', '==', doc(this.firestore, eisProfile)),
                where('appointments', 'array-contains', doc(this.firestore, 'appointmenttype/' + appointmentTypeId)),
                where('starttime', '>=', rangeStart),
                where('starttime', '<=', rangeEnd)
              )
            ).then(availabilitySnap => {
              availabilitySnap.forEach(slotDoc => {
                const localSlot = slotDoc.data()[appointmentTypeId];
                if (localSlot && Array.isArray(localSlot) && localSlot.length > 0) {
                  for (let a = 0; a < localSlot.length; a++) {
                    const data = localSlot[a];
                    if (data.booked === false && data.available === true) {
                      slotsOfEIS.push({
                        slotstart: data.slotstart.toDate(),
                        slotend: data.slotend.toDate(),
                        docid: slotDoc.id,
                        availabilityDocId: slotDoc.id,
                        index: a,
                        eisprofile: eisProfile,
                        appointmentrole: role,
                        appointmentTypeId: appointmentTypeId
                      });
                    }
                  }
                }
              });
            });

            availabilityPromises.push(promise);
          }
        }

        await Promise.all(availabilityPromises);

        slotsOfEIS.sort((a, b) => a.slotstart.getTime() - b.slotstart.getTime());

        const slotByRoles: any[] = [];
        const availableRoles: string[] = [];

        for (const role of roles) {
          const totalEIS = slotsOfEIS.filter(e => e.appointmentrole === role);
          if (totalEIS.length > 0) {
            slotByRoles.push({ [role]: totalEIS });
            availableRoles.push(role);
          }
        }

        let mergedSlots: any[] = [];
        if (slotByRoles.length > 0) {
          mergedSlots = this.mergeEISslots(slotByRoles, availableRoles);
        }

        return {
          appointmentType: appointmentTypeId,
          appointmentLabel: appointmentTypeName || appointmentTypeId,
          slots: mergedSlots
        };
      });

      const results = await Promise.all(slotPromises);

      this.allAppointmentSlots = results.filter(r => r.slots.length > 0);
      this.userAvailableSlots = this.allAppointmentSlots.flatMap(a => a.slots);

    } catch (error) {
      console.error('Error fetching slots:', error);
      alert('Error fetching slots. Please try again.');
    } finally {
      this.matDialog.closeAll();
      this.loadingSlots = false;
    }
  }

  // ──────────────────────────────────────────────
  // Group slots by date for display
  // ──────────────────────────────────────────────
  groupSlotsByDate(slots: any[]): { dateKey: string; dateLabel: string; slots: any[] }[] {
    const map = new Map<string, any[]>();

    for (const slot of slots) {
      const dateKey = this.datepipe.transform(slot.start, 'yyyy-MM-dd') || '';
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(slot);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, daySlots]) => ({
        dateKey,
        dateLabel: this.datepipe.transform(new Date(dateKey + 'T00:00:00'), 'EEE, MMM d') || dateKey,
        slots: daySlots
      }));
  }

  // ──────────────────────────────────────────────
  // Select a slot
  // ──────────────────────────────────────────────
  selectSlot(slot: any) {
    this.selectedSlot = this.selectedSlot === slot ? null : slot;
  }

  isSlotSelected(slot: any): boolean {
    return this.selectedSlot === slot;
  }

  mergeEISslots(slots: any[], roles: string[]): any[] {
    const mergedSlots: any[] = [];

    if (slots.length === 0) return mergedSlots;

    if (slots.length === 1) {
      const roleSlot1 = slots[0][roles[0]];

      for (const slot1 of roleSlot1) {
        const eisId = doc(this.firestore, slot1.eisprofile).id;
        mergedSlots.push({
          start: slot1.slotstart,
          end: slot1.slotend,
          specialist: this.mapProfile[eisId] || 'Specialist',
          appointmentTypeId: slot1.appointmentTypeId,
          availabilityDocIds: [slot1.availabilityDocId],
          eisProfiles: [slot1.eisprofile],
          eisNames: [this.mapProfile[eisId] || 'Unknown'],
          docdata: [{ id: slot1.docid, index: slot1.index }],
          roleCount: 1
        });
      }
    }
    else if (slots.length === 2) {
      const roleSlot1 = slots[0][roles[0]];
      const roleSlot2 = slots[1][roles[1]];

      const matchedFromRole1 = new Set<number>();
      const matchedFromRole2 = new Set<number>();

      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          const slot2 = roleSlot2[j];
          if (
            this.datepipe.transform(slot1.slotstart, 'short') === this.datepipe.transform(slot2.slotstart, 'short') &&
            slot1.eisprofile !== slot2.eisprofile
          ) {
            const eisId1 = doc(this.firestore, slot1.eisprofile).id;
            const eisId2 = doc(this.firestore, slot2.eisprofile).id;
            mergedSlots.push({
              start: slot1.slotstart,
              end: slot1.slotend,
              eisNames: [this.mapProfile[eisId1] || 'Unknown', this.mapProfile[eisId2] || 'Unknown'],
              specialist: (this.mapProfile[eisId1] || '') + ', ' + (this.mapProfile[eisId2] || ''),
              appointmentTypeId: slot1.appointmentTypeId,
              availabilityDocIds: [slot1.availabilityDocId, slot2.availabilityDocId],
              eisProfiles: [slot1.eisprofile, slot2.eisprofile],
              docdata: [
                { id: slot1.docid, index: slot1.index },
                { id: slot2.docid, index: slot2.index },
              ],
              roleCount: 2
            });
            matchedFromRole1.add(i);
            matchedFromRole2.add(j);
          }
        }
      }

      for (let i = 0; i < roleSlot1.length; i++) {
        if (!matchedFromRole1.has(i)) {
          const slot1 = roleSlot1[i];
          const eisId = doc(this.firestore, slot1.eisprofile).id;
          mergedSlots.push({
            start: slot1.slotstart,
            end: slot1.slotend,
            specialist: this.mapProfile[eisId] || 'Specialist',
            appointmentTypeId: slot1.appointmentTypeId,
            availabilityDocIds: [slot1.availabilityDocId],
            eisProfiles: [slot1.eisprofile],
            eisNames: [this.mapProfile[eisId] || 'Unknown'],
            docdata: [{ id: slot1.docid, index: slot1.index }],
            roleCount: 1
          });
        }
      }

      for (let j = 0; j < roleSlot2.length; j++) {
        if (!matchedFromRole2.has(j)) {
          const slot2 = roleSlot2[j];
          const eisId = doc(this.firestore, slot2.eisprofile).id;
          mergedSlots.push({
            start: slot2.slotstart,
            end: slot2.slotend,
            specialist: this.mapProfile[eisId] || 'Specialist',
            appointmentTypeId: slot2.appointmentTypeId,
            availabilityDocIds: [slot2.availabilityDocId],
            eisProfiles: [slot2.eisprofile],
            eisNames: [this.mapProfile[eisId] || 'Unknown'],
            docdata: [{ id: slot2.docid, index: slot2.index }],
            roleCount: 1
          });
        }
      }
    }
    else if (slots.length === 3) {
      const roleSlot1 = slots[0][roles[0]];
      const roleSlot2 = slots[1][roles[1]];
      const roleSlot3 = slots[2][roles[2]];

      const matchedFromRole1 = new Set<number>();
      const matchedFromRole2 = new Set<number>();
      const matchedFromRole3 = new Set<number>();

      for (let i = 0; i < roleSlot1.length; i++) {
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          const slot2 = roleSlot2[j];
          for (let k = 0; k < roleSlot3.length; k++) {
            const slot3 = roleSlot3[k];
            if (
              this.datepipe.transform(slot1.slotstart, 'short') === this.datepipe.transform(slot2.slotstart, 'short') &&
              this.datepipe.transform(slot2.slotstart, 'short') === this.datepipe.transform(slot3.slotstart, 'short') &&
              slot1.eisprofile !== slot2.eisprofile &&
              slot2.eisprofile !== slot3.eisprofile &&
              slot3.eisprofile !== slot1.eisprofile
            ) {
              const eisId1 = doc(this.firestore, slot1.eisprofile).id;
              const eisId2 = doc(this.firestore, slot2.eisprofile).id;
              const eisId3 = doc(this.firestore, slot3.eisprofile).id;
              mergedSlots.push({
                start: slot1.slotstart,
                end: slot1.slotend,
                specialist:
                  (this.mapProfile[eisId1] || '') + ', ' +
                  (this.mapProfile[eisId2] || '') + ', ' +
                  (this.mapProfile[eisId3] || ''),
                eisNames: [
                  this.mapProfile[eisId1] || 'Unknown',
                  this.mapProfile[eisId2] || 'Unknown',
                  this.mapProfile[eisId3] || 'Unknown'
                ],
                appointmentTypeId: slot1.appointmentTypeId,
                availabilityDocIds: [slot1.availabilityDocId, slot2.availabilityDocId, slot3.availabilityDocId],
                eisProfiles: [slot1.eisprofile, slot2.eisprofile, slot3.eisprofile],
                docdata: [
                  { id: slot1.docid, index: slot1.index },
                  { id: slot2.docid, index: slot2.index },
                  { id: slot3.docid, index: slot3.index },
                ],
                roleCount: 3
              });
              matchedFromRole1.add(i);
              matchedFromRole2.add(j);
              matchedFromRole3.add(k);
            }
          }
        }
      }

      for (let i = 0; i < roleSlot1.length; i++) {
        if (matchedFromRole1.has(i)) continue;
        const slot1 = roleSlot1[i];
        for (let j = 0; j < roleSlot2.length; j++) {
          if (matchedFromRole2.has(j)) continue;
          const slot2 = roleSlot2[j];
          if (
            this.datepipe.transform(slot1.slotstart, 'short') === this.datepipe.transform(slot2.slotstart, 'short') &&
            slot1.eisprofile !== slot2.eisprofile
          ) {
            const eisId1 = doc(this.firestore, slot1.eisprofile).id;
            const eisId2 = doc(this.firestore, slot2.eisprofile).id;
            mergedSlots.push({
              start: slot1.slotstart,
              end: slot1.slotend,
              specialist: (this.mapProfile[eisId1] || '') + ', ' + (this.mapProfile[eisId2] || ''),
              eisNames: [this.mapProfile[eisId1] || 'Unknown', this.mapProfile[eisId2] || 'Unknown'],
              appointmentTypeId: slot1.appointmentTypeId,
              availabilityDocIds: [slot1.availabilityDocId, slot2.availabilityDocId],
              eisProfiles: [slot1.eisprofile, slot2.eisprofile],
              docdata: [
                { id: slot1.docid, index: slot1.index },
                { id: slot2.docid, index: slot2.index },
              ],
              roleCount: 2
            });
            matchedFromRole1.add(i);
            matchedFromRole2.add(j);
          }
        }
      }

      for (let i = 0; i < roleSlot1.length; i++) {
        if (matchedFromRole1.has(i)) continue;
        const slot1 = roleSlot1[i];
        for (let k = 0; k < roleSlot3.length; k++) {
          if (matchedFromRole3.has(k)) continue;
          const slot3 = roleSlot3[k];
          if (
            this.datepipe.transform(slot1.slotstart, 'short') === this.datepipe.transform(slot3.slotstart, 'short') &&
            slot1.eisprofile !== slot3.eisprofile
          ) {
            const eisId1 = doc(this.firestore, slot1.eisprofile).id;
            const eisId3 = doc(this.firestore, slot3.eisprofile).id;
            mergedSlots.push({
              start: slot1.slotstart,
              end: slot1.slotend,
              specialist: (this.mapProfile[eisId1] || '') + ', ' + (this.mapProfile[eisId3] || ''),
              eisNames: [this.mapProfile[eisId1] || 'Unknown', this.mapProfile[eisId3] || 'Unknown'],
              appointmentTypeId: slot1.appointmentTypeId,
              availabilityDocIds: [slot1.availabilityDocId, slot3.availabilityDocId],
              eisProfiles: [slot1.eisprofile, slot3.eisprofile],
              docdata: [
                { id: slot1.docid, index: slot1.index },
                { id: slot3.docid, index: slot3.index },
              ],
              roleCount: 2
            });
            matchedFromRole1.add(i);
            matchedFromRole3.add(k);
          }
        }
      }

      for (let j = 0; j < roleSlot2.length; j++) {
        if (matchedFromRole2.has(j)) continue;
        const slot2 = roleSlot2[j];
        for (let k = 0; k < roleSlot3.length; k++) {
          if (matchedFromRole3.has(k)) continue;
          const slot3 = roleSlot3[k];
          if (
            this.datepipe.transform(slot2.slotstart, 'short') === this.datepipe.transform(slot3.slotstart, 'short') &&
            slot2.eisprofile !== slot3.eisprofile
          ) {
            const eisId2 = doc(this.firestore, slot2.eisprofile).id;
            const eisId3 = doc(this.firestore, slot3.eisprofile).id;
            mergedSlots.push({
              start: slot2.slotstart,
              end: slot2.slotend,
              specialist: (this.mapProfile[eisId2] || '') + ', ' + (this.mapProfile[eisId3] || ''),
              eisNames: [this.mapProfile[eisId2] || 'Unknown', this.mapProfile[eisId3] || 'Unknown'],
              appointmentTypeId: slot2.appointmentTypeId,
              availabilityDocIds: [slot2.availabilityDocId, slot3.availabilityDocId],
              eisProfiles: [slot2.eisprofile, slot3.eisprofile],
              docdata: [
                { id: slot2.docid, index: slot2.index },
                { id: slot3.docid, index: slot3.index },
              ],
              roleCount: 2
            });
            matchedFromRole2.add(j);
            matchedFromRole3.add(k);
          }
        }
      }

      for (let i = 0; i < roleSlot1.length; i++) {
        if (!matchedFromRole1.has(i)) {
          const slot1 = roleSlot1[i];
          const eisId = doc(this.firestore, slot1.eisprofile).id;
          mergedSlots.push({
            start: slot1.slotstart,
            end: slot1.slotend,
            specialist: this.mapProfile[eisId] || 'Specialist',
            appointmentTypeId: slot1.appointmentTypeId,
            availabilityDocIds: [slot1.availabilityDocId],
            eisProfiles: [slot1.eisprofile],
            eisNames: [this.mapProfile[eisId] || 'Unknown'],
            docdata: [{ id: slot1.docid, index: slot1.index }],
            roleCount: 1
          });
        }
      }

      for (let j = 0; j < roleSlot2.length; j++) {
        if (!matchedFromRole2.has(j)) {
          const slot2 = roleSlot2[j];
          const eisId = doc(this.firestore, slot2.eisprofile).id;
          mergedSlots.push({
            start: slot2.slotstart,
            end: slot2.slotend,
            specialist: this.mapProfile[eisId] || 'Specialist',
            appointmentTypeId: slot2.appointmentTypeId,
            availabilityDocIds: [slot2.availabilityDocId],
            eisProfiles: [slot2.eisprofile],
            eisNames: [this.mapProfile[eisId] || 'Unknown'],
            docdata: [{ id: slot2.docid, index: slot2.index }],
            roleCount: 1
          });
        }
      }

      for (let k = 0; k < roleSlot3.length; k++) {
        if (!matchedFromRole3.has(k)) {
          const slot3 = roleSlot3[k];
          const eisId = doc(this.firestore, slot3.eisprofile).id;
          mergedSlots.push({
            start: slot3.slotstart,
            end: slot3.slotend,
            specialist: this.mapProfile[eisId] || 'Specialist',
            appointmentTypeId: slot3.appointmentTypeId,
            availabilityDocIds: [slot3.availabilityDocId],
            eisProfiles: [slot3.eisprofile],
            eisNames: [this.mapProfile[eisId] || 'Unknown'],
            docdata: [{ id: slot3.docid, index: slot3.index }],
            roleCount: 1
          });
        }
      }
    }

    mergedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    return mergedSlots;
  }
}