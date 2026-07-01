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
  initializeFirestore(app, {});
  initializeFirestore(app, {}, 'firestore-atc');
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
