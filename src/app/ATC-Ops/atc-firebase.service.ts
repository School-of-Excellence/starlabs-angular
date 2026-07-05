import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { Firestore, initializeFirestore } from '@angular/fire/firestore';
import { Functions, getFunctions, httpsCallable } from '@angular/fire/functions';
import {
  RebuildOk,
  RebuildReq,
  RegenerateOk,
  RegenerateReq,
} from './atc-ops.types';

/**
 * Central Firebase access for the ATC ops screens.
 *
 * The app's default Firestore (token `Firestore`, DB id `firestore`) is left
 * untouched — components inject that normally. This service adds the two extra
 * handles the ATC pipeline needs, WITHOUT repointing the default handle:
 *   - `atcDb`     → the NAMED database `firestore-atc` (queue_atc_generation lives here).
 *   - `functions` → callables region `us-central1`.
 *
 * These handles are constructed from the already-initialized FirebaseApp, so no
 * second app / re-initialization occurs.
 */
@Injectable({ providedIn: 'root' })
export class AtcFirebaseService {
  private readonly app = inject(FirebaseApp);

  /**
   * Named Firestore database `firestore-atc` — READ ONLY from the UI.
   *
   * Force long-polling: this network blocks Firestore's WebChannel streaming
   * (symptom: "WebChannelConnection RPC 'Listen' stream transport errored"),
   * so realtime listeners would otherwise fail the stream and only load after a
   * slow auto-detect fallback. Forcing long-polling skips the doomed streaming
   * attempt → fast, reliable first load. Must be the FIRST call that creates
   * this named-DB handle (this service is the only creator, constructed once).
   */
  readonly atcDb: Firestore = initializeFirestore(
    this.app,
    { experimentalForceLongPolling: true },
    'firestore-atc',
  );

  /** Callables region for the ATC pipeline (v2 onCall). */
  readonly functions: Functions = getFunctions(this.app, 'us-central1');

  /** regenerateAtcDoc({ docid }) — resolves sources / re-queues a dataincomplete doc. */
  readonly regenerateAtcDoc = httpsCallable<RegenerateReq, RegenerateOk>(
    this.functions,
    'regenerateAtcDoc',
  );

  /** rebuildAtcPrompt({ docid, requeue? }) — rebuilds the prompt (optionally re-runs inference). */
  readonly rebuildAtcPrompt = httpsCallable<RebuildReq, RebuildOk>(
    this.functions,
    'rebuildAtcPrompt',
  );
}
