import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { Firestore, getFirestore } from '@angular/fire/firestore';
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
   * Just FETCH the already-initialized instance — do NOT re-initialize it here.
   * The transport (experimentalForceLongPolling, to survive this network's
   * blocked WebChannel streaming) is configured once, at the earliest point, in
   * `main.ts`. Calling initializeFirestore() again with different options throws
   * "initializeFirestore() has already been called with different options"
   * (main.ts pre-initializes this named DB in the non-emulator/prod path).
   */
  readonly atcDb: Firestore = getFirestore(this.app, 'firestore-atc');

  /**
   * Named Firestore database `firestore-forms` — READ ONLY from the UI.
   * Participant form submissions (formsByClient) live here; the ATC ops screens
   * read them to tell whether a config-stage own source exists. Pre-initialized in
   * main.ts with the same long-polling transport; just fetch the instance here.
   */
  readonly formsDb: Firestore = getFirestore(this.app, 'firestore-forms');

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
