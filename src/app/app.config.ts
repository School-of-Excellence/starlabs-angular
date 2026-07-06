import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore,provideFirestore } from '@angular/fire/firestore';
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
    provideFirestore(()=>getFirestore()),
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