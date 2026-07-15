// appointment-booking.service.ts
import { Injectable } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import {
    Firestore, doc, collection, getDoc, arrayUnion, where, query, getDocs,
    writeBatch, serverTimestamp, updateDoc
} from '@angular/fire/firestore';
import { LoadingProgressComponent } from './loading-progress/loading-progress.component';

@Injectable({ providedIn: 'root' })
export class AppointmentBookingService {

    constructor(
        private firestore: Firestore,
        private datepipe: DatePipe,
        private matDialog: MatDialog
    ) { }

    async onDateSelect(ctx: {
        mindate: string,
        selectedDate: Date,
        superRole: boolean,
        appointmentRoles: string[],
        rolePersons: { [role: string]: string[] },
        selectedAppointment: any,
        selectedUserProfileMap: any
    }): Promise<any[]> {
        var minimumDate = new Date(new Date(ctx.mindate).setHours(0, 0, 0));
        if (!(ctx.selectedDate >= minimumDate)) return [];

        this.matDialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Getting Your Slots..." } });
        var startDate: Date, endDate: Date;
        if (ctx.superRole) {
            startDate = ctx.selectedDate;
        } else {
            var currentDateTime = new Date();
            var selectedDateTime = new Date(new Date(ctx.selectedDate).setHours(new Date().getHours(), new Date().getMinutes(), 0));
            var hours = Math.floor(Math.abs(selectedDateTime.getTime() - currentDateTime.getTime()) / 1000 / 3600);
            startDate = hours > 24 ? ctx.selectedDate : selectedDateTime;
        }
        endDate = new Date(new Date(startDate).setHours(23, 59, 59));

        var slotsOfEIS = [];
        for (const roleOfAppointment of ctx.appointmentRoles) {
            for (const eisProfile of ctx.rolePersons[roleOfAppointment]) {
                var availabilityCollection = collection(this.firestore, "availability");
                var availabilityQuery = query(
                    availabilityCollection,
                    where("profileref", "==", doc(this.firestore, eisProfile)),
                    where("appointments", "array-contains", doc(this.firestore, "appointmenttype/" + ctx.selectedAppointment.id)),
                    where("starttime", ">=", startDate),
                    where("starttime", "<=", endDate)
                );
                const availabilty = await getDocs(availabilityQuery);
                availabilty.forEach(slots => {
                    var localSlot = slots.data()[ctx.selectedAppointment.id];
                    if (localSlot != undefined && localSlot != null && localSlot.length != 0) {
                        for (let a = 0; a < localSlot.length; a++) {
                            var data = localSlot[a];
                            if (data.booked == false && data.available == true) {
                                slotsOfEIS.push({
                                    slotstart: data.slotstart.toDate(),
                                    slotend: data.slotend.toDate(),
                                    docid: slots.id,
                                    index: a,
                                    eisprofile: eisProfile,
                                    appointmentrole: roleOfAppointment
                                });
                            }
                        }
                    }
                });
            }
        }
        slotsOfEIS.sort((a, b) => a.slotstart - b.slotstart);

        var slotByRoles = [];
        for (const role of ctx.appointmentRoles) {
            var data = {};
            var totalEIS = slotsOfEIS.filter(e => e.appointmentrole == role);
            if (totalEIS.length != 0) {
                data[role] = totalEIS;
                slotByRoles.push(data);
            }
        }

        this.matDialog.closeAll();

        if (slotByRoles.length != ctx.appointmentRoles.length) {
            alert("EIS Slots not available for the selected date. Try again!");
            return [];
        }
        return this.mergeEISslots(slotByRoles, ctx.appointmentRoles, ctx.selectedUserProfileMap);
    }

    mergeEISslots(slots: Array<any>, appointmentRoles: string[], mapProfile: any): any[] {
        var mergedSlots = [];
        if (slots.length == 0) {
            alert("No slots available");
            return mergedSlots;
        }

        const getName = (path: string) => mapProfile[doc(this.firestore, path).id];

        if (slots.length == 1) {
            var roleSlot1 = slots[0][appointmentRoles[0]];
            for (const slot1 of roleSlot1) {
                mergedSlots.push({
                    start: slot1.slotstart,
                    end: slot1.slotend,
                    specialist: getName(slot1.eisprofile),
                    docdata: [{ id: slot1.docid, index: slot1.index }],
                });
            }
        } else if (slots.length == 2) {
            var roleSlot1 = slots[0][appointmentRoles[0]];
            var roleSlot2 = slots[1][appointmentRoles[1]];
            for (const slot1 of roleSlot1) {
                for (const slot2 of roleSlot2) {
                    if (this.datepipe.transform(slot1.slotstart, "short") == this.datepipe.transform(slot2.slotstart, "short") && slot1.eisprofile != slot2.eisprofile) {
                        mergedSlots.push({
                            start: slot1.slotstart,
                            end: slot1.slotend,
                            specialist: getName(slot1.eisprofile) + ", " + getName(slot2.eisprofile),
                            docdata: [
                                { id: slot1.docid, index: slot1.index },
                                { id: slot2.docid, index: slot2.index },
                            ],
                        });
                    }
                }
            }
        } else if (slots.length == 3) {
            var roleSlot1 = slots[0][appointmentRoles[0]];
            var roleSlot2 = slots[1][appointmentRoles[1]];
            var roleSlot3 = slots[2][appointmentRoles[2]];
            for (const slot1 of roleSlot1) {
                for (const slot2 of roleSlot2) {
                    for (const slot3 of roleSlot3) {
                        if (
                            this.datepipe.transform(slot1.slotstart, "short") == this.datepipe.transform(slot2.slotstart, "short") &&
                            this.datepipe.transform(slot2.slotstart, "short") == this.datepipe.transform(slot3.slotstart, "short") &&
                            this.datepipe.transform(slot3.slotstart, "short") == this.datepipe.transform(slot1.slotstart, "short") &&
                            slot1.eisprofile != slot2.eisprofile && slot2.eisprofile != slot3.eisprofile && slot3.eisprofile != slot1.eisprofile
                        ) {
                            mergedSlots.push({
                                start: slot1.slotstart,
                                end: slot1.slotend,
                                specialist: getName(slot1.eisprofile) + ", " + getName(slot2.eisprofile) + ", " + getName(slot3.eisprofile),
                                docdata: [
                                    { id: slot1.docid, index: slot1.index },
                                    { id: slot2.docid, index: slot2.index },
                                    { id: slot3.docid, index: slot3.index },
                                ],
                            });
                        }
                    }
                }
            }
        }

        if (mergedSlots.length == 0) {
            alert("No Slots available on the selected date");
        }
        return mergedSlots;
    }

    async confirmSlot(ctx: {
        userAvailableSlots: any[],
        selectedSlotIndex: number,
        appointmentRoles: string[],
        rolePersons: { [role: string]: string[] },
        selectedAppointment: any,
        selectedUser: string,
        loggedinPID: string
    }): Promise<boolean> {
        var batch = writeBatch(this.firestore);
        var selectedSlot = ctx.userAvailableSlots[ctx.selectedSlotIndex];
        if (!selectedSlot) {
            alert("Select a Slot to Book!");
            return false;
        }

        var selectedDate = this.datepipe.transform(selectedSlot.start, "fullDate");
        var starttime = this.datepipe.transform(selectedSlot.start, "shortTime");

        var requiredRoles = ctx.appointmentRoles.map(r => doc(this.firestore, r));
        var hosts = [];
        var hostRole: any = {};
        var mapSelectedSlot: any = {};

        if (!confirm("Confirm your appointment on " + selectedDate + " at " + starttime)) {
            return false;
        }

        this.matDialog.open(LoadingProgressComponent, { disableClose: true, data: { type: "spinner", msg: "Booking Your Slots..." } });

        var availablility = [];
        for (const slotDoc of selectedSlot.docdata) {
            var availabilityDoc = doc(this.firestore, "availability/" + slotDoc.id);
            const available = await getDoc(availabilityDoc);
            var availableData = available.data();
            mapSelectedSlot[available.id] = availableData;
            if (availableData[ctx.selectedAppointment.id] != null) {
                hosts.push(availableData['profileref']['path']);
                availablility.push(
                    availableData[ctx.selectedAppointment.id][slotDoc.index].booked == false &&
                    availableData[ctx.selectedAppointment.id][slotDoc.index].available == true
                );
            }
        }
        console.log("availability done")

        if (availablility.includes(false)) {
            alert("Oop! The selected slot is no longer available. Try again");
            this.matDialog.closeAll();
            return false;
        }

        for (const role of ctx.appointmentRoles) {
            for (const host of hosts) {
                if (ctx.rolePersons[role].includes(host)) {
                    if (hostRole[role] == undefined) hostRole[role] = [];
                    if (!hostRole[role].includes(host)) hostRole[role].push(host);
                }
            }
        }

        var selectedAppointmentId = ctx.selectedAppointment.id;
        for (const slotDoc of selectedSlot.docdata) {
            var chosenAppointment = mapSelectedSlot[slotDoc.id];
            for (const chosenelement of chosenAppointment["appointments"]) {
                var computedSlots = chosenAppointment[chosenelement.id];
                if (computedSlots != null) {
                    for (let k = 0; k < computedSlots.length; k++) {
                        const slotelement = computedSlots[k];
                        var slotStart: any = new Date(slotelement.slotstart.toDate());
                        var slotEnd: any = new Date(slotelement.slotend.toDate());
                        if (
                            (slotStart >= selectedSlot.start && slotStart < selectedSlot.end) ||
                            (slotEnd > selectedSlot.start && slotEnd < selectedSlot.end) ||
                            (selectedSlot.start >= slotStart && selectedSlot.start < slotEnd)
                        ) {
                            if (!slotelement.booked) slotelement.available = false;
                            if (
                                chosenelement.id == selectedAppointmentId && slotDoc.index == k &&
                                this.datepipe.transform(slotStart, "short") == this.datepipe.transform(selectedSlot.start, "short") &&
                                this.datepipe.transform(slotEnd, "short") == this.datepipe.transform(selectedSlot.end, "short")
                            ) {
                                slotelement.booked = true;
                            }
                        }
                    }
                }
            }
            var availabilityDoc = doc(this.firestore, "availability/" + slotDoc.id);
            batch.update(availabilityDoc, chosenAppointment);
        }

        var hostRef = hosts.map(h => doc(this.firestore, h));
        for (const role of ctx.appointmentRoles) {
            hostRole[role] = (hostRole[role] || []).map(p => doc(this.firestore, p));
        }

        var docid = doc(collection(this.firestore, "appointments")).id;
        var appointmentDoc = doc(this.firestore, "appointments/" + docid);
        var appointmentData = {
            docid: docid,
            starttime: selectedSlot.start,
            endtime: selectedSlot.end,
            appointment: doc(this.firestore, "appointmenttype/" + ctx.selectedAppointment.id),
            appointmentrole: requiredRoles,
            bookedby: doc(this.firestore, "profile_data/" + ctx.selectedUser),
            hosts: hostRef,
            hostRole,
            slotdata: selectedSlot.docdata,
            attended: false,
            cancelled: false,
            created: serverTimestamp(),
            loggedid: ctx.loggedinPID,
            productid: ctx.selectedAppointment.productid,
        };
        console.log("appointments done", appointmentData);
        batch.set(appointmentDoc, appointmentData);

        try {
            await batch.commit();
            await this.createJourneyRecord(ctx.selectedAppointment, appointmentDoc.path);
            this.matDialog.closeAll();
            return true;
        } catch (err) {
            this.matDialog.closeAll();
            console.log(err);
            return false;
        }
    }

    async createJourneyRecord(selectedAppointment: any, apptPath: string) {
        console.log("journey record");
        var productstatus = null;
        var deliverySequence = [];
        for (const product of selectedAppointment.participantdelivery.products) {
            for (const delivery of product.delivery) {
                if (delivery.sequenceref.path == selectedAppointment.deliverypath) {
                    productstatus = product.status ?? "ongoing";
                    delivery.status = "ongoing";
                    var participantProductDoc = doc(this.firestore, "participantsproduct/" + product["participantproductid"]);
                    let updateData: any = {
                        status: productstatus,
                        [`statusdate.${productstatus}`]: serverTimestamp()
                    };
                    await updateDoc(participantProductDoc, updateData);
                }
            }
            deliverySequence.push({
                delivery: product.delivery,
                productref: product.productref,
                participantproductid: product.participantproductid
            });
        }
        var sequenecDoc = doc(this.firestore, "participantdeliverysequence/" + selectedAppointment.participantdelivery["profileid"]);
        await updateDoc(sequenecDoc, { products: deliverySequence });

        var deliveryDoc = doc(this.firestore, selectedAppointment.deliverypath);
        await updateDoc(deliveryDoc, {
            fileref: arrayUnion(doc(this.firestore, apptPath)),
            status: "ongoing"
        });
    }
}