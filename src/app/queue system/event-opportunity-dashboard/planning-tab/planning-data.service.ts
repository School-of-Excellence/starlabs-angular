import { Injectable } from '@angular/core';
import {
  Firestore, collection, query, where, getDocs, getDoc, doc, DocumentReference
} from '@angular/fire/firestore';

/**
 * Per-queue participation funnel for the Planning tab.
 *
 * Mirrors the canonical EPC funnel definition in
 * event-participation-confirmations/product-funnel.component.ts (loadData):
 *  - requested / approved come from 'event participation request' (+ 'arena e-ticket log')
 *  - "not requested" is the PRODUCT-OWNER cohort (participantsproduct, status null)
 *    minus anyone who requested or is in the approved cohort.
 *
 * The id sets are returned so the component can join them against queue_token
 * slot bookings to derive "slot booked / not booked from requested".
 */
export interface QueueFunnel {
  queueId: string;
  hasArena: boolean;
  arenaEventId: string | null;
  requestedIds: Set<string>;       // status 'requested' only (cohort removed)
  approvedIds: Set<string>;        // approved / attended / scanned cohort
  movingForwardIds: Set<string>;   // requestedIds union approvedIds
  requestedPlusApproved: number;   // movingForwardIds.size
  notRequested: number;
  potential: number;               // product owners
  loadError: boolean;
}

/** One eligible participant in a queue's uP! cohort, with the segment inputs. */
export interface PlanningParticipant {
  profileId: string;
  confirmed: boolean;   // uP! confirmation: approved / attended / scanned e-ticket
  requested: boolean;   // requested but not yet confirmed
  active: boolean;      // customer status === 'active'
}

export interface PlanningRoster {
  queueId: string;
  hasArena: boolean;
  participants: PlanningParticipant[]; // the cohort (requested + confirmed)
  potential: number;                   // product owners not in the cohort
  loadError: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlanningDataService {

  constructor(private firestore: Firestore) {}

  private emptyFunnel(queueId: string, loadError = false): QueueFunnel {
    return {
      queueId, hasArena: false, arenaEventId: null,
      requestedIds: new Set<string>(), approvedIds: new Set<string>(), movingForwardIds: new Set<string>(),
      requestedPlusApproved: 0, notRequested: 0, potential: 0, loadError
    };
  }

  async loadQueueFunnel(queueId: string, queueRef: DocumentReference): Promise<QueueFunnel> {
    try {
      // 1. Resolve the arena for this queue (one arena per queue).
      const arenaSnap = await getDocs(query(
        collection(this.firestore, 'arena events'),
        where('type', '==', 'queue'),
        where('eventref', '==', queueRef)
      ));
      if (arenaSnap.empty) return this.emptyFunnel(queueId);

      const arena: any = arenaSnap.docs[0].data();
      const arenaEventId: string = arena['docid'] || arenaSnap.docs[0].id;
      const productRef = arena['productref'];
      const eventRef = arena['eventref'];

      // 2. Participation requests + scanned e-tickets.
      const [eprSnap, scanSnap] = await Promise.all([
        getDocs(query(
          collection(this.firestore, 'event participation request'),
          where('arenaeventid', '==', arenaEventId),
          where('status', 'in', ['requested', 'approved', 'attended'])
        )),
        getDocs(query(
          collection(this.firestore, 'arena e-ticket log'),
          where('eventref', '==', eventRef)
        ))
      ]);

      const requestedIds = new Set<string>();
      const approvedIds = new Set<string>();
      eprSnap.docs.forEach(d => {
        const x: any = d.data();
        const pid = x['profileid'];
        if (!pid) return;
        if (x['status'] === 'approved' || x['status'] === 'attended') approvedIds.add(pid);
        else if (x['status'] === 'requested') requestedIds.add(pid);
      });
      scanSnap.docs.forEach(d => {
        const x: any = d.data();
        if (x['profileid']) approvedIds.add(x['profileid']);
      });
      // Approved cohort is not "requested" (matches product-funnel: cohort removed from requested).
      approvedIds.forEach(p => requestedIds.delete(p));

      const movingForwardIds = new Set<string>([...requestedIds, ...approvedIds]);

      // 3. "Not requested" — rollup-first (event_stats), product-owner scan fallback.
      let potential = 0;
      let notRequested = 0;
      const statsSnap = await getDoc(doc(this.firestore, 'event_stats', arenaEventId));
      const stats: any = statsSnap.exists() ? statsSnap.data() : null;
      if (stats && stats['notRequested'] != null) {
        notRequested = stats['notRequested'] ?? 0;
        potential = stats['potential'] ?? 0;
      } else if (productRef) {
        const ownSnap = await getDocs(query(
          collection(this.firestore, 'participantsproduct'),
          where('productref', '==', productRef),
          where('status', '==', null)
        ));
        const owners = new Set<string>();
        ownSnap.docs.forEach(d => {
          const x: any = d.data();
          if (x['profileid']) owners.add(x['profileid']);
        });
        potential = owners.size;
        notRequested = [...owners].filter(o => !requestedIds.has(o) && !approvedIds.has(o)).length;
      }

      return {
        queueId, hasArena: true, arenaEventId,
        requestedIds, approvedIds, movingForwardIds,
        requestedPlusApproved: movingForwardIds.size,
        notRequested, potential, loadError: false
      };
    } catch (err) {
      console.error('Planning funnel load failed for queue', queueId, err);
      return this.emptyFunnel(queueId, true);
    }
  }

  /**
   * Builds the per-participant cohort for a queue, enriched with confirmation and
   * customer-status, plus the "potential" count (product owners not in cohort).
   * Slot booking and stage completion are joined in the component from the
   * already-streamed queue_token / live-assignment data.
   */
  async loadParticipants(queueId: string, queueRef: DocumentReference): Promise<PlanningRoster> {
    const empty: PlanningRoster = { queueId, hasArena: false, participants: [], potential: 0, loadError: false };
    try {
      const arenaSnap = await getDocs(query(
        collection(this.firestore, 'arena events'),
        where('type', '==', 'queue'),
        where('eventref', '==', queueRef)
      ));
      if (arenaSnap.empty) return empty;
      const arena: any = arenaSnap.docs[0].data();
      const arenaEventId: string = arena['docid'] || arenaSnap.docs[0].id;
      const productRef = arena['productref'];
      const eventRef = arena['eventref'];

      const [eprSnap, scanSnap] = await Promise.all([
        getDocs(query(
          collection(this.firestore, 'event participation request'),
          where('arenaeventid', '==', arenaEventId),
          where('status', 'in', ['requested', 'approved', 'attended'])
        )),
        getDocs(query(collection(this.firestore, 'arena e-ticket log'), where('eventref', '==', eventRef)))
      ]);

      const approvedIds = new Set<string>();
      const requestedIds = new Set<string>();
      eprSnap.docs.forEach(d => {
        const x: any = d.data();
        const pid = x['profileid'];
        if (!pid) return;
        if (x['status'] === 'approved' || x['status'] === 'attended') approvedIds.add(pid);
        else if (x['status'] === 'requested') requestedIds.add(pid);
      });
      scanSnap.docs.forEach(d => { const x: any = d.data(); if (x['profileid']) approvedIds.add(x['profileid']); });
      approvedIds.forEach(p => requestedIds.delete(p));
      const cohort = [...new Set<string>([...approvedIds, ...requestedIds])];

      // Potential = product owners not engaged in the cohort.
      let potential = 0;
      if (productRef) {
        const ownSnap = await getDocs(query(
          collection(this.firestore, 'participantsproduct'),
          where('productref', '==', productRef),
          where('status', '==', null)
        ));
        const cohortSet = new Set(cohort);
        const owners = new Set<string>();
        ownSnap.docs.forEach(d => { const x: any = d.data(); if (x['profileid']) owners.add(x['profileid']); });
        potential = [...owners].filter(o => !cohortSet.has(o)).length;
      }

      // Customer status for the cohort (active vs non-active).
      const activeMap = new Map<string, boolean>();
      for (let i = 0; i < cohort.length; i += 30) {
        const chunk = cohort.slice(i, i + 30);
        try {
          const snap = await getDocs(query(
            collection(this.firestore, 'participant metadata'),
            where('profileid', 'in', chunk)
          ));
          snap.docs.forEach(d => {
            const x: any = d.data();
            if (x['profileid']) activeMap.set(x['profileid'], String(x['customerstatus'] || '').toLowerCase() === 'active');
          });
        } catch (e) { /* tolerate a failed chunk */ }
      }

      const participants: PlanningParticipant[] = cohort.map(pid => ({
        profileId: pid,
        confirmed: approvedIds.has(pid),
        requested: requestedIds.has(pid),
        active: activeMap.get(pid) === true
      }));

      return { queueId, hasArena: true, participants, potential, loadError: false };
    } catch (err) {
      console.error('Planning roster load failed for queue', queueId, err);
      return { ...empty, loadError: true };
    }
  }
}
