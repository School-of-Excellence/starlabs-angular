// new_user_data for the workshop dashboard — read once, as its own request (2026-11-18).
//
// WHY Firestore Lite for this one read. new_user_data is a large, growing collection that the dashboard reads in
// full exactly once (never live). The full SDK sends every read, one-shot getDocs included, over ONE shared Listen
// channel: its forward requests go one at a time and every result streams back on the same response, so this
// whole-collection read sat in the same pipe as the dashboard's own live reads (workshop, enrolled, progress,
// metadata). Lite's getDocs is a plain REST runQuery request: it travels on its own, never queues the live reads,
// and keeps no listener or cache behind it — the right shape for a one-time bulk read. It is also the one request
// the e2e hub can hold on its own to prove the dashboard paints while it is out (workshop-dashboard-new-users-panel
// WNU-03/04); holding a Listen request instead stalls every later read on the page.
//
// Same app, same signed-in user, same security rules as the full SDK: Lite takes the auth token from the app the
// dashboard already uses. Emulator builds point it at the local emulator, exactly as main.ts does for the full SDK.
// Read-only. Not a component (no hooks), so the readiness gate does not ask this file for any.
import type { FirebaseApp } from 'firebase/app';
import { Firestore, collection, connectFirestoreEmulator, getDocs, getFirestore } from 'firebase/firestore/lite';
import { environment } from '../../../environments/environment';

/** Lite instances already pointed at the emulator (connecting twice throws). */
const emulatorConnected = new WeakSet<Firestore>();

function newUserDb(app: FirebaseApp): Firestore {
  const db = getFirestore(app);
  const env = environment as any;
  const emu = env?.useEmulators ? env?.emulators?.firestore : null;
  if (emu && !emulatorConnected.has(db)) {
    connectFirestoreEmulator(db, emu.host, emu.port);
    emulatorConnected.add(db);
  }
  return db;
}

/** Every new_user_data doc by id, each with its `id`. Throws when the read fails; the caller decides what that shows. */
export async function readNewUserData(app: FirebaseApp): Promise<Record<string, any>> {
  const snap = await getDocs(collection(newUserDb(app), 'new_user_data'));
  const byId: Record<string, any> = {};
  snap.forEach(d => {
    const data: any = d.data();
    data['id'] = d.id;
    byId[d.id] = data;
  });
  return byId;
}
