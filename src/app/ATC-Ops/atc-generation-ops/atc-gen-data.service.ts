import { Injectable } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  Firestore,
  getDocs,
  limit,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import { AuthguardService } from '../../authguard.service';
import { AtcFirebaseService } from '../atc-firebase.service';
import { AtcGenDoc, OpsNote, PodWorker, RebuildOk, RegenerateOk } from '../atc-ops.types';
import { toMillis } from '../ist-time.util';

export interface QueueOption {
  id: string;
  name: string;
  date: number | null;
  atcStages: string[]; // stages in this queue with generateatc === true
}

export interface QueueProbe {
  total: number; // sample size read (capped)
  sampleQueuerefPath: string | null;
  builtRefPath: string; // the ref path we query by, for comparison
  readable: boolean; // false if the read threw (rules / DB missing)
  errorCode?: string;
}

export interface DocLite {
  id: string;
  data: AtcGenDoc;
}

/**
 * All Firestore / callable access for the ATC generation ops screen lives here,
 * so the component holds no direct SDK calls. This also makes the component
 * screenshot-testable: a preview route can swap in a mock subclass via
 * component-level `providers`.
 */
@Injectable({ providedIn: 'root' })
export class AtcGenDataService {
  constructor(
    private svc: AtcFirebaseService,
    private firestore: Firestore, // default DB
    private guard: AuthguardService,
  ) {}

  /** profileid → display name map (best-effort). */
  async getProfileMap(): Promise<Record<string, string>> {
    try {
      const d: any = await this.guard.getProfileMap();
      return d?.map ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Queues from the default DB, newest first — ONLY those whose
   * `atcrequiredstages` has at least one entry with `generateatc === true`
   * (i.e. queues that actually produce ATC generation docs).
   */
  async loadQueues(): Promise<QueueOption[]> {
    const snap = await getDocs(collection(this.firestore, 'queue generation'));
    return snap.docs
      .map((d) => {
        const data: any = d.data();
        const req: any[] = Array.isArray(data?.atcrequiredstages) ? data.atcrequiredstages : [];
        const atcStages = req
          .filter((s) => s?.generateatc === true)
          .map((s) => (s?.stage ?? '').toString())
          .filter(Boolean);
        return {
          id: d.id,
          name: (data?.queuename ?? d.id).toString(),
          date: toMillis(data?.queuestartdate ?? data?.queueenddate),
          atcStages,
        } as QueueOption;
      })
      .filter((q) => q.atcStages.length > 0)
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  }

  /**
   * Diagnostic: when a queue's queueref-filtered query returns 0 docs, read the
   * collection unfiltered (capped) to distinguish "named DB unreadable / empty"
   * from "queueref filter matched nothing", and surface a real queueref path to
   * compare against the ref we build.
   */
  async probeCollection(queueId: string): Promise<QueueProbe> {
    const builtRefPath = doc(this.svc.atcDb, 'queue generation', queueId).path;
    try {
      const snap = await getDocs(
        query(collection(this.svc.atcDb, 'queue_atc_generation'), limit(5)),
      );
      let sampleQueuerefPath: string | null = null;
      for (const d of snap.docs) {
        const ref: any = (d.data() as any)?.queueref;
        if (ref?.path) { sampleQueuerefPath = ref.path; break; }
      }
      return { total: snap.size, sampleQueuerefPath, builtRefPath, readable: true };
    } catch (e: any) {
      return { total: 0, sampleQueuerefPath: null, builtRefPath, readable: false, errorCode: e?.code };
    }
  }

  /**
   * Realtime listener for ALL queue_atc_generation docs of one queue (every
   * status). `queueref` is a DocumentReference (path "queue generation/{id}")
   * that MUST be built on the firestore-atc handle to match.
   */
  listenQueueDocs(
    queueId: string,
    onData: (docs: DocLite[]) => void,
    onError: (err: any) => void,
  ): () => void {
    const queueRef = doc(this.svc.atcDb, 'queue generation', queueId);
    const q = query(
      collection(this.svc.atcDb, 'queue_atc_generation'),
      where('queueref', '==', queueRef),
    );
    return onSnapshot(
      q,
      (snap) =>
        onData(snap.docs.map((d) => ({ id: d.id, data: d.data() as AtcGenDoc }))),
      onError,
    );
  }

  /**
   * Realtime listener for the pod worker (default DB `classify/pod_worker`).
   * Requeue actions are meaningless if the pod is HALTED/disabled — this gives
   * the screen that context.
   */
  subscribePod(
    onData: (pod: PodWorker | null) => void,
    onError: (err: any) => void,
  ): () => void {
    const ref = doc(this.firestore, 'classify', 'pod_worker');
    return onSnapshot(
      ref,
      (snap) => onData(snap.exists() ? (snap.data() as PodWorker) : null),
      onError,
    );
  }

  /** Realtime listener for a single doc (any status). */
  listenDoc(
    docid: string,
    onSnap: (exists: boolean, id: string, data: AtcGenDoc | null) => void,
    onError: (err: any) => void,
  ): () => void {
    const ref = doc(this.svc.atcDb, 'queue_atc_generation', docid);
    return onSnapshot(
      ref,
      (snap) =>
        onSnap(snap.exists(), snap.id, snap.exists() ? (snap.data() as AtcGenDoc) : null),
      onError,
    );
  }

  /** Direct write of an operator-authored prompt for a pending job. */
  async savePrompt(docid: string, prompt: string): Promise<void> {
    await updateDoc(doc(this.svc.atcDb, 'queue_atc_generation', docid), {
      prompt,
      promptUpdatedAt: new Date(),
    });
  }

  /**
   * Append an operator note to a doc (append-only log via arrayUnion). Attributed
   * to the signed-in operator. `Timestamp.now()` is used rather than
   * serverTimestamp() because Firestore forbids sentinel values inside arrays.
   */
  async addNote(docid: string, text: string): Promise<void> {
    const note: OpsNote = { text, at: Timestamp.now() };
    if (this.guard.email) note.author = this.guard.email;
    if (this.guard.uid) note.authorUid = this.guard.uid;
    await updateDoc(doc(this.svc.atcDb, 'queue_atc_generation', docid), {
      opsNotes: arrayUnion(note),
    });
  }

  regenerate(docid: string): Promise<{ data: RegenerateOk }> {
    return this.svc.regenerateAtcDoc({ docid });
  }

  rebuild(docid: string, requeue?: boolean): Promise<{ data: RebuildOk }> {
    return this.svc.rebuildAtcPrompt(requeue ? { docid, requeue } : { docid });
  }
}
