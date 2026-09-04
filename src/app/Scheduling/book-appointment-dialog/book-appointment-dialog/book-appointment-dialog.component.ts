import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import {
  arrayUnion, collection, doc, Firestore, getDoc, getDocs,
  limit, query, serverTimestamp, updateDoc, where, writeBatch
} from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';

export interface BookAppointmentDialogData {
  profileId: string;
  profileName: string;
  appointmentTypeId: string;
  appointmentTypeName: string;
}

@Component({
  selector: 'app-book-appointment-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule,
    MatChipsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule
  ],
  providers: [DatePipe],
  templateUrl: './book-appointment-dialog.component.html',
  styleUrl: './book-appointment-dialog.component.css'
})
export class BookAppointmentDialogComponent implements OnInit {

  mindate: string;
  loggedinPID: string;

  resolving = true;
  resolveError: string | null = null;

  selectedAppointment: any = null;   
  selectedDate: any = null;

  userAvailableSlots: any[] = [];
  selectedSlot: number;
  appointmentRoles: string[] = [];
  rolePersons: { [role: string]: string[] } = {};
  profileNames: { [path: string]: string } = {};

  constructor(
    private firestore: Firestore,
    private datepipe: DatePipe,
    private matDialog: MatDialog,
    public dialogRef: MatDialogRef<BookAppointmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BookAppointmentDialogData
  ) {
    this.mindate = datepipe.transform(new Date(), 'yyyy-MM-dd');
  }

  async ngOnInit() {
    await this.resolveAppointment();
  }

  private async resolveAppointment() {
    this.resolving = true;
    this.resolveError = null;

    const participantProductQuery = query(
      collection(this.firestore, 'participantsproduct'),
      where('profileid', '==', this.data.profileId),
      where('status', 'in', ['initiated', 'ongoing'])
    );
    const participantProducts = await getDocs(participantProductQuery);
    const activeParticipantProductIds = participantProducts.docs.map(d => d.id);

    const deliverableQuery = query(
      collection(this.firestore, 'deliverables'),
      where('profileid', '==', this.data.profileId),
      where('type', '==', 'appointment')
    );
    const deliverableDocs = await getDocs(deliverableQuery);
    const deliverableByPath: { [path: string]: any } = {};
    deliverableDocs.forEach(d => { deliverableByPath[d.ref.path] = d; });

    const sequenceDoc = doc(this.firestore, 'participantdeliverysequence/' + this.data.profileId);
    const sequenceSnap = await getDoc(sequenceDoc);

    if (!sequenceSnap.exists()) {
      this.resolveError = 'No delivery sequence found for this participant.';
      this.resolving = false;
      return;
    }

    const products = sequenceSnap.data()['products'].filter(
      (p: any) => activeParticipantProductIds.includes(p.participantproductid)
    );

    let matched: any = null;
    for (const product of products) {
      const readyAppointments = (product.delivery || []).filter(
        (d: any) => d.type === 'appointment' && (d.status === 'ready' || d.status == null)
      );
      for (const activity of readyAppointments) {
        const deliverable = deliverableByPath[activity.sequenceref.path];
        if (!deliverable) continue;
        const typeId = deliverable.data()['deliveryref'].id;
        if (typeId === this.data.appointmentTypeId) {
          matched = {
            id: typeId,
            deliverypath: deliverable.ref.path,
            participantdelivery: sequenceSnap.data(),
            status: activity.status,
            productid: product.productref.id
          };
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      this.resolveError = 'This appointment is no longer available to book for this participant.';
      this.resolving = false;
      return;
    }

    this.selectedAppointment = matched;
    await this.onAppointmentSelect();
    this.resolving = false;
  }
  async onAppointmentSelect() {
    this.appointmentRoles = [];
    const additionalRoles: string[] = [];
    this.rolePersons = {};

    const apptRoleQuery = query(
      collection(this.firestore, 'AppointmentType-To-Roles'),
      where('assigned_appttype_ref', '==', doc(this.firestore, 'appointmenttype/' + this.selectedAppointment.id)),
      limit(1)
    );
    const roleDocs = await getDocs(apptRoleQuery);
    roleDocs.forEach(d => {
      (d.data()['required_role'] ?? []).forEach((r: any) => this.appointmentRoles.push(r.path));
      (d.data()['additional_role'] ?? []).forEach((r: any) => additionalRoles.push(r.path));
    });

    const customerMapDoc = doc(this.firestore, 'customer_eismapping/' + this.data.profileId);
    const customerMapSnap = await getDoc(customerMapDoc);

    if (customerMapSnap.exists()) {
      const eisroles = customerMapSnap.data()['eisroles'] || {};
      for (const role of this.appointmentRoles) {
        if (eisroles[role] != null) {
          this.rolePersons[role] = eisroles[role].map((e: any) => e['path']);
        } else {
          await this.fetchAppointmentEIS(role);
        }
      }
      for (const role of additionalRoles) {
        if (eisroles[role] != null) {
          this.appointmentRoles.push(role);
          this.rolePersons[role] = eisroles[role].map((e: any) => e['path']);
        }
      }
    } else {
      for (const role of this.appointmentRoles) {
        await this.fetchAppointmentEIS(role);
      }
    }

    if (Object.keys(this.rolePersons).length === 0) {
      this.resolveError = 'No specialists are available for this appointment.';
    }
  }

  async fetchAppointmentEIS(role: string) {
    const eisRoleQuery = query(
      collection(this.firestore, 'Roles-To-EIS'),
      where('assigned_role_ref', '==', doc(this.firestore, role))
    );
    const eisRoleDocs = await getDocs(eisRoleQuery);
    const eisRef: string[] = [];
    eisRoleDocs.forEach(d => {
      (d.data()['assigned_eis'] || []).forEach((e: any) => {
        if (e.id !== this.data.profileId) eisRef.push(e.path);
      });
    });
    this.rolePersons[role] = eisRef;
  }

  async onDateSelect() {
  this.userAvailableSlots = [];
  this.selectedSlot = null;

  const startDate = new Date(this.selectedDate);
  const endDate = new Date(new Date(startDate).setHours(23, 59, 59));

  const loadingRef = this.matDialog.open(LoadingProgressComponent, {
    disableClose: true, data: { type: 'spinner', msg: 'Getting Available Slots...' }
  });

  try {
    const slotsOfEIS: any[] = [];
    for (const role of this.appointmentRoles) {
      for (const eisProfile of this.rolePersons[role] || []) {
        const availabilityQuery = query(
          collection(this.firestore, 'availability'),
          where('profileref', '==', doc(this.firestore, eisProfile)),
          where('appointments', 'array-contains', doc(this.firestore, 'appointmenttype/' + this.selectedAppointment.id)),
          where('starttime', '>=', startDate),
          where('starttime', '<=', endDate)
        );
        const availabilityDocs = await getDocs(availabilityQuery);

        availabilityDocs.forEach(slots => {
          const localSlot = slots.data()[this.selectedAppointment.id];
          if (!localSlot) return;
          localSlot.forEach((data: any, index: number) => {
            const isBookable = data.booked === false && data.available === true;
            if (isBookable) {
              slotsOfEIS.push({
                slotstart: data.slotstart.toDate(),
                slotend: data.slotend.toDate(),
                docid: slots.id,
                index,
                eisprofile: eisProfile,
                appointmentrole: role
              });
            }
          });
        });
      }
    }

    const slotsByRole: any[] = [];
    for (const role of this.appointmentRoles) {
      const roleSlots = slotsOfEIS.filter(s => s.appointmentrole === role);
      if (roleSlots.length !== 0) {
        slotsByRole.push({ [role]: roleSlots });
      }
    }

    const distinctProfiles = [...new Set(slotsOfEIS.map(s => s.eisprofile))];
    for (const profilePath of distinctProfiles) {
      if (this.profileNames[profilePath] != null) continue;
      const profileSnap = await getDoc(doc(this.firestore, profilePath));
      this.profileNames[profilePath] = profileSnap.exists() ? profileSnap.data()['name'] : profilePath.split('/').pop();
    }

    const allRolesHaveSlots = slotsByRole.length === this.appointmentRoles.length;
    if (!allRolesHaveSlots) {
      alert('EIS Slots not available for the selected date. Try again!');
    } else {
      this.mergeEISslots(slotsByRole);
    }
  } catch (err: any) {
    console.error('Error fetching available slots:', err);
    alert('Something went wrong while fetching available slots: ' + (err?.message || err));
  } finally {
    loadingRef.close();
  }
}

  mergeEISslots(slots: any[]) {
    const merged: any[] = [];
    if (slots.length === 1) {
      const roleSlots = slots[0][this.appointmentRoles[0]];
      for (const slot of roleSlots) {
        merged.push({
          start: slot.slotstart, end: slot.slotend,
          specialist: this.profileNames[slot.eisprofile],
          docdata: [{ id: slot.docid, index: slot.index }]
        });
      }
    } else if (slots.length === 2) {
      const [role1, role2] = this.appointmentRoles;
      for (const s1 of slots[0][role1]) {
        for (const s2 of slots[1][role2]) {
          const sameTime = this.datepipe.transform(s1.slotstart, 'short') === this.datepipe.transform(s2.slotstart, 'short');
          if (sameTime && s1.eisprofile !== s2.eisprofile) {
            merged.push({
              start: s1.slotstart, end: s1.slotend,
              specialist: `${this.profileNames[s1.eisprofile]}, ${this.profileNames[s2.eisprofile]}`,
              docdata: [{ id: s1.docid, index: s1.index }, { id: s2.docid, index: s2.index }]
            });
          }
        }
      }
    } else if (slots.length === 3) {
      const [role1, role2, role3] = this.appointmentRoles;
      for (const s1 of slots[0][role1]) {
        for (const s2 of slots[1][role2]) {
          for (const s3 of slots[2][role3]) {
            const t1 = this.datepipe.transform(s1.slotstart, 'short');
            const t2 = this.datepipe.transform(s2.slotstart, 'short');
            const t3 = this.datepipe.transform(s3.slotstart, 'short');
            const sameTime = t1 === t2 && t2 === t3;
            const distinctSpecialists = s1.eisprofile !== s2.eisprofile && s2.eisprofile !== s3.eisprofile && s3.eisprofile !== s1.eisprofile;
            if (sameTime && distinctSpecialists) {
              merged.push({
                start: s1.slotstart, end: s1.slotend,
                specialist: [s1, s2, s3].map(s => this.profileNames[s.eisprofile]).join(', '),
                docdata: [s1, s2, s3].map(s => ({ id: s.docid, index: s.index }))
              });
            }
          }
        }
      }
    }

    this.userAvailableSlots = merged;
    if (merged.length === 0) alert('No matching slots available on the selected date.');
  }

  async confirmSlot() {
    const selectedSlot = this.userAvailableSlots[this.selectedSlot];
    if (!selectedSlot) {
      alert('Select a slot to book!');
      return;
    }

    const selectedDateLabel = this.datepipe.transform(selectedSlot.start, 'fullDate');
    const startTimeLabel = this.datepipe.transform(selectedSlot.start, 'shortTime');
    if (!confirm(`Confirm appointment on ${selectedDateLabel} at ${startTimeLabel}?`)) return;

    this.matDialog.open(LoadingProgressComponent, {
      disableClose: true, data: { type: 'spinner', msg: 'Booking Appointment...' }
    });

    const batch = writeBatch(this.firestore);
    const hosts: string[] = [];
    const mapSelectedSlot: { [id: string]: any } = {};
    const availabilityChecks: boolean[] = [];

    for (const slotDoc of selectedSlot.docdata) {
      const availabilityDoc = doc(this.firestore, 'availability/' + slotDoc.id);
      const availableSnap = await getDoc(availabilityDoc);
      const availableData = availableSnap.data();
      mapSelectedSlot[availableSnap.id] = availableData;
      if (availableData[this.selectedAppointment.id] != null) {
        hosts.push(availableData['profileref']['path']);
        const slot = availableData[this.selectedAppointment.id][slotDoc.index];
        availabilityChecks.push(slot.booked === false && slot.available === true);
      }
    }

    if (availabilityChecks.includes(false)) {
      this.matDialog.closeAll();
      alert('The selected slot is no longer available. Try again.');
      return;
    }

    const hostRole: { [role: string]: any[] } = {};
    for (const role of this.appointmentRoles) {
      for (const host of hosts) {
        if ((this.rolePersons[role] || []).includes(host)) {
          hostRole[role] = hostRole[role] || [];
          if (!hostRole[role].includes(host)) hostRole[role].push(host);
        }
      }
    }

    for (const slotDoc of selectedSlot.docdata) {
      const chosenAppointment = mapSelectedSlot[slotDoc.id];
      for (const typeRef of chosenAppointment['appointments']) {
        const computedSlots = chosenAppointment[typeRef.id];
        if (!computedSlots) continue;
        computedSlots.forEach((slot: any, k: number) => {
          const slotStart = slot.slotstart.toDate();
          const slotEnd = slot.slotend.toDate();
          const overlaps = (slotStart >= selectedSlot.start && slotStart < selectedSlot.end)
            || (slotEnd > selectedSlot.start && slotEnd < selectedSlot.end)
            || (selectedSlot.start >= slotStart && selectedSlot.start < slotEnd);
          if (!overlaps) return;
          if (!slot.booked) slot.available = false;
          if (typeRef.id === this.selectedAppointment.id && slotDoc.index === k) slot.booked = true;
        });
      }
      batch.update(doc(this.firestore, 'availability/' + slotDoc.id), chosenAppointment);
    }

    const hostRef = hosts.map(h => doc(this.firestore, h));
    for (const role of this.appointmentRoles) {
      hostRole[role] = (hostRole[role] || []).map(h => doc(this.firestore, h));
    }

    const docid = doc(collection(this.firestore, 'appointments')).id;
    const appointmentDoc = doc(this.firestore, 'appointments/' + docid);
    batch.set(appointmentDoc, {
      docid,
      starttime: selectedSlot.start,
      endtime: selectedSlot.end,
      appointment: doc(this.firestore, 'appointmenttype/' + this.selectedAppointment.id),
      appointmentrole: this.appointmentRoles.map(r => doc(this.firestore, r)),
      bookedby: doc(this.firestore, 'profile_data/' + this.data.profileId),
      hosts: hostRef,
      hostRole,
      slotdata: selectedSlot.docdata,
      attended: false,
      cancelled: false,
      created: serverTimestamp(),
      productid: this.selectedAppointment.productid
    });

    try {
      await batch.commit();
      await this.createJourneyRecord(appointmentDoc.path);
      this.matDialog.closeAll();
      alert('Appointment booked successfully.');
      this.dialogRef.close(true);
    } catch (err) {
      this.matDialog.closeAll();
      console.error(err);
      alert('Booking failed. Please try again.');
    }
  }

  async createJourneyRecord(apptPath: string) {
    let productstatus = null;
    const deliverySequence: any[] = [];
    for (const product of this.selectedAppointment.participantdelivery.products) {
      for (const delivery of product.delivery) {
        if (delivery.sequenceref.path === this.selectedAppointment.deliverypath) {
          productstatus = product.status ?? 'ongoing';
          delivery.status = 'ongoing';
          await updateDoc(
            doc(this.firestore, 'participantsproduct/' + product['participantproductid']),
            { status: productstatus }
          );
        }
      }
      deliverySequence.push({
        delivery: product.delivery,
        productref: product.productref,
        participantproductid: product.participantproductid
      });
    }
    await updateDoc(
      doc(this.firestore, 'participantdeliverysequence/' + this.selectedAppointment.participantdelivery['profileid']),
      { products: deliverySequence }
    );
    await updateDoc(doc(this.firestore, this.selectedAppointment.deliverypath), {
      fileref: arrayUnion(doc(this.firestore, apptPath)),
      status: 'ongoing'
    });
  }

  close() {
    this.dialogRef.close(false);
  }
}