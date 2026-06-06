import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { connectFirestoreEmulator, getFirestore } from '@angular/fire/firestore';
import { connectAuthEmulator, getAuth } from '@angular/fire/auth';
import { connectStorageEmulator, getStorage } from '@angular/fire/storage';
import { initializeApp } from '@angular/fire/app';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

const app = initializeApp(environment.firebase);
const firestore = getFirestore(app);

// HERMETIC EMULATOR WIRING (no-op unless environment.useEmulators === true, i.e. the `emulator` build
// configuration / environment.emulator.ts). Connects the DEFAULT app's Firestore/Auth/Storage instances to
// the local emulator BEFORE bootstrap, so the AngularFire providers in app.config.ts (getFirestore()/getAuth()
// /getStorage() with no args) reuse these already-connected instances. Cloud/dev builds (no useEmulators flag)
// are completely unaffected. See e2e/scripts/deploy-cf-emulator.sh + environment.emulator.ts.
const emuEnv = environment as any;
if (emuEnv.useEmulators && emuEnv.emulators) {
  const e = emuEnv.emulators;
  if (e.firestore) connectFirestoreEmulator(firestore, e.firestore.host, e.firestore.port);
  if (e.auth) connectAuthEmulator(getAuth(app), e.auth.url, { disableWarnings: true });
  if (e.storage) connectStorageEmulator(getStorage(app), e.storage.host, e.storage.port);

  console.info('[emulator] Firestore/Auth/Storage connected to local emulator', e);
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

  
