import { Injectable } from '@angular/core';
import { collection, doc, Firestore, runTransaction, Timestamp } from '@angular/fire/firestore';

/**
 * EI Solution Review log (plan specs/plans/2026-10-24-review-log.md).
 *
 * Internal notes kept ON the ATC doc (atc_alpha / atc_to_validate) as `reviewlog: AtcReview[]`. Add only — a delete is
 * soft (isdelete + who/when); an undelete brings it back and clears those fields. Shared by View Prescribed and Edit ATC so both apply the same rules.
 * Every write is a transaction that first re-reads the ATC: a retired version (edited into a new version, or deleted)
 * is refused, so a review can never land on a version nobody sees any more.
 */
export interface AtcReview {
  id: string
  note: string
  createdby: string            // profile id
  createdon: any               // Timestamp (client time — Firestore can't stamp server time inside an array)
  isdelete: boolean
  deletedby?: string | null
  deletedon?: any
}

export type ReviewWriteResult = 'ok' | 'empty' | 'retired' | 'missing'

@Injectable({ providedIn: 'root' })
export class AtcReviewLogService {

  /** The Review log exists for EI Solution ATCs only (same name rule as Ask). */
  isEISolution(product: any): boolean {
    return (product ?? "").toString().toLowerCase() == "ei solution"
  }

  /** Edited into a new version, or deleted. */
  isRetired(atcData: any): boolean {
    return atcData == null || atcData["isdelete"] === true || atcData["status"] == "upgraded" || atcData["upgradedto"] != null
  }

  /** Active reviews (not deleted). */
  activeCount(reviewlog: any): number {
    return (Array.isArray(reviewlog) ? reviewlog : []).filter(r => r?.isdelete !== true).length
  }

  /** Newest first; deleted ones only when asked for. */
  rows(reviewlog: any, showDeleted: boolean): AtcReview[] {
    var list: AtcReview[] = Array.isArray(reviewlog) ? reviewlog : []
    return list
      .filter(r => showDeleted || r?.isdelete !== true)
      .slice()
      .sort((a, b) => this.millis(b?.createdon) - this.millis(a?.createdon))
  }

  millis(value: any): number {
    if (!value) return 0
    if (typeof value.toMillis == "function") return value.toMillis()
    if (typeof value.seconds == "number") return value.seconds * 1000
    var d = new Date(value)
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }

  toDate(value: any): Date | null {
    var ms = this.millis(value)
    return ms ? new Date(ms) : null
  }

  async add(firestoreATC: Firestore, atcPath: string, note: string, profileid: string): Promise<ReviewWriteResult> {
    var text = (note ?? "").trim()
    if (text.length == 0) return 'empty'
    var ref = doc(firestoreATC, atcPath)
    var entry: AtcReview = {
      id: doc(collection(firestoreATC, "atc_alpha")).id,
      note: text,
      createdby: profileid,
      createdon: Timestamp.now(),
      isdelete: false,
      deletedby: null,
      deletedon: null,
    }
    return runTransaction(firestoreATC, async tx => {
      var snap = await tx.get(ref)
      if (!snap.exists()) return 'missing' as ReviewWriteResult
      var data = snap.data()
      if (this.isRetired(data)) return 'retired' as ReviewWriteResult
      var log = Array.isArray(data["reviewlog"]) ? data["reviewlog"] : []
      tx.update(ref, { reviewlog: [...log, entry] })
      return 'ok' as ReviewWriteResult
    })
  }

  async softDelete(firestoreATC: Firestore, atcPath: string, reviewId: string, profileid: string): Promise<ReviewWriteResult> {
    var ref = doc(firestoreATC, atcPath)
    return runTransaction(firestoreATC, async tx => {
      var snap = await tx.get(ref)
      if (!snap.exists()) return 'missing' as ReviewWriteResult
      var data = snap.data()
      if (this.isRetired(data)) return 'retired' as ReviewWriteResult
      var log: AtcReview[] = Array.isArray(data["reviewlog"]) ? data["reviewlog"] : []
      if (!log.some(r => r?.id == reviewId)) return 'missing' as ReviewWriteResult
      tx.update(ref, {
        reviewlog: log.map(r => r?.id == reviewId && r.isdelete !== true
          ? { ...r, isdelete: true, deletedby: profileid, deletedon: Timestamp.now() }
          : r)
      })
      return 'ok' as ReviewWriteResult
    })
  }

  /** Undelete (operator 2026-10-25): back in the log, no confirmation, no audit trail — the delete fields are cleared. */
  async restore(firestoreATC: Firestore, atcPath: string, reviewId: string): Promise<ReviewWriteResult> {
    var ref = doc(firestoreATC, atcPath)
    return runTransaction(firestoreATC, async tx => {
      var snap = await tx.get(ref)
      if (!snap.exists()) return 'missing' as ReviewWriteResult
      var data = snap.data()
      if (this.isRetired(data)) return 'retired' as ReviewWriteResult
      var log: AtcReview[] = Array.isArray(data["reviewlog"]) ? data["reviewlog"] : []
      if (!log.some(r => r?.id == reviewId)) return 'missing' as ReviewWriteResult
      tx.update(ref, {
        reviewlog: log.map(r => r?.id == reviewId && r.isdelete === true
          ? { ...r, isdelete: false, deletedby: null, deletedon: null }
          : r)
      })
      return 'ok' as ReviewWriteResult
    })
  }
}
