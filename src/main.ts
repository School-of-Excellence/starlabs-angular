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
  // Default DB: default transport (WebChannel streaming with v11 auto-detect
  // long-polling fallback). App-wide `experimentalForceLongPolling` was REMOVED
  // here (was added in 185e8412 for the two-tab Arena "second board shows no
  // data" stall) because it forced plain-XHR polling on EVERY default-DB read
  // app-wide, not just Arena. `firestore-atc` below is a separate DB instance
  // and still force-long-polls, so ATC screens are unaffected.
  // WATCH: if two concurrent Arena boards blank out on the production network,
  // WebChannel is stalling again — restore `{ experimentalForceLongPolling: true }`.
  initializeFirestore(app, {});
  // Named DB `firestore-atc`: AUTO-DETECT long-polling (canonical, earliest
  // initializer — every consumer reuses this instance with this transport).
  // CHANGED 2026-08-01 (live-event-dashboard perf, measured): the previous
  // experimentalForceLongPolling made every ATC backfill crawl on EVERY network
  // (~29 sequential polls, single polls 14-30s, ~50s for ~600 docs — the bulk
  // of the dashboard's 40-60s load). Auto-detect streams on healthy networks
  // and still falls back to long-polling BY ITSELF on networks that block
  // WebChannel streaming (the original "RPC 'Listen' stream transport errored"
  // venue incident), at the cost of a short first-load detection delay there.
  // REVERT to { experimentalForceLongPolling: true } if ATC screens blank out
  // at a venue again.
  initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, 'firestore-atc');
  // Named DB `firestore-forms`: same long-polling transport, same reason (blocked
  // WebChannel streaming). The ATC ops screens read participant form submissions
  // (formsByClient) to tell whether a config-stage own source exists. Initialized
  // here, at the earliest point, so getFirestore('firestore-forms') consumers reuse
  // this instance with a consistent transport.
  initializeFirestore(app, { experimentalForceLongPolling: true }, 'firestore-forms');
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
