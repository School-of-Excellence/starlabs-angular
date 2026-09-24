import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore,provideFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { routes } from './app.routes';
import { ApplicationConfig, provideZoneChangeDetection , importProvidersFrom } from '@angular/core';
// Import the BASE environment so angular.json fileReplacements swap it per build configuration
// (development -> environment.development.ts, emulator -> environment.emulator.ts). main.ts imports the
// same base environment and (in emulator mode) connects the default Firebase app to the emulator FIRST;
// these providers reuse that app. Importing the base (not .development) is what lets the `emulator` build
// pick up the emulator config — required for the hermetic e2e gate.
import { environment } from '../environments/environment';
import { provideHttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { FIREBASE_OPTIONS } from '@angular/fire/compat';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatNativeDateModule } from '@angular/material/core';
import { SafeImgDirective } from './shared/safe-img.directive';
import { provideMarkdown } from 'ngx-markdown';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirestore(() => {
      const fs = getFirestore();
      // BENCHMARK-ONLY: opt-in redirect to the local Firestore emulator. OFF by
      // default — normal dev/prod untouched. Enable with either:
      //   localStorage.setItem('USE_FS_EMULATOR','1')   (then reload), or
      //   append ?fsemu=1 to the URL.
      try {
        const on = (typeof localStorage !== 'undefined' && localStorage.getItem('USE_FS_EMULATOR') === '1')
          || (typeof location !== 'undefined' && location.search.includes('fsemu=1'));
        if (on) {
          connectFirestoreEmulator(fs, '127.0.0.1', 8080);
          console.warn('[BENCH] Firestore pointed at emulator 127.0.0.1:8080 — board data is synthetic.');
        }
      } catch { /* SSR / no window — ignore */ }
      return fs;
    }),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()),
    provideHttpClient(),
    provideMarkdown(),
    provideAnimationsAsync(),
    provideNativeDateAdapter(),
    DatePipe,
    importProvidersFrom(MatNativeDateModule),
    { provide: FIREBASE_OPTIONS, useValue: environment.firebase }
  ]
};