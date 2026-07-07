import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { initializeFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { getAuth, connectAuthEmulator } from '@angular/fire/auth';
import { getStorage, connectStorageEmulator } from '@angular/fire/storage';
import { initializeApp } from '@angular/fire/app';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

const app = initializeApp(environment.firebase);

// HERMETIC EMULATOR WIRING (no-op unless environment.useEmulators === true — the `emulator` build configuration /
// environment.emulator.ts injected by the e2e repo's ci/overlay). In emulator mode we DELIBERATELY skip the
// offline persistent cache (a clean, deterministic Firestore per test run) and connect the default app's
// Firestore/Auth/Storage to the local emulator BEFORE bootstrap, so the AngularFire providers in app.config.ts
// (getFirestore()/getAuth()/getStorage() with no args) reuse these already-connected instances. Cloud/dev/prod
// builds keep the durable multi-tab offline persistence below and are completely unaffected.
// See starlabs-e2e-tests/scripts/deploy-cf-emulator.sh + ci/overlay/environment.emulator.ts.
const emuEnv = environment as any;
if (emuEnv.useEmulators && emuEnv.emulators) {
  const e = emuEnv.emulators;
  const firestore = getFirestore(app);
  if (e.firestore) connectFirestoreEmulator(firestore, e.firestore.host, e.firestore.port);
  if (e.auth) connectAuthEmulator(getAuth(app), e.auth.url, { disableWarnings: true });
  if (e.storage) connectStorageEmulator(getStorage(app), e.storage.host, e.storage.port);
  console.info('[emulator] Firestore/Auth/Storage connected to local emulator', e);
} else {
  // Default DB: FORCE long-polling. `experimentalAutoDetectLongPolling` is
  // already the firebase-js-sdk v11 default, so it was in effect before this
  // line and was NOT enough — the same reason the `firestore-atc` DB below
  // force-long-polls: this network interferes with Firestore's WebChannel
  // streaming, and auto-detect can still stall the first-load Listen stream.
  // The stall is most visible with a SECOND concurrent tab on the same origin
  // (e.g. two Arena boards) — one tab's stream never establishes and that
  // board shows no data. Forcing long-polling uses a plain-XHR transport that
  // this network passes reliably, so every tab loads. Trade-off: slightly
  // chattier than streaming, applied app-wide — matches the ATC workaround.
  initializeFirestore(app, { experimentalForceLongPolling: true });
  // Named DB `firestore-atc`: force long-polling here — this is the canonical,
  // earliest initializer, so every consumer (getFirestore('firestore-atc') and
  // AtcFirebaseService) reuses this one instance with a consistent transport.
  // The network blocks Firestore WebChannel streaming, so long-polling avoids
  // the "RPC 'Listen' stream transport errored" first-load stall for all ATC screens.
  initializeFirestore(app, { experimentalForceLongPolling: true }, 'firestore-atc');
}

(window as any).process = {
  env: { DEBUG: undefined },
  version: '',
  nextTick: (fn: any) => setTimeout(fn, 0),
};

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    appConfig.providers, provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch((err) => console.error(err));

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Each child in a list should have a unique')) {
    return; // suppress Zoom SDK's React key warning
  }
  originalWarn.apply(console, args);
};
